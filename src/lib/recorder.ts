/**
 * "Grave-se tocando": grava o microfone enquanto o playback toca e junta os dois depois,
 * já alinhados (o motor sabe que ponto da música estava saindo na caixa a cada instante).
 *
 * - Microfone sem processamento (sem cancelamento de eco/ruído) para não estragar o som do instrumento;
 *   sem fone, o músico liga "Estou sem fone" e o navegador tira o playback que vaza no microfone.
 * - O playback da gravação é renderizado das pistas (mesmo tom, velocidade e mixer), não do que vazou no mic.
 * - As gravações salvas ficam no aparelho (Cache Storage), com a lista no localStorage.
 */
import { audioEngine } from '@/audio/AudioEngine'
import type { StemState } from '@/types/player'

const MAX_SECONDS = 8 * 60

export interface RawTake {
  mic: Float32Array
  sampleRate: number
  /** ponto da música (s) que saía na caixa quando a primeira amostra do microfone foi captada */
  songStart: number
  songEnd: number
  /** atraso estimado do microfone (s): a gravação é puxada para trás nesse tanto */
  inputLatency: number
}

/**
 * Captura do microfone na thread de áudio (AudioWorklet): não perde amostras quando a tela está ocupada
 * (letra rolando, medidores). Cada bloco vem com o quadro exato do relógio de áudio em que foi captado.
 */
const CAPTURE_WORKLET = `
class PtCapture extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(2048); this.n = 0; this.start = 0; this.on = true
    this.port.onmessage = e => { if (e.data === 'stop') this.on = false } }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (ch) {
      if (this.n === 0) this.start = currentFrame
      this.buf.set(ch, this.n); this.n += ch.length
      if (this.n >= 2048) { this.port.postMessage({ frame: this.start, data: this.buf.slice(0, this.n) }); this.n = 0 }
    }
    return this.on
  }
}
registerProcessor('pt-capture', PtCapture)`
const workletReady = new WeakMap<BaseAudioContext, Promise<boolean>>()
function loadCaptureWorklet(ctx: AudioContext): Promise<boolean> {
  let p = workletReady.get(ctx)
  if (!p) {
    p = ctx.audioWorklet
      ? ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: 'text/javascript' }))).then(() => true, () => false)
      : Promise.resolve(false)
    workletReady.set(ctx, p)
  }
  return p
}

export class TakeRecorder {
  private stream: MediaStream | null = null
  private src: MediaStreamAudioSourceNode | null = null
  private node: AudioWorkletNode | ScriptProcessorNode | null = null
  private sink: GainNode | null = null
  private chunks: Float32Array[] = []
  private songStart = -1
  private captured = 0
  private inputLatency = 0.03
  private speed = 1
  private stopped = false
  /** nível do microfone agora (0..1), para o medidor */
  level = 0
  onAutoStop: ((reason: string) => void) | null = null

  /** Pede o microfone (antes do play, para o aviso de permissão não atrapalhar a contagem) */
  async open(echoCancel: boolean): Promise<void> {
    const ctx = audioEngine.audioContext
    if (!ctx) throw new Error('Toque na tela para ativar o som e tente de novo.')
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: echoCancel, noiseSuppression: echoCancel, autoGainControl: false, channelCount: 1 },
    })
    const lat = (this.stream.getAudioTracks()[0]?.getSettings() as any)?.latency
    this.inputLatency = typeof lat === 'number' && lat > 0 && lat < 0.5 ? lat : 0.03
    await loadCaptureWorklet(ctx)
  }

  /** Começa a captar (chamar com a música já tocando) */
  async start() {
    const ctx = audioEngine.audioContext!
    this.chunks = []; this.songStart = -1; this.captured = 0; this.stopped = false
    this.speed = audioEngine.speed
    this.src = ctx.createMediaStreamSource(this.stream!)
    this.sink = ctx.createGain(); this.sink.gain.value = 0
    if (await loadCaptureWorklet(ctx)) {
      const node = new AudioWorkletNode(ctx, 'pt-capture', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit' })
      node.port.onmessage = (e) => this.onChunk(e.data.frame / ctx.sampleRate, e.data.data)
      this.node = node
    } else {
      // aparelho sem AudioWorklet: captura pelo método antigo
      const proc = ctx.createScriptProcessor(4096, 1, 1)
      proc.onaudioprocess = (e) => this.onChunk(ctx.currentTime - 4096 / ctx.sampleRate, e.inputBuffer.getChannelData(0).slice())
      this.node = proc
    }
    this.src.connect(this.node); this.node.connect(this.sink); this.sink.connect(ctx.destination)
  }

  /** Um bloco do microfone, captado no instante `capturedAt` do relógio de áudio */
  private onChunk(capturedAt: number, data: Float32Array) {
    if (this.stopped) return
    const ctx = audioEngine.audioContext!
    let d = data
    if (this.songStart < 0) {
      if (!audioEngine.isPlaying) return
      // só começa quando a música está saindo na caixa (depois da contagem e da latência)
      const skip = Math.ceil((audioEngine.heardFromCtx - capturedAt) * ctx.sampleRate)
      if (skip >= d.length) return
      if (skip > 0) { d = d.subarray(skip); capturedAt += skip / ctx.sampleRate }
      this.songStart = audioEngine.songPosAt(capturedAt)
    } else {
      // a música pulou (seek, loop) ou parou: encerra a gravação no ponto certo
      const expected = this.songStart + (this.captured / ctx.sampleRate) * this.speed
      if (!audioEngine.isPlaying || Math.abs(audioEngine.songPosAt(capturedAt) - expected) > 0.6) { this.onAutoStop?.('jump'); return }
    }
    this.chunks.push(d)
    this.captured += d.length
    let sq = 0
    for (let i = 0; i < d.length; i += 4) sq += d[i] * d[i]
    this.level = Math.min(1, Math.sqrt(sq / (d.length / 4)) * 4)
    if (this.captured / ctx.sampleRate > MAX_SECONDS) this.onAutoStop?.('max')
  }

  get seconds(): number {
    const sr = audioEngine.audioContext?.sampleRate || 44100
    return this.captured / sr
  }

  /** Para e devolve o que foi gravado (null se não deu tempo de gravar nada) */
  stop(): RawTake | null {
    this.stopped = true
    if (this.node instanceof AudioWorkletNode) { this.node.port.postMessage('stop'); this.node.port.onmessage = null }
    else if (this.node) this.node.onaudioprocess = null
    try { this.node?.disconnect(); this.src?.disconnect(); this.sink?.disconnect() } catch {}
    this.node = null
    this.close()
    const sr = audioEngine.audioContext?.sampleRate || 44100
    if (this.songStart < 0 || this.captured < sr) return null
    const mic = new Float32Array(this.captured)
    let o = 0
    for (const c of this.chunks) { mic.set(c, o); o += c.length }
    this.chunks = []
    return { mic, sampleRate: sr, songStart: this.songStart, songEnd: this.songStart + (this.captured / sr) * this.speed, inputLatency: this.inputLatency }
  }

  close() {
    this.stream?.getTracks().forEach(t => t.stop())
    this.stream = null
    this.level = 0
  }
}

/** Playback da gravação: o trecho da música com o mesmo tom, velocidade e mixer que o músico ouviu */
export async function renderPlayback(take: RawTake, stemStates: Record<string, StemState>): Promise<AudioBuffer | null> {
  return audioEngine.renderMix(stemStates, { start: take.songStart, end: take.songEnd })
}

function rms(d: Float32Array): number {
  let sq = 0, n = 0
  for (let i = 0; i < d.length; i += 8) { sq += d[i] * d[i]; n++ }
  return n ? Math.sqrt(sq / n) : 0
}

/** Ganho que deixa o microfone num volume parecido com o do playback (o músico ajusta a partir daí) */
export function autoMicGain(take: RawTake, playback: AudioBuffer): number {
  const m = rms(take.mic), p = rms(playback.getChannelData(0))
  if (m < 1e-4) return 1
  return Math.max(0.5, Math.min(8, (p * 1.1) / m))
}

/**
 * Junta playback e microfone. syncMs: ajuste fino do músico (negativo puxa a gravação para antes).
 * Termina com um limitador simples para não estourar.
 */
export function mixTake(take: RawTake, playback: AudioBuffer, opts: { micGain: number; playbackGain: number; syncMs: number }): AudioBuffer {
  const sr = playback.sampleRate
  const shift = Math.round((-take.inputLatency + opts.syncMs / 1000) * sr)
  const length = playback.length
  const out = new AudioBuffer({ length, numberOfChannels: 2, sampleRate: sr })
  let peak = 0
  for (let c = 0; c < 2; c++) {
    const pb = playback.getChannelData(Math.min(c, playback.numberOfChannels - 1)), o = out.getChannelData(c)
    for (let i = 0; i < length; i++) {
      const k = i - shift
      const v = pb[i] * opts.playbackGain + (k >= 0 && k < take.mic.length ? take.mic[k] * opts.micGain : 0)
      o[i] = v
      const a = v < 0 ? -v : v
      if (a > peak) peak = a
    }
  }
  if (peak > 0.97) {
    const g = 0.97 / peak
    for (let c = 0; c < 2; c++) { const o = out.getChannelData(c); for (let i = 0; i < length; i++) o[i] *= g }
  }
  return out
}

// ─── Gravações salvas no aparelho ────────────────────────────────────────────

export interface SavedTake { id: string; trackId: string; title: string; artist: string; createdAt: number; seconds: number }
const LIST_KEY = 'pt-takes-v1'
const CACHE = 'pt-gravacoes-v1'
const urlOf = (id: string) => `/__gravacoes/${id}.mp3`

export function listTakes(): SavedTake[] {
  try { return JSON.parse(localStorage.getItem(LIST_KEY) || '[]') } catch { return [] }
}

export async function saveTake(meta: SavedTake, mp3: Blob): Promise<void> {
  const cache = await caches.open(CACHE)
  await cache.put(urlOf(meta.id), new Response(mp3, { headers: { 'Content-Type': 'audio/mpeg' } }))
  const list = [meta, ...listTakes().filter(t => t.id !== meta.id)].slice(0, 50)
  localStorage.setItem(LIST_KEY, JSON.stringify(list))
}

export async function loadTake(id: string): Promise<Blob | null> {
  try { const r = await (await caches.open(CACHE)).match(urlOf(id)); return r ? await r.blob() : null } catch { return null }
}

export async function deleteTake(id: string): Promise<void> {
  try { await (await caches.open(CACHE)).delete(urlOf(id)) } catch {}
  localStorage.setItem(LIST_KEY, JSON.stringify(listTakes().filter(t => t.id !== id)))
}

/** Compartilha (WhatsApp, Instagram...) ou baixa, quando o aparelho não tem compartilhamento de arquivo */
export async function shareOrDownload(blob: Blob, filename: string, text?: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], filename, { type: blob.type })
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], text }); return 'shared' } catch (e: any) { if (e?.name === 'AbortError') return 'cancelled' }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.style.display = 'none'
  document.body.appendChild(a); a.click()
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 1000)
  return 'downloaded'
}

// diagnóstico (testes e suporte)
if (typeof window !== 'undefined') (window as any).__pt = { ...(window as any).__pt, rec: { TakeRecorder, renderPlayback, mixTake } }

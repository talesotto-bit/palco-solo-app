/**
 * Motor de áudio do app (Web Audio puro).
 *
 * - Cada pista (stem) vira um AudioBuffer tocado por um AudioBufferSourceNode; todas usam o mesmo relógio.
 * - Velocidade: playbackRate em todas as pistas. O tom que a velocidade altera é corrigido no Signalsmith Stretch.
 * - Tom: Signalsmith Stretch no barramento mestre. Só entra no caminho quando tom ≠ 0 ou velocidade ≠ 1.
 * - Memória: pistas iguais nos dois canais viram mono, silêncio do começo e do fim é cortado e pistas
 *   totalmente mudas são descartadas. Assim músicas com muitas pistas cabem na memória do celular.
 * - Pistas de apoio (click, contagem) só são baixadas quando o músico liga.
 * - O tempo informado (currentTime) é o da música original, já descontando a latência do processamento
 *   e da saída de som (caixa Bluetooth), para a letra sincronizada bater com o que se ouve.
 */
import type { Stem } from '@/types/track'
import type { StemState } from '@/types/player'
import { getOfflineAudio, putOfflineAudio, isAvailableOffline } from '@/lib/offlineAudio'
import { detectInstrument } from '@/lib/stemDetection'

/**
 * Signalsmith Stretch (MIT) é servido como arquivo estático em /vendor: o código dele é enviado
 * para a thread de áudio como texto e a minificação do build quebraria isso.
 */
type StretchFactory = (ctx: BaseAudioContext, opts?: AudioWorkletNodeOptions) => Promise<StretchNode>
let stretchFactory: Promise<StretchFactory> | null = null
function loadStretchFactory(): Promise<StretchFactory> {
  if (!stretchFactory) {
    const url = `${location.origin}/vendor/signalsmith-stretch-1.3.2.mjs`
    stretchFactory = import(/* @vite-ignore */ url).then(m => m.default as StretchFactory)
    stretchFactory.catch(() => { stretchFactory = null })
  }
  return stretchFactory
}

type StretchNode = AudioWorkletNode & {
  start: (when?: number) => Promise<unknown>
  stop: (when?: number) => Promise<unknown>
  schedule: (opts: Record<string, number | boolean>) => Promise<unknown>
  latency: () => Promise<number>
  addBuffers: (buffers: Float32Array[]) => Promise<number>
}

interface LoadedStem {
  id: string
  label: string
  /** energia média da pista (para igualar o volume entre músicas) */
  ms?: number
  /** pista de apoio (click) ligada sob demanda: toca mesmo durante a prévia */
  lazyStarted?: boolean
  buffer: AudioBuffer
  /** segundos da música em que o buffer começa (silêncio inicial cortado) */
  offset: number
  gain: GainNode
  source: AudioBufferSourceNode | null
}

export type AudioEngineEvent =
  | { type: 'timeupdate'; currentTime: number; duration: number }
  | { type: 'ended' }
  | { type: 'error'; message: string }
  | { type: 'loaded' }
  | { type: 'loading'; loaded?: number; total?: number }
  | { type: 'background'; loaded: number; total: number }
  | { type: 'preview'; active: boolean }
  | { type: 'warning'; message: string }
  | { type: 'stemLoading'; id: string; active: boolean }
  | { type: 'pitchProcessing'; active: boolean }

type EventCallback = (event: AudioEngineEvent) => void
export type MediaHandlers = Partial<Record<'play' | 'pause' | 'next' | 'prev' | 'seek', (arg?: number) => void>>

const SILENCE = 0.001 // -60 dB
/**
 * Quantas pistas baixar ao mesmo tempo. Na internet lenta, poucas de cada vez (a base chega primeiro e o
 * play libera antes); na rápida, mais em paralelo.
 */
function fetchConcurrency(): number {
  const c = (navigator as any).connection
  const down = c?.downlink as number | undefined
  if (c?.saveData) return 2
  if (down !== undefined) return down < 3 ? 2 : down < 10 ? 3 : 6
  return 4
}
const FADE = 0.025

/** Pistas que não fazem parte do som do show e só carregam sob demanda */
export function isSupportStem(stem: Pick<Stem, 'id' | 'label'>): boolean {
  const s = `${stem.id} ${stem.label}`.toLowerCase()
  return /\b(click|clique|metronomo|metrônomo|contagem|count|cue)\b|click-|contagem-|-click|-contagem/.test(s)
}

/**
 * "Sem voz" (beta) para música inteira: tira o que está no centro do estéreo (onde fica a voz)
 * e devolve os graves do centro (baixo e bumbo). Funciona no aparelho, sem internet nem custo.
 */
async function karaokeBuffer(buf: AudioBuffer): Promise<AudioBuffer | null> {
  if (buf.numberOfChannels < 2) return null
  const Ctx = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext
  const ctx: OfflineAudioContext = new Ctx(2, buf.length, buf.sampleRate)
  const src = ctx.createBufferSource(); src.buffer = buf
  const split = ctx.createChannelSplitter(2); src.connect(split)
  const g = (v: number) => { const n = ctx.createGain(); n.gain.value = v; return n }
  const sideL = g(0.7), sideR = g(-0.7), side = g(1)
  split.connect(sideL, 0); split.connect(sideR, 1); sideL.connect(side); sideR.connect(side)
  const midL = g(0.5), midR = g(0.5), mid = g(1)
  split.connect(midL, 0); split.connect(midR, 1); midL.connect(mid); midR.connect(mid)
  const lp1 = ctx.createBiquadFilter(); lp1.type = 'lowpass'; lp1.frequency.value = 150
  const lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 150
  mid.connect(lp1); lp1.connect(lp2)
  const inv = g(-1); side.connect(inv)
  const merger = ctx.createChannelMerger(2)
  side.connect(merger, 0, 0); inv.connect(merger, 0, 1)
  lp2.connect(merger, 0, 0); lp2.connect(merger, 0, 1)
  merger.connect(ctx.destination)
  src.start()
  return ctx.startRendering()
}

/** Ordem de carregamento: base rítmica primeiro, pistas desligadas por último */
function stemPriority(stem: Stem, states: Record<string, StemState>): number {
  if (states[stem.id]?.muted) return 9
  const inst = detectInstrument(`${stem.label} ${stem.id}`.replace(/-/g, ' '))
  if (inst === 'drums' || inst === 'percussion') return 0
  if (inst === 'bass') return 1
  if (inst === 'keys' || inst === 'acoustic' || inst === 'guitar' || inst === 'main') return 2
  if (inst === 'voice') return 3
  return 4
}

async function pool<T>(items: T[], limit: number, fn: (item: T, i: number) => Promise<void>) {
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; await fn(items[i], i) }
  })
  await Promise.all(workers)
}

/** Corta silêncio do começo/fim e junta canais idênticos em mono. Retorna null se a pista é muda. */
/** Energia média (para igualar o volume entre músicas). Amostra 1 a cada 8: rápido no celular */
function meanSquare(buf: AudioBuffer, start = 0, end = buf.length, fullLength = buf.length): number {
  let sq = 0
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c)
    for (let i = start; i < end; i += 8) sq += d[i] * d[i]
  }
  return sq / (Math.ceil(fullLength / 8) * buf.numberOfChannels)
}

function optimizeBuffer(ctx: BaseAudioContext, buf: AudioBuffer): { buffer: AudioBuffer; offset: number; ms: number } | null {
  const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c))
  const len = buf.length
  let first = len, last = -1
  for (const d of chans) {
    for (let i = 0; i < first; i++) { if (d[i] > SILENCE || d[i] < -SILENCE) { first = i; break } }
    for (let i = len - 1; i > last; i--) { if (d[i] > SILENCE || d[i] < -SILENCE) { last = i; break } }
  }
  if (last < 0) return null
  const pad = Math.round(buf.sampleRate * 0.05)
  const start = Math.max(0, first - pad)
  const end = Math.min(len, last + pad)

  let mono = chans.length === 1
  if (chans.length === 2) {
    let diff = 0, level = 0
    const [l, r] = chans
    for (let i = start; i < end; i += 8) { const d = l[i] - r[i]; diff += d * d; level += l[i] * l[i] + r[i] * r[i] }
    mono = level === 0 || Math.sqrt(diff / (level / 2)) < 0.01
  }
  const outChannels = mono ? 1 : chans.length
  const ms = meanSquare(buf, start, end, len)
  // Pista já enxuta: devolve a mesma, sem cópia
  if (start === 0 && end === len && outChannels === chans.length) return { buffer: buf, offset: 0, ms }
  const out = ctx.createBuffer(outChannels, end - start, buf.sampleRate)
  for (let c = 0; c < outChannels; c++) out.copyToChannel(chans[c].subarray(start, end), c)
  return { buffer: out, offset: start / buf.sampleRate, ms }
}

/** Nível alvo (soma da energia das pistas ligadas): a mediana do acervo, assim o volume médio não muda */
const LOUDNESS_TARGET = 0.28
/** A prévia mixada (sem voz guia, com limitador) mede ~0,73× a soma das pistas: compensa para não mudar o volume na troca */
const MIX_TO_STEMS = 1.38

class AudioEngine {
  private ctx: AudioContext | null = null
  private mixBus: GainNode | null = null
  private norm: GainNode | null = null
  private limiter: DynamicsCompressorNode | null = null
  private normalizeOn = true
  private normGain = 1
  private master: GainNode | null = null
  private stretch: StretchNode | null = null
  private stretchPromise: Promise<StretchNode | null> | null = null
  private stretchLatency = 0
  private stretchActive = false
  private stretchFailed = false

  private stems = new Map<string, LoadedStem>()
  /** prévia mixada tocando enquanto as pistas chegam */
  private mix: LoadedStem | null = null
  private pending = new Map<string, Stem>() // pistas de apoio ainda não baixadas
  private stemStates: Record<string, StemState> = {}
  private listeners = new Set<EventCallback>()

  private _pitch = 0
  private _speed = 1
  private _volume = 0.85
  private _duration = 0
  private _loaded = false
  private _playing = false
  private anchorCtxTime = 0
  private anchorPos = 0
  private loadId = 0
  private timer: number | null = null
  private lastEmit = 0
  private countInNodes: AudioScheduledSourceNode[] = []

  constructor() {
    const unlock = () => { this.unlock() }
    ;['touchstart', 'touchend', 'click', 'keydown'].forEach(evt =>
      document.addEventListener(evt, unlock, { capture: true, passive: true }))
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {})
    })
  }

  // ─── Contexto e desbloqueio (iOS exige gesto do usuário) ──────────────────

  private ensureContext(): AudioContext {
    if (this.ctx) return this.ctx
    // iPhone: toca mesmo com a chave do silencioso ligada
    try { const s = (navigator as any).audioSession; if (s) s.type = 'playback' } catch {}
    const Ctx = window.AudioContext || (window as any).webkitAudioContext
    // 44,1 kHz é a taxa das músicas: decodifica sem reamostrar (menos memória e processamento)
    try { this.ctx = new Ctx({ latencyHint: 'playback', sampleRate: 44100 }) as AudioContext }
    catch { this.ctx = new Ctx({ latencyHint: 'playback' }) as AudioContext }
    this.master = this.ctx.createGain()
    this.master.gain.value = this._volume
    // volume igual entre músicas + limitador (não distorce a caixa)
    this.norm = this.ctx.createGain()
    this.limiter = this.ctx.createDynamicsCompressor()
    this.limiter.threshold.value = -2; this.limiter.knee.value = 0; this.limiter.ratio.value = 20
    this.limiter.attack.value = 0.002; this.limiter.release.value = 0.15
    this.master.connect(this.norm)
    this.norm.connect(this.limiter)
    this.limiter.connect(this.ctx.destination)
    this.mixBus = this.ctx.createGain()
    this.mixBus.connect(this.master)
    return this.ctx
  }

  /** Chamar em qualquer toque: libera o áudio e já prepara o processador de tom */
  async unlock(): Promise<boolean> {
    const ctx = this.ensureContext()
    if (ctx.state !== 'running') { try { await ctx.resume() } catch {} }
    if (ctx.state === 'running') void this.getStretch()
    return ctx.state === 'running'
  }

  private getStretch(): Promise<StretchNode | null> {
    if (this.stretch) return Promise.resolve(this.stretch)
    if (this.stretchFailed) return Promise.resolve(null)
    if (!this.stretchPromise) {
      const ctx = this.ensureContext()
      this.stretchPromise = loadStretchFactory()
        .then(factory => factory(ctx, { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] }))
        .then(async (node: StretchNode) => {
          this.stretch = node
          try { this.stretchLatency = (await node.latency()) || 0 } catch { this.stretchLatency = 0.1 }
          await node.schedule({ active: true, semitones: 0 })
          return node
        })
        .catch((err: unknown) => {
          console.warn('[AudioEngine] processador de tom indisponível:', err)
          this.stretchFailed = true
          return null
        })
    }
    return this.stretchPromise!
  }

  // ─── Eventos ─────────────────────────────────────────────────────────────

  on(cb: EventCallback) { this.listeners.add(cb); return () => this.listeners.delete(cb) }
  private emit(e: AudioEngineEvent) { this.listeners.forEach(cb => cb(e)) }

  // ─── Carregamento ────────────────────────────────────────────────────────

  private async fetchBytes(url: string, signalId: number): Promise<ArrayBuffer> {
    const offline = await getOfflineAudio(url)
    if (offline) return offline
    let lastErr: unknown
    for (let attempt = 0; attempt < 3; attempt++) {
      if (signalId !== this.loadId) throw new Error('cancelado')
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 60000)
      try {
        const resp = await fetch(url, { signal: ctrl.signal })
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const data = await resp.arrayBuffer()
        void putOfflineAudio(url, data.slice(0))
        return data
      } catch (err) {
        lastErr = err
        await new Promise(r => setTimeout(r, 800 * (attempt + 1)))
      } finally { clearTimeout(t) }
    }
    throw lastErr
  }

  private async loadStem(stem: Stem, signalId: number): Promise<LoadedStem | null> {
    const ctx = this.ensureContext()
    const bytes = await this.fetchBytes(stem.audioUrl, signalId)
    if (signalId !== this.loadId) return null
    const decoded = await new Promise<AudioBuffer>((resolve, reject) => {
      // forma com callbacks: funciona também no Safari antigo
      ctx.decodeAudioData(bytes, resolve, reject)
    })
    if (decoded.duration > this._duration) this._duration = decoded.duration
    const opt = optimizeBuffer(ctx, decoded)
    if (!opt || signalId !== this.loadId) return null
    const gain = ctx.createGain()
    gain.gain.value = this.targetGain(stem.id)
    gain.connect(this.mixBus!)
    return { id: stem.id, label: stem.label, buffer: opt.buffer, offset: opt.offset, gain, source: null, ms: opt.ms }
  }

  /**
   * Carrega a música. Libera o play assim que a base estiver pronta (bateria/baixo e boa parte das pistas);
   * o resto continua baixando e entra sozinho, no ponto certo, enquanto a música toca.
   */
  async load(stems: Stem[], initialStates?: Record<string, StemState>, opts?: { mixUrl?: string }): Promise<void> {
    const id = ++this.loadId
    this.disposeTrack()
    this.ensureContext()
    this.stemStates = initialStates ? { ...initialStates } : {}
    this.emit({ type: 'loading', loaded: 0, total: stems.length })

    // Pistas de apoio desligadas ficam para depois
    const now: Stem[] = []
    const derived = stems.filter(s => s.derive)
    for (const s of stems) {
      if (s.derive) continue
      const st = this.stemStates[s.id]
      if (isSupportStem(s) && (!st || st.muted)) this.pending.set(s.id, s)
      else now.push(s)
    }
    if (now.length === 0 && stems.length > 0) { now.push(stems[0]); this.pending.delete(stems[0].id) }
    // base primeiro: bateria, baixo, harmonia; o que está desligado por último
    now.sort((a, b) => stemPriority(a, this.stemStates) - stemPriority(b, this.stemStates))

    // Prévia mixada: um arquivo leve que toca na hora. Só quando as pistas ainda não estão no aparelho.
    const useMix = !!opts?.mixUrl && !isAvailableOffline(now.map(s => s.audioUrl))
    const mixP = useMix ? this.loadMix(opts!.mixUrl!, id).catch(err => { console.warn('[AudioEngine] prévia falhou:', err); return null }) : null

    const need = Math.min(now.length, Math.max(2, Math.ceil(now.length * 0.4)))
    const foundation = now.filter(s => stemPriority(s, this.stemStates) <= 1).slice(0, 2).map(s => s.id)
    let done = 0, failed = 0, ok = 0
    let markReady!: () => void
    const ready = new Promise<void>(r => { markReady = r })
    let isReady = false

    const becomeReady = () => {
      if (isReady || id !== this.loadId) return
      if (this.stems.size === 0 && !this.mix) return
      isReady = true
      this._loaded = true
      this.anchorPos = 0
      this.emit({ type: 'loaded' })
      this.emit({ type: 'timeupdate', currentTime: 0, duration: this._duration })
      markReady()
    }

    if (mixP) {
      // a prévia baixa sozinha primeiro (com a internet toda); as pistas começam em seguida
      const useMix = (mixStem: LoadedStem) => {
        this.mix = mixStem
        if (mixStem.buffer.duration > this._duration) this._duration = mixStem.buffer.duration
        this.emit({ type: 'preview', active: true })
        this.updateNorm()
        becomeReady()
      }
      const mixStem = await Promise.race([mixP, new Promise<null>(r => setTimeout(() => r(null), 8000))])
      if (id !== this.loadId) return
      if (mixStem) useMix(mixStem)
      // internet lenta: a prévia continua baixando junto com as pistas e toca assim que chegar
      // (antes o app desistia dela e esperava as pistas, que podem levar bem mais)
      else void mixP.then(m => { if (m && id === this.loadId && !isReady) useMix(m) })
    }

    const all = pool(now, fetchConcurrency(), async (s) => {
      try {
        const loaded = await this.loadStem(s, id)
        if (loaded && id === this.loadId) {
          this.stems.set(s.id, loaded)
          ok++
          this.updateNorm()
          // chegou com a música tocando: entra sincronizada (durante a prévia, espera a troca)
          if (this._playing && this.ctx && !this.mix) {
            const when = this.ctx.currentTime + 0.05
            this.startStem(loaded, this.anchorPos + (when - this.anchorCtxTime) * this._speed, when, this.ctx)
          }
        }
      } catch (err) {
        if (id === this.loadId) { failed++; console.error(`[AudioEngine] pista ${s.id} falhou:`, err) }
      }
      done++
      if (id !== this.loadId) return
      this.emit({ type: isReady ? 'background' : 'loading', loaded: done, total: now.length })
      const hasBase = foundation.every(f => this.stems.has(f) || failed > 0)
      if (!isReady && ok >= need && hasBase) becomeReady()
    })

    await Promise.race([ready, all])
    if (id !== this.loadId) return
    if (!isReady) {
      await all
      if (id !== this.loadId) return
      if (this.stems.size === 0) {
        this.emit({ type: 'error', message: 'Não foi possível carregar a música. Verifique sua conexão e tente de novo.' })
        return
      }
      becomeReady()
    }
    void all.then(async () => {
      if (id !== this.loadId) return
      if (this.mix) this.handoff()
      for (const d of derived) await this.buildDerived(d, stems, id)
      if (failed > 0) this.emit({ type: 'warning', message: `${failed} pista(s) não carregaram. A música toca com as demais.` })
      this.emit({ type: 'background', loaded: now.length, total: now.length })
    })
  }

  /** Baixa (sem decodificar) as pistas de uma música para tocar sem espera e sem internet depois */
  async prefetch(urls: string[], onProgress?: (done: number, total: number) => void): Promise<number> {
    let done = 0, ok = 0
    await pool(urls, 2, async (url) => {
      try {
        if (!(await getOfflineAudio(url))) {
          const resp = await fetch(url)
          if (resp.ok) await putOfflineAudio(url, await resp.arrayBuffer())
          else throw new Error(String(resp.status))
        }
        ok++
      } catch {}
      done++
      onProgress?.(done, urls.length)
    })
    return ok
  }

  // ─── Relógio e reprodução ────────────────────────────────────────────────

  /** posição bruta na linha do tempo da música (o que está sendo enviado ao processamento) */
  private rawPosition(): number {
    if (!this.ctx || !this._playing) return this.anchorPos
    return this.anchorPos + Math.max(0, this.ctx.currentTime - this.anchorCtxTime) * this._speed
  }

  /** atraso entre o que o motor envia e o que sai da caixa, em segundos reais */
  private outputDelay(): number {
    const ctx = this.ctx as any
    const out = (ctx?.outputLatency || 0) + (ctx?.baseLatency || 0)
    return out + (this.stretchActive ? this.stretchLatency : 0)
  }

  get currentTime(): number {
    const p = this.rawPosition()
    if (!this._playing) return p
    return Math.max(0, p - this.outputDelay() * this._speed)
  }

  get duration(): number { return this._duration }
  get isPlaying(): boolean { return this._playing }
  get loaded(): boolean { return this._loaded }
  get pitch(): number { return this._pitch }
  get speed(): number { return this._speed }

  private startSources(pos: number, when: number) {
    const ctx = this.ctx!
    if (this.mix) {
      this.startStem(this.mix, pos, when, ctx)
      // pistas de apoio ligadas durante a prévia (click) tocam junto
      this.stems.forEach(st => { if (st.lazyStarted) this.startStem(st, pos, when, ctx) })
    } else {
      this.stems.forEach(st => this.startStem(st, pos, when, ctx))
    }
    this.anchorCtxTime = when
    this.anchorPos = pos
  }

  private startStem(st: LoadedStem, pos: number, when: number, ctx: AudioContext) {
    const rel = pos - st.offset
    if (rel >= st.buffer.duration) return
    const src = ctx.createBufferSource()
    src.buffer = st.buffer
    src.playbackRate.value = this._speed
    src.connect(st.gain)
    if (rel >= 0) src.start(when, rel)
    else src.start(when + -rel / this._speed, 0)
    src.onended = () => { try { src.disconnect() } catch {} ; if (st.source === src) st.source = null }
    st.source = src
  }

  private stopSources(when?: number) {
    this.stems.forEach(st => {
      if (st.source) { try { st.source.stop(when) } catch {} ; st.source = null }
    })
    if (this.mix?.source) { try { this.mix.source.stop(when) } catch {} ; this.mix.source = null }
  }

  /** Monta a pista calculada (ex.: "Sem voz") a partir da pista original já carregada */
  private async buildDerived(d: Stem, all: Stem[], signalId: number) {
    const srcStem = all.find(s => !s.derive && s.audioUrl === d.audioUrl)
    const src = srcStem && this.stems.get(srcStem.id)
    if (!src || signalId !== this.loadId) return
    try {
      const buf = await karaokeBuffer(src.buffer)
      if (!buf || signalId !== this.loadId) {
        if (!buf) this.emit({ type: 'warning', message: 'Esta música é mono: não dá para tirar a voz.' })
        return
      }
      const gain = this.ctx!.createGain()
      gain.gain.value = this.targetGain(d.id)
      gain.connect(this.mixBus!)
      const st: LoadedStem = { id: d.id, label: d.label, buffer: buf, offset: src.offset, gain, source: null, ms: meanSquare(buf) }
      this.stems.set(d.id, st)
      if (this._playing && this.ctx && !this.mix) {
        const when = this.ctx.currentTime + 0.05
        this.startStem(st, this.anchorPos + (when - this.anchorCtxTime) * this._speed, when, this.ctx)
      }
    } catch (err) {
      console.warn('[AudioEngine] sem voz falhou:', err)
    }
  }

  // ─── Loop A-B (ensaiar um trecho) ────────────────────────────────────────
  private loop: { a: number; b: number } | null = null
  setLoop(loop: { a: number; b: number } | null) {
    this.loop = loop && loop.b - loop.a >= 0.5 ? loop : null
    if (this.loop && this._playing) {
      const p = this.rawPosition()
      if (p < this.loop.a || p > this.loop.b) this.restartAt(this.loop.a)
    }
  }
  private checkLoop(): boolean {
    if (!this.loop || !this._playing) return false
    if (this.rawPosition() >= this.loop.b) { this.restartAt(this.loop.a); return true }
    return false
  }

  /** Liga/desliga o "volume igual entre as músicas" */
  setNormalize(on: boolean) { this.normalizeOn = on; this.updateNorm() }

  /** Ajusta o ganho para a música soar no mesmo volume das outras (considera as pistas ligadas) */
  private updateNorm() {
    if (!this.norm || !this.ctx) return
    let g = 1
    if (this.normalizeOn) {
      let e = 0
      if (this.mix?.ms) e = this.mix.ms * MIX_TO_STEMS * MIX_TO_STEMS
      else this.stems.forEach(st => { if (st.ms) { const v = this.targetGain(st.id); e += st.ms * v * v } })
      const rms = Math.sqrt(e)
      if (rms > 1e-4) g = Math.min(2.8, Math.max(0.3, LOUDNESS_TARGET / rms))
    }
    if (Math.abs(g - this.normGain) < 0.02) return
    this.normGain = g
    this.norm.gain.setTargetAtTime(g, this.ctx.currentTime, this._playing ? 0.4 : 0.01)
  }

  /** Baixa e decodifica a prévia mixada (sem cortar silêncio: precisa da linha do tempo inteira) */
  private async loadMix(url: string, signalId: number): Promise<LoadedStem | null> {
    const ctx = this.ensureContext()
    const bytes = await this.fetchBytes(url, signalId)
    if (signalId !== this.loadId) return null
    const buffer = await new Promise<AudioBuffer>((res, rej) => ctx.decodeAudioData(bytes, res, rej))
    const gain = ctx.createGain()
    gain.gain.value = 1
    gain.connect(this.mixBus!)
    return { id: '__mix', label: 'Prévia', buffer, offset: 0, gain, source: null, ms: meanSquare(buffer) }
  }

  /** Troca a prévia pelas pistas separadas, com uma transição curta (sem corte, no ponto exato) */
  private handoff() {
    const mix = this.mix
    if (!mix) return
    this.mix = null
    this.emit({ type: 'preview', active: false })
    this.updateNorm()
    if (!this._playing || !this.ctx) { try { mix.gain.disconnect() } catch {} ; return }
    const ctx = this.ctx
    const XF = 0.35
    const when = ctx.currentTime + 0.1
    const pos = this.anchorPos + (when - this.anchorCtxTime) * this._speed
    this.stems.forEach(st => {
      if (st.source) return // já tocando (ex.: click ligado durante a prévia)
      const g = st.gain.gain
      g.cancelScheduledValues(0); g.setValueAtTime(0, when); g.linearRampToValueAtTime(this.targetGain(st.id), when + XF)
      this.startStem(st, pos, when, ctx)
    })
    mix.gain.gain.setValueAtTime(1, when)
    mix.gain.gain.linearRampToValueAtTime(0, when + XF)
    try { mix.source?.stop(when + XF + 0.05) } catch {}
    setTimeout(() => { try { mix.gain.disconnect() } catch {} }, (XF + 0.6) * 1000)
  }

  private fadeTo(value: number, at: number, dur = FADE) {
    if (!this.master) return
    const g = this.master.gain
    g.cancelScheduledValues(at)
    g.setValueAtTime(g.value, at)
    g.linearRampToValueAtTime(value, at + dur)
  }

  /** Reinicia tudo na posição pos, com fade curto para não estalar (usado por seek, velocidade e tom) */
  private restartAt(pos: number) {
    const ctx = this.ctx!
    const t = ctx.currentTime
    this.fadeTo(0, t)
    this.stopSources(t + FADE)
    this.startSources(pos, t + FADE)
    this.fadeTo(this._volume, t + FADE)
  }

  async play(opts?: { countIn?: { beats: number; bpm: number } }): Promise<void> {
    if (!this._loaded || this._playing) return
    const ok = await this.unlock()
    if (!ok) { this.emit({ type: 'error', message: 'Toque na tela para ativar o som.' }); return }
    await this.applyRouting()
    const ctx = this.ctx!
    let when = ctx.currentTime + 0.05
    if (opts?.countIn && opts.countIn.bpm > 0) when = this.scheduleCountIn(when, opts.countIn.beats, opts.countIn.bpm)
    if (this.anchorPos >= this._duration - 0.2) this.anchorPos = 0
    this.master!.gain.cancelScheduledValues(ctx.currentTime)
    this.master!.gain.setValueAtTime(this._volume, ctx.currentTime)
    this.startSources(this.anchorPos, when)
    this._playing = true
    this.startTimer()
    this.updateMediaSession()
  }

  /** Contagem de entrada sintetizada (bipes no andamento da música). Retorna quando a música começa */
  private scheduleCountIn(start: number, beats: number, bpm: number): number {
    const ctx = this.ctx!
    const beat = 60 / (bpm * this._speed)
    // a música passa pelo processador de tom (latência); os bipes não, então atrasam igual
    const delay = this.stretchActive ? this.stretchLatency : 0
    for (let i = 0; i < beats; i++) {
      const t = start + delay + i * beat
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.frequency.value = i === 0 ? 1600 : 1100
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.004)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09)
      osc.connect(g); g.connect(this.ctx!.destination)
      osc.start(t); osc.stop(t + 0.1)
      this.countInNodes.push(osc)
    }
    return start + beats * beat
  }

  pause(): void {
    if (!this._playing) return
    const pos = this.rawPosition()
    const ctx = this.ctx!
    this.countInNodes.forEach(n => { try { n.stop() } catch {} }); this.countInNodes = []
    this.fadeTo(0, ctx.currentTime, 0.015)
    this.stopSources(ctx.currentTime + 0.02)
    this._playing = false
    // volta um pouquinho para compensar o que estava "no caminho" (latência)
    this.anchorPos = Math.max(0, Math.min(pos - this.outputDelay() * this._speed, this._duration))
    this.stopTimer()
    this.emit({ type: 'timeupdate', currentTime: this.anchorPos, duration: this._duration })
    this.updateMediaSession()
  }

  stop(): void {
    if (this._playing) {
      const ctx = this.ctx!
      this.countInNodes.forEach(n => { try { n.stop() } catch {} }); this.countInNodes = []
      this.fadeTo(0, ctx.currentTime, 0.015)
      this.stopSources(ctx.currentTime + 0.02)
    }
    this._playing = false
    this.anchorPos = 0
    this.stopTimer()
    this.emit({ type: 'timeupdate', currentTime: 0, duration: this._duration })
    this.updateMediaSession()
  }

  seek(seconds: number): void {
    const pos = Math.max(0, Math.min(seconds, Math.max(0, this._duration - 0.1)))
    if (this._playing) this.restartAt(pos)
    else this.anchorPos = pos
    this.emit({ type: 'timeupdate', currentTime: pos, duration: this._duration })
  }

  // ─── Tom e velocidade ────────────────────────────────────────────────────

  private needsStretch() { return Math.abs(this._pitch) > 0.01 || Math.abs(this._speed - 1) > 0.001 }

  private routing: Promise<void> = Promise.resolve()

  /** Coloca ou tira o processador de tom do caminho. Em fila: mudanças seguidas não se atropelam */
  private applyRouting(): Promise<void> {
    this.routing = this.routing.then(() => this.doRouting()).catch(() => {})
    return this.routing
  }

  private async doRouting(): Promise<void> {
    if (!this.mixBus || !this.master) return
    if (this.needsStretch()) {
      const node = await this.getStretch()
      if (!this.needsStretch()) return this.doRouting()
      if (!node) {
        if (Math.abs(this._pitch) > 0.01) this.emit({ type: 'warning', message: 'Este aparelho não suporta mudar o tom.' })
        return
      }
      const semis = this._pitch - 12 * Math.log2(this._speed)
      void node.schedule({ active: true, semitones: semis })
      if (!this.stretchActive) {
        this.mixBus.disconnect()
        this.mixBus.connect(node)
        node.disconnect()
        node.connect(this.master)
        this.stretchActive = true
      }
    } else if (this.stretchActive && this.stretch) {
      this.mixBus.disconnect()
      this.mixBus.connect(this.master)
      try { this.stretch.disconnect() } catch {}
      this.stretchActive = false
    }
  }

  setPitch(semitones: number): void {
    this._pitch = semitones
    void this.retune()
  }

  setSpeed(speed: number): void {
    if (Math.abs(speed - this._speed) < 0.0005) return
    const pos = this.rawPosition()
    this._speed = speed
    if (this._playing && this.ctx) {
      // re-ancora o relógio com a nova velocidade
      this.anchorPos = pos; this.anchorCtxTime = this.ctx.currentTime
    }
    void this.retune(true)
  }

  private async retune(speedChanged = false) {
    const wasActive = this.stretchActive
    const willBeActive = this.needsStretch()
    if (!this._playing || !this.ctx) { await this.applyRouting(); return }
    if (wasActive !== willBeActive || speedChanged) {
      // mudança de caminho ou de velocidade: reinicia as fontes com fade (sem estalo)
      const pos = this.rawPosition()
      await this.applyRouting()
      if (this._playing) this.restartAt(pos)
    } else {
      await this.applyRouting()
    }
  }

  resetPitch(): void { this.setPitch(0) }
  resetSpeed(): void { this.setSpeed(1) }

  setVolume(volume: number): void {
    this._volume = volume
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.02)
  }

  // ─── Mixer ───────────────────────────────────────────────────────────────

  private targetGain(id: string): number {
    const states = this.stemStates
    const st = states[id]
    if (!st) return 1
    const hasSolo = Object.values(states).some(s => s.solo)
    if (hasSolo) return st.solo ? st.volume : 0
    return st.muted ? 0 : st.volume
  }

  setStemStates(stemStates: Record<string, StemState>): void {
    this.stemStates = { ...stemStates }
    this.updateNorm()
    const t = this.ctx?.currentTime ?? 0
    this.stems.forEach(st => st.gain.gain.setTargetAtTime(this.targetGain(st.id), t, 0.015))
    // pista de apoio ligada pela primeira vez: baixa agora e entra no ponto certo
    this.pending.forEach((stem, id) => {
      if (this.targetGain(id) > 0) { this.pending.delete(id); void this.loadLazy(stem) }
    })
  }

  private async loadLazy(stem: Stem) {
    const id = this.loadId
    this.emit({ type: 'stemLoading', id: stem.id, active: true })
    try {
      const loaded = await this.loadStem(stem, id)
      if (!loaded || id !== this.loadId) return
      loaded.lazyStarted = true
      this.stems.set(stem.id, loaded)
      if (this._playing && this.ctx) {
        const when = this.ctx.currentTime + 0.05
        const pos = this.anchorPos + (when - this.anchorCtxTime) * this._speed
        this.startStem(loaded, pos, when, this.ctx)
      }
    } catch (err) {
      console.error('[AudioEngine] pista de apoio falhou:', err)
      this.emit({ type: 'warning', message: `Não foi possível carregar "${stem.label}".` })
    } finally {
      this.emit({ type: 'stemLoading', id: stem.id, active: false })
    }
  }

  setStemVolume(stemId: string, volume: number): void {
    const st = this.stemStates[stemId]
    if (st) this.setStemStates({ ...this.stemStates, [stemId]: { ...st, volume } })
  }

  resetMix(): void {
    const t = this.ctx?.currentTime ?? 0
    this.stems.forEach(st => st.gain.gain.setTargetAtTime(1, t, 0.03))
  }

  // ─── Tela bloqueada / fones Bluetooth (Media Session) ────────────────────

  private mediaHandlers: MediaHandlers = {}

  setMediaHandlers(h: MediaHandlers) {
    this.mediaHandlers = h
    const ms = (navigator as any).mediaSession
    if (!ms) return
    const set = (action: string, fn: ((d: any) => void) | null) => { try { ms.setActionHandler(action, fn) } catch {} }
    set('play', h.play ? () => h.play!() : null)
    set('pause', h.pause ? () => h.pause!() : null)
    set('nexttrack', h.next ? () => h.next!() : null)
    set('previoustrack', h.prev ? () => h.prev!() : null)
    set('seekto', h.seek ? (d: any) => h.seek!(d.seekTime) : null)
  }

  setMediaMetadata(meta: { title: string; artist: string; artwork?: string }) {
    const ms = (navigator as any).mediaSession
    const MM = (window as any).MediaMetadata
    if (!ms || !MM) return
    try {
      ms.metadata = new MM({ title: meta.title, artist: meta.artist,
        artwork: meta.artwork && !meta.artwork.startsWith('data:') ? [{ src: meta.artwork, sizes: '512x512' }] : [] })
    } catch {}
  }

  private updateMediaSession() {
    const ms = (navigator as any).mediaSession
    if (!ms) return
    try { ms.playbackState = this._playing ? 'playing' : 'paused' } catch {}
  }

  // ─── Atualização de tempo ────────────────────────────────────────────────

  private startTimer() {
    this.stopTimer()
    const tick = () => {
      if (!this._playing) return
      const now = performance.now()
      if (now - this.lastEmit > 60) {
        this.lastEmit = now
        this.checkLoop()
        const ct = this.currentTime
        this.emit({ type: 'timeupdate', currentTime: ct, duration: this._duration })
        if (this._duration > 0 && this.rawPosition() >= this._duration) {
          this.stop()
          this.emit({ type: 'ended' })
          return
        }
      }
      this.timer = requestAnimationFrame(tick)
    }
    this.timer = requestAnimationFrame(tick)
    // rAF para com a tela apagada: um intervalo garante o fim da música e o avanço do setlist
    this.fallbackTimer = window.setInterval(() => {
      if (this._playing && document.visibilityState !== 'visible' && this.rawPosition() >= this._duration) {
        this.stop(); this.emit({ type: 'ended' })
      }
    }, 500)
  }
  private fallbackTimer: number | null = null

  private stopTimer() {
    if (this.timer !== null) { cancelAnimationFrame(this.timer); this.timer = null }
    if (this.fallbackTimer !== null) { clearInterval(this.fallbackTimer); this.fallbackTimer = null }
  }

  // ─── Exportar a mixagem (com tom e velocidade) ───────────────────────────

  async exportMixdown(stemStates: Record<string, StemState>): Promise<Blob | null> {
    if (!this._loaded || this.stems.size === 0) return null
    try {
      const sr = this.ctx!.sampleRate
      const length = Math.ceil(this._duration * sr)
      const hasSolo = Object.values(stemStates).some(s => s.solo)
      const mixCtx = new OfflineAudioContext(2, length, sr)
      let audible = 0
      this.stems.forEach(st => {
        const s = stemStates[st.id]
        const vol = !s ? 1 : hasSolo ? (s.solo ? s.volume : 0) : (s.muted ? 0 : s.volume)
        if (vol <= 0) return
        audible++
        const src = mixCtx.createBufferSource(); src.buffer = st.buffer
        const g = mixCtx.createGain(); g.gain.value = vol * this._volume
        src.connect(g); g.connect(mixCtx.destination); src.start(st.offset)
      })
      if (!audible) return null
      let mixed = await mixCtx.startRendering()

      if (this.needsStretch() && !this.stretchFailed) {
        const outLen = Math.ceil(length / this._speed)
        const stCtx = new OfflineAudioContext(2, outLen, sr)
        const node = await (await loadStretchFactory())(stCtx, { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] })
        await node.addBuffers([mixed.getChannelData(0), mixed.getChannelData(1)])
        await node.schedule({ active: true, input: 0, output: 0, rate: this._speed, semitones: this._pitch })
        node.connect(stCtx.destination)
        mixed = await stCtx.startRendering()
      }
      const { encodeMp3 } = await import('@/lib/mp3Encoder')
      return encodeMp3(mixed)
    } catch (err) {
      console.error('[AudioEngine] exportar falhou:', err)
      return null
    }
  }

  // ─── Limpeza ─────────────────────────────────────────────────────────────

  private disposeTrack() {
    this.stopTimer()
    if (this._playing) this.stopSources()
    this._playing = false
    this.stems.forEach(st => { try { st.gain.disconnect() } catch {} })
    this.stems.clear()
    if (this.mix) { try { this.mix.source?.stop() } catch {} ; try { this.mix.gain.disconnect() } catch {} ; this.mix = null }
    this.pending.clear()
    this._loaded = false
    this._duration = 0
    this.anchorPos = 0
  }

  async dispose(): Promise<void> { this.loadId++; this.disposeTrack() }

  /**
   * Onde a voz guia começa a cantar (segundos), para alinhar a letra sincronizada com o playback.
   * null se a música não tem voz guia.
   */
  voiceStart(): number | null {
    for (const st of this.stems.values()) {
      const s = `${st.id} ${st.label}`.toLowerCase()
      if (/(voz|guia|vocal|voice|lead)/.test(s) && !/(back|coro|choir|bv|backing)/.test(s)) return st.offset + 0.05
    }
    return null
  }

  /** Diagnóstico (usado nos testes e no suporte) */
  stats() {
    let bytes = 0, mono = 0
    this.stems.forEach(st => { bytes += st.buffer.length * st.buffer.numberOfChannels * 4; if (st.buffer.numberOfChannels === 1) mono++ })
    return {
      stems: this.stems.size, pending: [...this.pending.keys()], mono, memoryMB: Math.round(bytes / 1e6), preview: !!this.mix, normGain: Math.round(this.normGain * 100) / 100,
      stretchActive: this.stretchActive, stretchLatency: this.stretchLatency, stretchFailed: this.stretchFailed,
      playing: this._playing, position: this.currentTime, duration: this._duration, speed: this._speed, pitch: this._pitch,
      ctxState: this.ctx?.state, sampleRate: this.ctx?.sampleRate,
      sources: [...this.stems.values()].filter(st => st.source).length,
    }
  }
}

export const audioEngine = new AudioEngine()
if (typeof window !== 'undefined') (window as any).__pt = { engine: audioEngine }

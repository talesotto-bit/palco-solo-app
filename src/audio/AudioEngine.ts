/**
 * Motor de áudio do app (Web Audio puro).
 *
 * - Cada pista (stem) vira um AudioBuffer tocado por um AudioBufferSourceNode; todas usam o mesmo relógio.
 * - Velocidade: playbackRate em todas as pistas. O tom que a velocidade altera é corrigido no Signalsmith Stretch.
 * - Tom: Signalsmith Stretch no barramento mestre. Só entra no caminho quando tom ≠ 0 ou velocidade ≠ 1.
 * - Bateria, percussão e click não mudam de tom (soariam metálicos): vão por um barramento próprio, atrasado
 *   igual ao processador para ficar no tempo. Com velocidade ≠ 1, um segundo processador só corrige a velocidade.
 * - Memória: cada pista guarda só os trechos com som (silêncio de 3 s ou mais não ocupa memória), pistas iguais
 *   nos dois canais viram mono e pistas mudas são descartadas. No celular há um orçamento: passou dele, as
 *   pistas seguintes viram mono e, no limite, as menos importantes ficam desligadas. Sem isso o Safari do
 *   iPhone fechava a página no meio do carregamento (uma música de 20 pistas chegava a 1,5 GB).
 * - Pistas de apoio (click, contagem, regência) só são baixadas quando o músico liga.
 * - Pan por pista e saída VS para a mesa: instrumental no R, click/contagem/regência no L (ver makePan).
 * - O tempo informado (currentTime) é o da música original, já descontando a latência do processamento
 *   e da saída de som (caixa Bluetooth), para a letra sincronizada bater com o que se ouve.
 */
import type { Stem } from '@/types/track'
import type { StemState } from '@/types/player'
import { getOfflineAudio, putOfflineAudio, isAvailableOffline } from '@/lib/offlineAudio'
import { audioCandidates } from '@/lib/audioHost'

/**
 * Curva do protetor de picos. A entrada chega pela metade (ganho 0,5), então a curva cobre ±2 do sinal real:
 * até 0,85 passa intacto; acima disso encosta suavemente em 0,99 (sem o "crack" de estouro digital).
 */
function softClipCurve(): Float32Array<ArrayBuffer> {
  const n = 4096, curve = new Float32Array(n)
  const knee = 0.85, room = 0.99 - knee
  for (let i = 0; i < n; i++) {
    const x = ((i / (n - 1)) * 2 - 1) * 2 // sinal real
    const a = Math.abs(x)
    curve[i] = Math.sign(x) * (a <= knee ? a : knee + room * Math.tanh((a - knee) / room))
  }
  return curve
}

import { detectInstrument } from '@/lib/stemDetection'
import { rhythmStemIds, followsPitch } from '@/lib/rhythmStems'
import { findSections, type SectionTrack, type SongSection } from '@/lib/songSections'
export type { SongSection }

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

/** Trecho com som de uma pista: o buffer e o segundo da música em que ele começa */
interface Chunk { buffer: AudioBuffer; at: number }

interface LoadedStem {
  id: string
  label: string
  /** energia média da pista (para igualar o volume entre músicas) */
  ms?: number
  /** pista de apoio (click) ligada sob demanda: toca mesmo durante a prévia */
  lazyStarted?: boolean
  /** trechos com som, em ordem (os silêncios longos entre eles não ocupam memória) */
  chunks: Chunk[]
  /** segundos da música em que a pista começa a ter som / termina */
  offset: number
  end: number
  gain: GainNode
  /** pan, criado só quando a pista sai do centro (no centro o caminho é direto) */
  pan?: Pan
  /** fontes tocando agora (uma por trecho) */
  sources: AudioBufferSourceNode[]
  /** ligada no barramento de ritmo (não muda de tom) */
  rhythm?: boolean
  /** medidor de nível (criado quando o mixer pede) */
  meter?: AnalyserNode
  meterBuf?: Float32Array
}

/** Pista decodificada, ainda sem ligação no motor (pré-carregamento da próxima música do show) */
interface DecodedStem { chunks: Chunk[]; offset: number; end: number; ms: number; duration: number }

/** Passou do limite de memória do aparelho: a pista fica desligada (o músico pode ligar depois) */
class OverBudget extends Error {}

/** Desliga a pista do barramento (com o pan, se tiver) */
const unplug = (st: LoadedStem) => { try { st.gain.disconnect() } catch {} ; try { st.pan?.out.disconnect() } catch {} }
const chunkBytes = (chunks: Chunk[]) => chunks.reduce((n, c) => n + c.buffer.length * c.buffer.numberOfChannels * 4, 0)

/** Parte da música (intro, verso, refrão...) detectada pelo som das pistas */
export interface SongAnalysis { peaks: number[]; sections: SongSection[] }

const stemsKey = (stems: Stem[]) => stems.map(s => s.audioUrl).join('|')
const isVoiceStem = (st: { id: string; label: string }) => {
  const s = `${st.id} ${st.label}`.toLowerCase()
  return /(voz|guia|vocal|voice|lead)/.test(s) && !/(back|coro|choir|bv|backing)/.test(s)
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
  /** pistas deixadas desligadas para caber na memória do aparelho */
  | { type: 'stemsSkipped'; ids: string[] }
  | { type: 'pitchProcessing'; active: boolean }
  /** o loop A-B voltou ao início (treino progressivo) */
  | { type: 'loopwrap' }

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
  return /\b(click|clique|metronomo|metrônomo|contagem|count|cue)\b|click-|contagem-|-click|-contagem|reg[eê]ncia/.test(s)
}

/** Pan de uma pista: os quatro caminhos L→L, R→L, L→R, R→R */
interface Pan { ll: GainNode; rl: GainNode; lr: GainNode; rr: GainNode; out: ChannelMergerNode }

/**
 * Pan que serve para a saída VS: no centro não mexe no som; indo para um lado, o outro canal some e se
 * soma no lado escolhido. Todo para a direita, a pista sai em mono no R com (L+R)/2 — sem passar do pico
 * original (o StereoPannerNode somaria L+R inteiros e estouraria).
 */
function makePan(ctx: BaseAudioContext, src: GainNode): Pan {
  // pista mono vira L=R antes de separar os canais (o separador trataria o mono como só L)
  src.channelCount = 2; src.channelCountMode = 'explicit'; src.channelInterpretation = 'speakers'
  const split = ctx.createChannelSplitter(2), out = ctx.createChannelMerger(2)
  const ll = ctx.createGain(), rl = ctx.createGain(), lr = ctx.createGain(), rr = ctx.createGain()
  src.connect(split)
  split.connect(ll, 0); split.connect(lr, 0); split.connect(rl, 1); split.connect(rr, 1)
  ll.connect(out, 0, 0); rl.connect(out, 0, 0); lr.connect(out, 0, 1); rr.connect(out, 0, 1)
  return { ll, rl, lr, rr, out }
}

function setPan(p: Pan, v: number, t: number) {
  const r = Math.max(0, Math.min(1, v)), l = Math.max(0, Math.min(1, -v))
  const set = (g: GainNode, x: number) => g.gain.setTargetAtTime(x, t, 0.015)
  set(p.ll, 1 - r - l / 2); set(p.rl, l / 2); set(p.rr, 1 - l - r / 2); set(p.lr, r / 2)
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

/** Muda velocidade e tom de uma mixagem pronta (exportação), fora do tempo real */
async function stretchOffline(buf: AudioBuffer, outLen: number, rate: number, semitones: number): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, outLen, buf.sampleRate)
  const node = await (await loadStretchFactory())(ctx, { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] })
  await node.addBuffers([buf.getChannelData(0), buf.getChannelData(1)])
  await node.schedule({ active: true, input: 0, output: 0, rate, semitones })
  node.connect(ctx.destination)
  return ctx.startRendering()
}

/** Ordem de carregamento: base rítmica primeiro, pistas desligadas por último */
function stemPriority(stem: Stem, states: Record<string, StemState>): number {
  if (states[stem.id]?.muted) return 9
  // click ligado (saída VS): sem ele o músico se perde; nunca fica de fora por falta de memória
  if (isSupportStem(stem)) return 0
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

/** Energia média (para igualar o volume entre músicas). Amostra 1 a cada 8: rápido no celular */
function meanSquare(buf: AudioBuffer, start = 0, end = buf.length, fullLength = buf.length): number {
  let sq = 0
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c)
    for (let i = start; i < end; i += 8) sq += d[i] * d[i]
  }
  return sq / (Math.ceil(fullLength / 8) * buf.numberOfChannels)
}

/** silêncio a partir deste tamanho (s) sai da memória; menor que isso fica dentro do trecho */
const GAP = 3
const BLOCK = 0.25

/**
 * Guarda só os trechos com som da pista (blocos de 0,25 s; silêncio de GAP s ou mais é descartado).
 * Pista igual nos dois canais vira mono; estéreo de verdade vira mono quando mono(bytesEmEstéreo) pedir
 * (o volume percebido é mantido). Retorna null se a pista é muda.
 */
function compactStem(ctx: BaseAudioContext, buf: AudioBuffer, mono: (stereoBytes: number) => boolean): { chunks: Chunk[]; ms: number } | null {
  const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c))
  const len = buf.length, sr = buf.sampleRate
  const B = Math.round(sr * BLOCK), nb = Math.ceil(len / B)
  const loud = new Uint8Array(nb)
  for (const d of chans) {
    for (let b = 0; b < nb; b++) {
      if (loud[b]) continue
      for (let i = b * B, e = Math.min(len, i + B); i < e; i++) if (d[i] > SILENCE || d[i] < -SILENCE) { loud[b] = 1; break }
    }
  }
  const regions: [number, number][] = []
  const gapBlocks = Math.round(GAP / BLOCK)
  let start = -1, lastLoud = -1
  for (let b = 0; b < nb; b++) {
    if (!loud[b]) {
      if (start >= 0 && b - lastLoud >= gapBlocks) { regions.push([start * B, Math.min(len, (lastLoud + 1) * B)]); start = -1 }
      continue
    }
    if (start < 0) start = b
    lastLoud = b
  }
  if (start >= 0) regions.push([start * B, Math.min(len, (lastLoud + 1) * B)])
  if (!regions.length) return null
  const kept = regions.reduce((n, [a, e]) => n + e - a, 0)

  let outChannels = chans.length, downmix = false, g = 1
  if (chans.length === 2) {
    const [l, r] = chans
    let diff = 0, level = 0, sum = 0
    for (const [a, e] of regions) for (let i = a; i < e; i += 8) {
      const d = l[i] - r[i], m = l[i] + r[i]
      diff += d * d; level += l[i] * l[i] + r[i] * r[i]; sum += m * m
    }
    if (level === 0 || Math.sqrt(diff / (level / 2)) < 0.01) outChannels = 1
    else if (mono(kept * 2 * 4)) {
      outChannels = 1; downmix = true
      // (L+R)/2 perde volume no que está aberto no estéreo: compensa para soar igual (no máximo +3 dB)
      g = sum > 0 ? Math.min(Math.SQRT2, Math.max(1, Math.sqrt((level / 2) / (sum / 4)))) : 1
    }
  }

  let chunks: Chunk[]
  if (regions.length === 1 && kept === len && outChannels === chans.length) chunks = [{ buffer: buf, at: 0 }] // já enxuta: sem cópia
  else chunks = regions.map(([a, e]) => {
    const out = ctx.createBuffer(outChannels, e - a, sr)
    if (downmix) {
      const m = out.getChannelData(0), [l, r] = chans, k = 0.5 * g
      for (let i = 0; i < e - a; i++) m[i] = (l[a + i] + r[a + i]) * k
    } else for (let c = 0; c < outChannels; c++) out.copyToChannel(chans[c].subarray(a, e), c)
    return { buffer: out, at: a / sr }
  })
  // energia como se a pista inteira estivesse tocando (os trechos cortados são silêncio)
  let sq = 0
  for (const { buffer } of chunks) for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c)
    for (let i = 0; i < d.length; i += 8) sq += d[i] * d[i]
  }
  return { chunks, ms: sq / (Math.ceil(len / 8) * outChannels) }
}

/** Celular com pouca memória (≤ 2 GB, quando o navegador informa) */
const LOW_MEMORY = typeof navigator !== 'undefined' && ((navigator as any).deviceMemory ?? 8) <= 2
/** Celular ou tablet (o Safari do iPhone não informa a memória: reconhece pelo aparelho) */
const MOBILE = typeof navigator !== 'undefined' &&
  (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent)))
/**
 * Modo econômico (celular): áudio interno a 32 kHz (~27% menos memória, som igual numa caixa de som)
 * e a próxima música do show pré-carregada só pela prévia mixada, não com todas as pistas.
 * Sem isso, uma música de 18 pistas ocupava ~675 MB e duas no show passavam de 1 GB: chiado e travamento.
 */
const COMPACT = LOW_MEMORY || MOBILE
const IOS = typeof navigator !== 'undefined' &&
  (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent)))
/**
 * Orçamento de áudio decodificado da música aberta (MB). Até `stereo` as pistas ficam em estéreo; depois,
 * mono (metade da memória, na caixa de som soa igual). Passou de `max`, as pistas que faltam (as menos
 * importantes, que carregam por último) ficam desligadas. O Safari do iPhone fecha a página por volta
 * de 1 a 1,5 GB, somando tudo o que a página usa; o Android informa a memória do aparelho.
 */
const BUDGET_MB = (() => {
  if (!COMPACT) return { stereo: Infinity, max: 3000 }
  if (IOS) return { stereo: 120, max: 400 }
  const mem = (typeof navigator !== 'undefined' && (navigator as any).deviceMemory) || 4
  return mem <= 2 ? { stereo: 100, max: 300 } : mem <= 4 ? { stereo: 250, max: 600 } : { stereo: 400, max: 900 }
})()

/** Nível alvo (soma da energia das pistas ligadas): a mediana do acervo, assim o volume médio não muda */
const LOUDNESS_TARGET = 0.28
/** A prévia mixada (sem voz guia, com limitador) mede ~0,73× a soma das pistas: compensa para não mudar o volume na troca */
const MIX_TO_STEMS = 1.38

class AudioEngine {
  private ctx: AudioContext | null = null
  private mixBus: GainNode | null = null
  private norm: GainNode | null = null
  private limiter: DynamicsCompressorNode | null = null
  private analyser: AnalyserNode | null = null
  private levelBuf: Float32Array | null = null
  private normalizeOn = true
  private normGain = 1
  private master: GainNode | null = null
  private stretch: StretchNode | null = null
  private stretchPromise: Promise<StretchNode | null> | null = null
  private stretchLatency = 0
  private stretchActive = false
  private stretchFailed = false
  /** barramento das pistas que não mudam de tom (bateria, percussão, click) */
  private rhythmBus: GainNode | null = null
  private rhythmDelay: DelayNode | null = null
  /** segundo processador: só corrige a velocidade das pistas de ritmo */
  private stretch2: StretchNode | null = null
  private stretch2Promise: Promise<StretchNode | null> | null = null
  private rhythmTarget: 'master' | 'main' | 'delay' | 'second' = 'master'
  private rhythmIds = new Set<string>()
  /** como a música termina no show: sem o silêncio do fim, com fade, ou num ponto escolhido (trecho/medley) */
  private ending: { trim: boolean; fade: number; end?: number } = { trim: false, fade: 0 }
  private fading = false
  /** todas as pistas chegaram (o fim real da música já é conhecido) */
  private allLoaded = false
  private preloaded: { key: string; stems: Map<string, DecodedStem> } | null = null
  /** modo econômico: a próxima música do show fica pronta só pela prévia mixada (um arquivo leve) */
  private preloadedMix: { key: string; buffer: AudioBuffer } | null = null
  private preloadId = 0

  /** memória (bytes) das pistas da música aberta, para o orçamento do aparelho */
  private memBytes = 0
  /** pistas que alimentam o "Sem voz": precisam continuar em estéreo */
  private keepStereo = new Set<string>()
  /** celular: uma decodificação por vez (cada uma ocupa a pista inteira em estéreo até ser enxugada) */
  private decodeLock: Promise<unknown> = Promise.resolve()

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
  /** saída VS: pistas sem pan escolhido vão para o R e as de apoio (click, regência) para o L */
  private vsOutput = false

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
    try { this.ctx = new Ctx({ latencyHint: 'playback', sampleRate: COMPACT ? 32000 : 44100 }) as AudioContext }
    catch { this.ctx = new Ctx({ latencyHint: 'playback' }) as AudioContext }
    this.master = this.ctx.createGain()
    this.master.gain.value = this._volume
    // volume igual entre músicas + limitador (não distorce a caixa)
    this.norm = this.ctx.createGain()
    this.limiter = this.ctx.createDynamicsCompressor()
    this.limiter.threshold.value = -3; this.limiter.knee.value = 0; this.limiter.ratio.value = 20
    this.limiter.attack.value = 0.001; this.limiter.release.value = 0.12
    this.master.connect(this.norm)
    this.norm.connect(this.limiter)
    // medidor de nível (luzes do palco reagem ao som) — fica no caminho, não altera o áudio
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 1024
    // protetor final: arredonda qualquer pico que escape do limitador (nunca estoura/distorce na caixa)
    const pre = this.ctx.createGain(); pre.gain.value = 0.5
    const clipper = this.ctx.createWaveShaper()
    clipper.curve = softClipCurve(); clipper.oversample = '2x'
    this.limiter.connect(pre); pre.connect(clipper)
    clipper.connect(this.analyser)
    this.analyser.connect(this.ctx.destination)
    this.mixBus = this.ctx.createGain()
    this.mixBus.connect(this.master)
    this.rhythmBus = this.ctx.createGain()
    this.rhythmBus.connect(this.master)
    this.rhythmDelay = this.ctx.createDelay(1)
    this.rhythmDelay.connect(this.master)
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

  private getStretch2(): Promise<StretchNode | null> {
    if (this.stretch2) return Promise.resolve(this.stretch2)
    if (!this.stretch2Promise) {
      const ctx = this.ensureContext()
      this.stretch2Promise = loadStretchFactory()
        .then(factory => factory(ctx, { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] }))
        .then(node => { this.stretch2 = node; node.connect(this.master!); return node })
        .catch((err: unknown) => {
          console.warn('[AudioEngine] segundo processador indisponível:', err)
          this.stretch2Promise = null
          return null
        })
    }
    return this.stretch2Promise
  }

  /** Barramento da pista: o do tom ou o de ritmo (escolha do músico ou bateria/percussão/click) */
  private busFor(id: string): GainNode {
    return followsPitch(id, this.rhythmIds, this.stemStates[id]?.followPitch) ? this.mixBus! : this.rhythmBus!
  }

  // ─── Eventos ─────────────────────────────────────────────────────────────

  on(cb: EventCallback) { this.listeners.add(cb); return () => this.listeners.delete(cb) }
  private emit(e: AudioEngineEvent) { this.listeners.forEach(cb => cb(e)) }

  // ─── Carregamento ────────────────────────────────────────────────────────

  private async fetchBytes(url: string, signalId: number | (() => boolean)): Promise<ArrayBuffer> {
    const stale = typeof signalId === 'function' ? signalId : () => signalId !== this.loadId
    const offline = await getOfflineAudio(url)
    if (offline) return offline
    let lastErr: unknown
    const urls = audioCandidates(url)
    for (let attempt = 0; attempt < 4; attempt++) {
      if (stale()) throw new Error('cancelado')
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 60000)
      try {
        // alterna entre o endereço novo e o antigo: o cliente nunca fica sem a música
        const resp = await fetch(urls[attempt % urls.length], { signal: ctrl.signal })
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const data = await resp.arrayBuffer()
        void putOfflineAudio(url, data.slice(0))
        return data
      } catch (err) {
        lastErr = err
        if (attempt < 3) await new Promise(r => setTimeout(r, urls.length > 1 && attempt === 0 ? 150 : 800 * attempt))
      } finally { clearTimeout(t) }
    }
    throw lastErr
  }

  /** No celular, uma de cada vez; no computador, em paralelo */
  private serialized<T>(fn: () => Promise<T>): Promise<T> {
    if (!COMPACT) return fn()
    const p = this.decodeLock.then(fn, fn)
    this.decodeLock = p.catch(() => {})
    return p
  }

  /**
   * Baixa, decodifica e enxuga uma pista.
   * budget: 'track' conta no orçamento da música aberta (e pode recusar com OverBudget); 'lazy' conta mas
   * nunca recusa (o músico ligou a pista); 'none' (pré-carregamento) não conta.
   */
  private async decodeStem(stem: Stem, stale: () => boolean, budget: 'track' | 'lazy' | 'none' = 'none'): Promise<DecodedStem | null> {
    const ctx = this.ensureContext()
    const bytes = await this.fetchBytes(stem.audioUrl, stale)
    return this.serialized(async () => {
      if (stale()) return null
      if (budget === 'track' && this.memBytes / 1e6 >= BUDGET_MB.max) throw new OverBudget()
      const decoded = await new Promise<AudioBuffer>((resolve, reject) => {
        // forma com callbacks: funciona também no Safari antigo
        ctx.decodeAudioData(bytes, resolve, reject)
      })
      const keep = this.keepStereo.has(stem.audioUrl)
      const opt = compactStem(ctx, decoded, stereoBytes => !keep && budget !== 'none' && (this.memBytes + stereoBytes) / 1e6 > BUDGET_MB.stereo)
      if (!opt || stale()) return null
      const size = chunkBytes(opt.chunks)
      if (budget === 'track' && (this.memBytes + size) / 1e6 > BUDGET_MB.max) throw new OverBudget()
      if (budget !== 'none') this.memBytes += size
      const last = opt.chunks[opt.chunks.length - 1]
      return { ...opt, offset: opt.chunks[0].at, end: last.at + last.buffer.duration, duration: decoded.duration }
    })
  }

  /** Liga uma pista decodificada no motor (volume, barramento de tom ou de ritmo) */
  private adoptStem(stem: Stem, d: DecodedStem): LoadedStem {
    if (d.duration > this._duration) this._duration = d.duration
    const gain = this.ctx!.createGain()
    gain.gain.value = this.targetGain(stem.id)
    const bus = this.busFor(stem.id)
    gain.connect(bus)
    const st: LoadedStem = { id: stem.id, label: stem.label, chunks: d.chunks, offset: d.offset, end: d.end, gain, sources: [], ms: d.ms, rhythm: bus === this.rhythmBus }
    this.applyPan(st)
    return st
  }

  private async loadStem(stem: Stem, signalId: number, budget: 'track' | 'lazy' = 'track'): Promise<LoadedStem | null> {
    const d = await this.decodeStem(stem, () => signalId !== this.loadId, budget)
    return d && signalId === this.loadId ? this.adoptStem(stem, d) : null
  }

  /**
   * Deixa a próxima música do show pronta enquanto esta toca: ela entra sem espera.
   * No computador decodifica as pistas. No celular decodifica só a prévia mixada: a música entra na hora
   * pela prévia e as pistas chegam por trás (duas músicas inteiras na memória travariam o aparelho).
   */
  async preload(stems: Stem[], states: Record<string, StemState>, mixUrl?: string): Promise<void> {
    if (!stems.length) return
    const key = stemsKey(stems)
    if (COMPACT) {
      if (!mixUrl || this.preloadedMix?.key === key) return
      const id = ++this.preloadId
      try {
        const ctx = this.ensureContext()
        const bytes = await this.fetchBytes(mixUrl, () => id !== this.preloadId)
        if (id !== this.preloadId) return
        const buffer = await new Promise<AudioBuffer>((res, rej) => ctx.decodeAudioData(bytes, res, rej))
        if (id === this.preloadId) this.preloadedMix = { key, buffer }
      } catch { /* entra pelo carregamento normal */ }
      return
    }
    if (this.preloaded?.key === key) return
    const id = ++this.preloadId
    const map = new Map<string, DecodedStem>()
    this.preloaded = { key, stems: map }
    const list = stems.filter(s => !s.derive && !((isSupportStem(s) && !states[s.id]) || states[s.id]?.muted))
    const stale = () => id !== this.preloadId
    await pool(list, 2, async (s) => {
      if (stale()) return
      try { const d = await this.decodeStem(s, stale); if (d && !stale()) map.set(s.id, d) } catch { /* carrega normal depois */ }
    })
  }

  /**
   * Carrega a música. Libera o play assim que a base estiver pronta (bateria/baixo e boa parte das pistas);
   * o resto continua baixando e entra sozinho, no ponto certo, enquanto a música toca.
   */
  async load(stems: Stem[], initialStates?: Record<string, StemState>, opts?: { mixUrl?: string }): Promise<void> {
    const id = ++this.loadId
    this.disposeTrack()
    this.ensureContext()
    const pre = this.preloaded?.key === stemsKey(stems) ? this.preloaded.stems : null
    const preMix = this.preloadedMix?.key === stemsKey(stems) ? this.preloadedMix.buffer : null
    this.preloaded = null
    this.preloadedMix = null
    this.preloadId++
    this.stemStates = initialStates ? { ...initialStates } : {}
    this.rhythmIds = rhythmStemIds(stems)
    this.emit({ type: 'loading', loaded: 0, total: stems.length })

    // Pistas de apoio desligadas ficam para depois
    const now: Stem[] = []
    const derived = stems.filter(s => s.derive)
    this.keepStereo = new Set(derived.map(d => d.audioUrl))
    const skipped: string[] = []
    for (const s of stems) {
      if (s.derive) continue
      const st = this.stemStates[s.id]
      // desligada (apoio ou instrumento que o músico toca): só baixa quando ligar — economiza memória e internet
      if ((isSupportStem(s) && !st) || st?.muted) this.pending.set(s.id, s)
      else now.push(s)
    }
    if (now.length === 0 && stems.length > 0) { now.push(stems[0]); this.pending.delete(stems[0].id) }
    // base primeiro: bateria, baixo, harmonia; o que está desligado por último
    now.sort((a, b) => stemPriority(a, this.stemStates) - stemPriority(b, this.stemStates))

    // Prévia mixada: um arquivo leve que toca na hora. Só quando as pistas ainda não estão no aparelho.
    // Prévia já decodificada (show no celular): entra na hora, mesmo com as pistas guardadas no aparelho.
    // saída VS: a prévia foi gerada com a regência misturada (iria para o R, na caixa); nessas músicas espera as pistas
    const mixOk = !(this.vsOutput && stems.some(s => /reg[eê]ncia/i.test(`${s.id} ${s.label}`)))
    const useMix = mixOk && (!!preMix || (!!opts?.mixUrl && !isAvailableOffline(now.map(s => s.audioUrl)) && !now.every(s => pre?.has(s.id))))
    const mixP = useMix && preMix ? Promise.resolve(this.mixFromBuffer(preMix))
      : useMix ? this.loadMix(opts!.mixUrl!, id).catch(err => { console.warn('[AudioEngine] prévia falhou:', err); return null }) : null

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
        if (mixStem.end > this._duration) this._duration = mixStem.end
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

    // celular: no máximo 3 pistas decodificando ao mesmo tempo (evita pico de memória na abertura)
    const all = pool(now, COMPACT ? Math.min(3, fetchConcurrency()) : fetchConcurrency(), async (s) => {
      try {
        const ready = pre?.get(s.id)
        if (ready) this.memBytes += chunkBytes(ready.chunks)
        const loaded = ready ? this.adoptStem(s, ready) : await this.loadStem(s, id)
        if (loaded && id === this.loadId) {
          this.stems.set(s.id, loaded)
          // click/regência ligados (saída VS): tocam já junto da prévia — a banda precisa do click desde o começo
          if (isSupportStem(s)) loaded.lazyStarted = true
          ok++
          this.updateNorm()
          // chegou com a música tocando: entra sincronizada (durante a prévia, espera a troca)
          if (this._playing && this.ctx && (!this.mix || loaded.lazyStarted)) {
            const when = this.ctx.currentTime + 0.05
            this.startStem(loaded, this.anchorPos + (when - this.anchorCtxTime) * this._speed, when, this.ctx)
          }
        }
      } catch (err) {
        if (id !== this.loadId) { /* música trocada */ }
        else if (err instanceof OverBudget) {
          // desligada já (senão o próximo ajuste do mixer tentaria carregar); o músico pode ligar depois
          skipped.push(s.id)
          this.stemStates[s.id] = { ...(this.stemStates[s.id] ?? { id: s.id, solo: false, volume: 1 }), muted: true }
          this.pending.set(s.id, s)
          this.emit({ type: 'stemsSkipped', ids: [s.id] })
        }
        else { failed++; console.error(`[AudioEngine] pista ${s.id} falhou:`, err) }
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
      this.allLoaded = true
      if (this.mix) this.handoff()
      for (const d of derived) await this.buildDerived(d, stems, id)
      if (failed > 0) this.emit({ type: 'warning', message: `${failed} pista(s) não carregaram. A música toca com as demais.` })
      if (skipped.length) this.emit({ type: 'warning', message: `Música com muitas pistas: ${skipped.length} das menos importantes ficaram desligadas para o celular não travar. Ligue no mixer se precisar.` })
      this.emit({ type: 'background', loaded: now.length, total: now.length })
    })
  }

  /** Baixa (sem decodificar) as pistas de uma música para tocar sem espera e sem internet depois */
  async prefetch(urls: string[], onProgress?: (done: number, total: number) => void): Promise<number> {
    let done = 0, ok = 0
    await pool(urls, 2, async (url) => {
      try {
        if (!(await getOfflineAudio(url))) {
          let saved = false
          for (const [i, u] of [...audioCandidates(url), ...audioCandidates(url)].entries()) {
            try {
              const resp = await fetch(u)
              if (resp.ok) { await putOfflineAudio(url, await resp.arrayBuffer()); saved = true; break }
            } catch { /* tenta o próximo */ }
            await new Promise(r => setTimeout(r, 400 * (i + 1)))
          }
          if (!saved) throw new Error('falhou')
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

  /** Onde o som de verdade acaba (sem o silêncio do fim do arquivo) */
  get contentEnd(): number {
    let e = 0
    this.stems.forEach(st => { if (!isSupportStem(st)) e = Math.max(e, st.end) })
    return e || this._duration
  }

  /**
   * Como a música termina (usado no show): trim = sem o silêncio do fim; fade = segundos de fade no final;
   * end = parar neste ponto (trecho de medley).
   */
  setEnding(e: { trim?: boolean; fade?: number; end?: number }) {
    this.ending = { trim: !!e.trim, fade: e.fade || 0, end: e.end && e.end > 0 ? e.end : undefined }
    this.fading = false
  }

  private endPos(): number {
    let e = this._duration
    if ((this.ending.trim || this.ending.fade) && this.allLoaded && !this.mix) e = Math.min(e, this.contentEnd)
    if (this.ending.end) e = Math.min(e, this.ending.end)
    return e
  }

  /** Instante (relógio de áudio) em que o som do play atual começa a sair na caixa (depois da contagem) */
  get heardFromCtx(): number { return this.anchorCtxTime + this.outputDelay() }

  /** Posição da música que estava saindo na caixa num instante do relógio de áudio (gravação) */
  songPosAt(ctxTime: number): number {
    if (!this._playing) return this.anchorPos
    return this.anchorPos + (ctxTime - this.anchorCtxTime) * this._speed - this.outputDelay() * this._speed
  }
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

  /** Agenda os trechos da pista a partir da posição pos (os que já passaram ficam de fora) */
  private startStem(st: LoadedStem, pos: number, when: number, ctx: AudioContext) {
    for (const c of st.chunks) {
      const rel = pos - c.at
      if (rel >= c.buffer.duration) continue
      const src = ctx.createBufferSource()
      src.buffer = c.buffer
      src.playbackRate.value = this._speed
      src.connect(st.gain)
      if (rel >= 0) src.start(when, rel)
      else src.start(when + -rel / this._speed, 0)
      src.onended = () => { try { src.disconnect() } catch {} ; const i = st.sources.indexOf(src); if (i >= 0) st.sources.splice(i, 1) }
      st.sources.push(src)
    }
  }

  private stopStem(st: LoadedStem, when?: number) {
    for (const src of st.sources) { try { src.stop(when) } catch {} }
    st.sources = []
  }

  private stopSources(when?: number) {
    this.stems.forEach(st => this.stopStem(st, when))
    if (this.mix) this.stopStem(this.mix, when)
  }

  /** Monta a pista calculada (ex.: "Sem voz") a partir da pista original já carregada */
  private async buildDerived(d: Stem, all: Stem[], signalId: number) {
    const srcStem = all.find(s => !s.derive && s.audioUrl === d.audioUrl)
    const src = srcStem && this.stems.get(srcStem.id)
    if (!src || signalId !== this.loadId) return
    try {
      const chunks: Chunk[] = []
      for (const c of src.chunks) {
        const buf = await karaokeBuffer(c.buffer)
        if (!buf) { this.emit({ type: 'warning', message: 'Esta música é mono: não dá para tirar a voz.' }); return }
        if (signalId !== this.loadId) return
        chunks.push({ buffer: buf, at: c.at })
      }
      let sq = 0, n = 0
      for (const c of chunks) { const m = meanSquare(c.buffer); sq += m * c.buffer.length; n += c.buffer.length }
      const gain = this.ctx!.createGain()
      gain.gain.value = this.targetGain(d.id)
      const bus = this.busFor(d.id)
      gain.connect(bus)
      const st: LoadedStem = { id: d.id, label: d.label, chunks, offset: src.offset, end: src.end, gain, sources: [], ms: n ? sq / n : 0, rhythm: bus === this.rhythmBus }
      this.applyPan(st)
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
    if (this.rawPosition() >= this.loop.b) { this.restartAt(this.loop.a); this.emit({ type: 'loopwrap' }); return true }
    return false
  }

  /** Nível do som agora (0 a ~1), para as luzes do palco */
  getLevel(): number {
    if (!this.analyser || !this._playing) return 0
    if (!this.levelBuf || this.levelBuf.length !== this.analyser.fftSize) this.levelBuf = new Float32Array(this.analyser.fftSize)
    this.analyser.getFloatTimeDomainData(this.levelBuf as Float32Array<ArrayBuffer>)
    let sq = 0
    for (let i = 0; i < this.levelBuf.length; i += 2) sq += this.levelBuf[i] * this.levelBuf[i]
    return Math.sqrt(sq / (this.levelBuf.length / 2))
  }

  /**
   * Nível real de uma pista agora (0 a 1, em escala de dB), para os medidores do mixer.
   * null quando a pista não está tocando (prévia, parada, ainda chegando).
   */
  getStemLevel(id: string): number | null {
    const st = this.stems.get(id)
    if (!st || !this.ctx || !this._playing || !st.sources.length) return null
    if (!st.meter) {
      st.meter = this.ctx.createAnalyser()
      st.meter.fftSize = 512
      st.meterBuf = new Float32Array(512)
      st.gain.connect(st.meter)
    }
    const buf = st.meterBuf as Float32Array<ArrayBuffer>
    st.meter.getFloatTimeDomainData(buf)
    let sq = 0
    for (let i = 0; i < buf.length; i++) sq += buf[i] * buf[i]
    const db = 20 * Math.log10(Math.sqrt(sq / buf.length) + 1e-6)
    return Math.max(0, Math.min(1, (db + 48) / 45))
  }

  /**
   * Forma de onda (para a barra de progresso) e partes da música (intro, verso, refrão, solo, final).
   * Calculado pelo som das pistas separadas: a voz guia mostra onde se canta, a energia mostra o refrão.
   */
  analyze(): SongAnalysis | null {
    const stems = [...this.stems.values()].filter(st => !isSupportStem(st))
    const src = stems.length ? stems : this.mix ? [this.mix] : []
    if (!src.length || !this._duration) return null
    const HOP = 0.5
    const n = Math.ceil(this._duration / HOP)
    // nível de cada pista a cada meio segundo (1 amostra a cada 16: rápido no celular)
    const tracks: SectionTrack[] = src.map(st => {
      const rms = new Float32Array(n)
      // trechos cortados são silêncio: o meio segundo que cai na borda de um trecho conta só a parte com som
      for (const ch of st.chunks) {
        const sr = ch.buffer.sampleRate, d = ch.buffer.getChannelData(0), per = Math.round(HOP * sr), full = Math.ceil(per / 16)
        for (let f = Math.max(0, Math.floor(ch.at / HOP)); f < n; f++) {
          const a = Math.round((f * HOP - ch.at) * sr)
          if (a >= d.length) break
          let sq = 0
          for (let i = Math.max(0, a); i < Math.min(d.length, a + per); i += 16) sq += d[i] * d[i]
          rms[f] = Math.sqrt(rms[f] * rms[f] + sq / full)
        }
      }
      return { rms, voice: st !== this.mix && isVoiceStem(st) }
    })
    // forma de onda: 160 barras (energia somada)
    const energy = new Float32Array(n)
    for (const t of tracks) for (let f = 0; f < n; f++) energy[f] += t.rms[f] * t.rms[f]
    const BINS = 160, peaks: number[] = []
    let max = 0
    for (let b = 0; b < BINS; b++) {
      let m = 0
      const from = Math.floor(b * n / BINS), to = Math.max(from + 1, Math.floor((b + 1) * n / BINS))
      for (let f = from; f < to; f++) m = Math.max(m, Math.sqrt(energy[f] || 0))
      peaks.push(m); max = Math.max(max, m)
    }
    return {
      peaks: peaks.map(v => (max > 0 ? Math.pow(v / max, 0.75) : 0)),
      sections: findSections(tracks, HOP),
    }
  }

  /** Contexto de áudio (para efeitos do palco, como os aplausos de ensaio) */
  get audioContext(): AudioContext | null { return this.ctx }

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
    return this.mixFromBuffer(buffer)
  }

  private mixFromBuffer(buffer: AudioBuffer): LoadedStem {
    const gain = this.ctx!.createGain()
    gain.gain.value = 1
    gain.connect(this.mixBus!)
    const st: LoadedStem = { id: '__mix', label: 'Prévia', chunks: [{ buffer, at: 0 }], offset: 0, end: buffer.duration, gain, sources: [], ms: meanSquare(buffer) }
    // saída VS: a prévia (só instrumental) vai para o R até as pistas chegarem
    this.applyPan(st)
    return st
  }

  /** Troca a prévia pelas pistas separadas, com uma transição curta (sem corte, no ponto exato) */
  private handoff() {
    const mix = this.mix
    if (!mix) return
    this.mix = null
    this.emit({ type: 'preview', active: false })
    this.updateNorm()
    if (!this._playing || !this.ctx) { unplug(mix); return }
    const ctx = this.ctx
    const XF = 0.35
    const when = ctx.currentTime + 0.1
    const pos = this.anchorPos + (when - this.anchorCtxTime) * this._speed
    this.stems.forEach(st => {
      if (st.sources.length) return // já tocando (ex.: click ligado durante a prévia)
      const g = st.gain.gain
      g.cancelScheduledValues(0); g.setValueAtTime(0, when); g.linearRampToValueAtTime(this.targetGain(st.id), when + XF)
      this.startStem(st, pos, when, ctx)
    })
    mix.gain.gain.setValueAtTime(1, when)
    mix.gain.gain.linearRampToValueAtTime(0, when + XF)
    this.stopStem(mix, when + XF + 0.05)
    setTimeout(() => unplug(mix), (XF + 0.6) * 1000)
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
    this.fading = false
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
    this.fading = false
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
      osc.connect(g)
      // saída VS: a contagem vai junto do click, no L
      if (this.vsOutput && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = -1; g.connect(p); p.connect(ctx.destination) }
      else g.connect(ctx.destination)
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
    await this.routeRhythm()
  }

  /**
   * Caminho das pistas de ritmo:
   * - sem processamento: direto;
   * - só velocidade: pelo mesmo processador (ele só corrige a velocidade);
   * - tom com velocidade normal: atraso igual ao do processador (som original, no tempo);
   * - tom e velocidade: segundo processador, que só corrige a velocidade.
   */
  private async routeRhythm(): Promise<void> {
    const bus = this.rhythmBus!, master = this.master!
    let want: typeof this.rhythmTarget = !this.stretchActive ? 'master'
      : Math.abs(this._pitch) <= 0.01 ? 'main'
      : Math.abs(this._speed - 1) <= 0.001 ? 'delay' : 'second'
    let second: StretchNode | null = null
    if (want === 'second') {
      second = await this.getStretch2()
      if (!second) want = 'main'
      else void second.schedule({ active: true, semitones: -12 * Math.log2(this._speed) })
    }
    if (want === 'delay') this.rhythmDelay!.delayTime.value = this.stretchLatency
    if (want === this.rhythmTarget) return
    bus.disconnect()
    if (want === 'master') bus.connect(master)
    else if (want === 'main') bus.connect(this.stretch!)
    else if (want === 'delay') bus.connect(this.rhythmDelay!)
    else bus.connect(second!)
    // processador parado quando ninguém usa (não gasta bateria do celular)
    if (want !== 'second' && this.stretch2) void this.stretch2.schedule({ active: false })
    this.rhythmTarget = want
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
      const rhythmWas = this.rhythmTarget
      await this.applyRouting()
      // a bateria trocou de caminho (ex.: tom saiu do zero com velocidade alterada): reinicia sem estalo
      if (this._playing && this.rhythmTarget !== rhythmWas) this.restartAt(this.rawPosition())
    }
  }

  resetPitch(): void { this.setPitch(0) }
  resetSpeed(): void { this.setSpeed(1) }

  setVolume(volume: number): void {
    this._volume = volume
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.02)
  }

  // ─── Mixer ───────────────────────────────────────────────────────────────

  /** Pan da pista: o escolhido pelo músico; sem escolha, centro (ou o lado da saída VS) */
  private panOf(st: LoadedStem): number {
    const p = this.stemStates[st.id]?.pan
    if (p !== undefined) return p
    return this.vsOutput ? (isSupportStem(st) ? -1 : 1) : 0
  }

  private applyPan(st: LoadedStem) {
    const v = this.panOf(st)
    if (!this.ctx || (!st.pan && Math.abs(v) < 0.01)) return
    if (!st.pan) {
      st.gain.disconnect()
      st.pan = makePan(this.ctx, st.gain)
      st.pan.out.connect(st.rhythm ? this.rhythmBus! : this.mixBus!)
      if (st.meter) st.gain.connect(st.meter)
    }
    setPan(st.pan, v, this.ctx.currentTime)
  }

  /** Saída VS para a mesa: instrumental no R, click/contagem/regência no L (pistas com pan escolhido ficam como estão) */
  setVsOutput(on: boolean) {
    if (on === this.vsOutput) return
    this.vsOutput = on
    this.stems.forEach(st => this.applyPan(st))
    if (this.mix) this.applyPan(this.mix)
  }

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
    this.stems.forEach(st => {
      // desfaz a rampa da troca prévia → pistas (se estiver no meio): senão ela terminaria no volume antigo
      const g = st.gain.gain
      g.cancelScheduledValues(t); g.setValueAtTime(g.value, t)
      g.setTargetAtTime(this.targetGain(st.id), t, 0.015)
      // "acompanha o tom" mudou: troca de barramento (os dois caminhos têm o mesmo atraso, segue no tempo)
      const bus = this.busFor(st.id), rhythm = bus === this.rhythmBus
      if (rhythm !== !!st.rhythm) {
        const out = st.pan?.out ?? st.gain
        out.disconnect(); out.connect(bus)
        if (!st.pan && st.meter) st.gain.connect(st.meter)
        st.rhythm = rhythm
      }
      this.applyPan(st)
    })
    // pista de apoio ligada pela primeira vez: baixa agora e entra no ponto certo
    this.pending.forEach((stem, id) => {
      if (this.targetGain(id) > 0) { this.pending.delete(id); void this.loadLazy(stem) }
    })
  }

  private async loadLazy(stem: Stem) {
    const id = this.loadId
    this.emit({ type: 'stemLoading', id: stem.id, active: true })
    try {
      const loaded = await this.loadStem(stem, id, 'lazy')
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
        const end = this.endPos(), raw = this.rawPosition()
        // fade no final (show): começa alguns segundos antes do fim
        if (this.ending.fade > 0 && !this.fading && !this.loop && raw >= end - this.ending.fade * this._speed) {
          this.fading = true
          this.fadeTo(0, this.ctx!.currentTime, this.ending.fade)
        }
        if (this._duration > 0 && raw >= end) {
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
      if (this._playing && document.visibilityState !== 'visible' && this.rawPosition() >= this.endPos()) {
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
    try {
      const mixed = await this.renderMix(stemStates)
      if (!mixed) return null
      const { encodeMp3 } = await import('@/lib/mp3Encoder')
      return encodeMp3(mixed)
    } catch (err) {
      console.error('[AudioEngine] exportar falhou:', err)
      return null
    }
  }

  /**
   * Mixagem pronta (com tom e velocidade) da música inteira ou de um trecho [start, end] em segundos da música.
   * Bateria/percussão saem no tom original, como no player.
   */
  async renderMix(stemStates: Record<string, StemState>, range?: { start: number; end: number }): Promise<AudioBuffer | null> {
    if (!this._loaded || this.stems.size === 0) return null
    {
      const sr = this.ctx!.sampleRate
      const from = range ? Math.max(0, range.start) : 0
      const to = range ? Math.min(this._duration, range.end) : this._duration
      if (to - from < 0.2) return null
      const length = Math.ceil((to - from) * sr)
      const hasSolo = Object.values(stemStates).some(s => s.solo)
      const volOf = (id: string) => {
        const s = stemStates[id]
        return !s ? 1 : hasSolo ? (s.solo ? s.volume : 0) : (s.muted ? 0 : s.volume)
      }
      const audible = [...this.stems.values()].filter(st => volOf(st.id) > 0)
      if (!audible.length) return null
      const render = async (list: LoadedStem[]) => {
        if (!list.length) return null
        const mixCtx = new OfflineAudioContext(2, length, sr)
        list.forEach(st => {
          const g = mixCtx.createGain(); g.gain.value = volOf(st.id) * this._volume
          g.connect(mixCtx.destination)
          for (const c of st.chunks) {
            if (c.at >= to || c.at + c.buffer.duration <= from) continue
            const src = mixCtx.createBufferSource(); src.buffer = c.buffer
            src.connect(g)
            if (c.at >= from) src.start(c.at - from)
            else src.start(0, from - c.at)
          }
        })
        return mixCtx.startRendering()
      }
      const stretchOn = this.needsStretch() && !this.stretchFailed
      // como no player: com tom alterado, bateria/percussão saem no tom original (só a velocidade muda)
      const split = stretchOn && Math.abs(this._pitch) > 0.01
      const isRhythm = (st: LoadedStem) => split && !followsPitch(st.id, this.rhythmIds, stemStates[st.id]?.followPitch)
      const pitched = await render(audible.filter(st => !isRhythm(st)))
      const rhythm = await render(audible.filter(isRhythm))
      const outLen = Math.ceil(length / this._speed)
      const parts: AudioBuffer[] = []
      if (pitched) parts.push(stretchOn ? await stretchOffline(pitched, outLen, this._speed, this._pitch) : pitched)
      if (rhythm) parts.push(Math.abs(this._speed - 1) > 0.001 ? await stretchOffline(rhythm, outLen, this._speed, 0) : rhythm)
      const mixed = parts[0]
      for (const extra of parts.slice(1)) {
        for (let c = 0; c < 2; c++) {
          const out = mixed.getChannelData(c), add = extra.getChannelData(c)
          for (let i = 0, n = Math.min(out.length, add.length); i < n; i++) out[i] += add[i]
        }
      }
      return mixed
    }
  }

  // ─── Limpeza ─────────────────────────────────────────────────────────────

  private disposeTrack() {
    this.stopTimer()
    if (this._playing) this.stopSources()
    this._playing = false
    this.stems.forEach(unplug)
    this.stems.clear()
    if (this.mix) { this.stopStem(this.mix); unplug(this.mix); this.mix = null }
    this.memBytes = 0
    this.pending.clear()
    this.allLoaded = false
    this.fading = false
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
    let chunks = 0
    this.stems.forEach(st => { bytes += chunkBytes(st.chunks); chunks += st.chunks.length; if (st.chunks[0]?.buffer.numberOfChannels === 1) mono++ })
    return {
      stems: this.stems.size, pending: [...this.pending.keys()], mono, memoryMB: Math.round(bytes / 1e6), preview: !!this.mix, normGain: Math.round(this.normGain * 100) / 100,
      stretchActive: this.stretchActive, stretchLatency: this.stretchLatency, stretchFailed: this.stretchFailed,
      rhythmTarget: this.rhythmTarget, rhythmStems: [...this.stems.values()].filter(st => st.rhythm).map(st => st.id),
      playing: this._playing, position: this.currentTime, duration: this._duration, speed: this._speed, pitch: this._pitch,
      ctxState: this.ctx?.state, sampleRate: this.ctx?.sampleRate,
      sources: [...this.stems.values()].filter(st => st.sources.length).length, chunks,
    }
  }
}

export const audioEngine = new AudioEngine()
if (typeof window !== 'undefined') (window as any).__pt = { engine: audioEngine }

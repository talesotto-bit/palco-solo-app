/**
 * PlayerStore — estado global do player (Zustand), coordenado com o AudioEngine.
 * Também guarda a fila (setlist em execução) para avançar sozinho entre as músicas.
 */

import { create } from 'zustand'
import { toast } from 'sonner'
import { audioEngine, isSupportStem, type SongAnalysis } from '@/audio/AudioEngine'
import { useProgressStore } from './progressStore'
import { isLocked, useTrial } from '@/lib/trial'
import type { Track } from '@/types/track'
import type { PlayerState, StemState } from '@/types/player'
import { clamp } from '@/lib/utils'
import { AudioCache, isCacheUrl, urlToKey } from '@/lib/audioCache'
import { usePracticeStore } from '@/store/practiceStore'
import { useTrackSettingsStore } from './trackSettingsStore'
import { useStageSettings } from './stageSettingsStore'
import { usePrefsStore } from './prefsStore'
import { detectInstrument } from '@/lib/stemDetection'
import { suggestedShift } from '@/lib/artistVoice'

const LAST_TRACK_KEY = 'player-last-track-v1'

let _trackLoadId = 0
let _pendingPlay = false
let _advanceTimer: ReturnType<typeof setTimeout> | null = null

/** Tempo ouvido da música atual (vai para o progresso a cada ~10 s) e se já contou como tocada até o fim */
const _listen = { trackId: '', last: -1, acc: 0, counted: false, preloadFor: '' }
function flushListen() {
  if (_listen.trackId && _listen.acc > 0) useProgressStore.getState().addListen(_listen.trackId, _listen.acc)
  _listen.acc = 0
}
function resetListen(trackId: string) {
  flushListen()
  Object.assign(_listen, { trackId, last: -1, acc: 0, counted: false, preloadFor: '' })
}

export type QueueRange = { start?: number; end?: number } | undefined

/** Resolve cache:// URLs (músicas importadas do aparelho) para blob URLs reais */
async function resolveTrackUrls(track: Track): Promise<Track> {
  const cacheKeys = track.stems.filter(s => isCacheUrl(s.audioUrl)).map(s => urlToKey(s.audioUrl))
  if (!cacheKeys.length) return track
  const resolved = await AudioCache.resolveMany(cacheKeys)
  return {
    ...track,
    stems: track.stems.map(s => ({
      ...s,
      audioUrl: isCacheUrl(s.audioUrl) ? (resolved[urlToKey(s.audioUrl)] ?? s.audioUrl) : s.audioUrl,
    })),
  }
}

interface PlayerStore extends PlayerState {
  loadProgress: { loaded: number; total: number } | null
  /** pistas que ainda estão chegando depois do play liberado */
  bgProgress: { loaded: number; total: number } | null
  /** tocando a prévia mixada (pistas ainda chegando) */
  previewActive: boolean
  loadingStems: string[]
  queue: Track[]
  queueIndex: number
  /** trecho repetido para ensaiar (segundos da música) */
  loop: { a: number; b: number | null } | null
  /** sugestão de tom pela voz do músico (ex.: música de cantora para voz masculina) */
  keySuggestion: { shift: number; applied: boolean } | null
  applyKeySuggestion: () => void
  loopTap: () => void
  clearLoop: () => void
  /** treino progressivo: a cada volta do loop a velocidade sobe até 100% */
  trainer: { orig: number; step: number } | null
  startTrainer: (from?: number) => void
  stopTrainer: () => void
  toggleNoVocals: () => void
  /** forma de onda e partes da música (intro, verso, refrão...) */
  analysis: SongAnalysis | null
  /** repete um trecho exato (ex.: uma parte da música) */
  loopRange: (a: number, b: number) => void
  /** trecho de cada música do show (medley): começa/termina em pontos escolhidos */
  queueRanges: QueueRange[]
  /** aplica no motor o jeito de terminar a música (show) */
  applyEnding: () => void
  /** próxima música agendada (contagem regressiva entre músicas do show) */
  pendingAdvance: { index: number; at: number } | null
  cancelAdvance: () => void
  advanceNow: () => void
  loadTrack: (track: Track, opts?: { autoplay?: boolean; startAt?: number }) => Promise<void>
  play: () => Promise<void>
  pause: () => void
  togglePlay: () => void
  stop: () => void
  seek: (seconds: number) => void
  skipBackward: (seconds?: number) => void
  skipForward: (seconds?: number) => void
  setPitch: (semitones: number) => void
  setSpeed: (speed: number) => void
  setVolume: (volume: number) => void
  setStemMuted: (stemId: string, muted: boolean) => void
  setStemSolo: (stemId: string, solo: boolean) => void
  setStemVolume: (stemId: string, volume: number) => void
  setStemFollowPitch: (stemId: string, follow: boolean) => void
  resetMix: () => void
  resetPitch: () => void
  resetSpeed: () => void
  saveTrackSettings: () => void
  setQueue: (tracks: Track[], startIndex?: number, opts?: { autoplay?: boolean; ranges?: QueueRange[] }) => Promise<void>
  playQueueIndex: (index: number, opts?: { autoplay?: boolean }) => Promise<void>
  next: () => Promise<boolean>
  prev: () => Promise<boolean>
  restoreLastTrack: (findTrack: (id: string) => Track | undefined) => Promise<void>
  togglePerformanceMode: () => void
  togglePrecount: () => void
  isExporting: boolean
  downloadMix: () => Promise<void>
  _setTime: (currentTime: number, duration: number) => void
  _setPlaybackState: (state: PlayerState['playbackState']) => void
  _setError: (error: string | null) => void
}

/** Instrumento de uma pista (pelo nome), para saber se o músico toca ele ao vivo */
export function stemInstrument(stem: { id: string; label: string }) {
  return detectInstrument(`${stem.label} ${stem.id}`.replace(/-/g, ' '))
}

/**
 * Estado inicial do mixer: tudo ligado, menos click e contagem (vão no fone, não na caixa)
 * e os instrumentos que o músico toca ao vivo (ele mesmo faz essa parte).
 */
export function buildStemStates(track: Track): Record<string, StemState> {
  const states: Record<string, StemState> = {}
  const plays = new Set<string>(usePrefsStore.getState().plays)
  const many = track.stems.length > 2
  track.stems.forEach(stem => {
    const mine = many && !stem.derive && plays.has(stemInstrument(stem))
    // "Sem voz" (beta) começa desligado: o músico liga e desliga a original
    states[stem.id] = { id: stem.id, muted: isSupportStem(stem) || mine || !!stem.derive, solo: false, volume: 1 }
  })
  return states
}

/** Mixer de uma música ao abrir: o que o músico salvou, completando com o padrão */
function initialStemStates(track: Track): Record<string, StemState> {
  const saved = useTrackSettingsStore.getState().get(track.id)
  const stemStates = buildStemStates(track)
  if (saved) for (const id of Object.keys(saved.stemStates)) if (stemStates[id]) stemStates[id] = { ...saved.stemStates[id], id }
  return stemStates
}

export const usePlayerStore = create<PlayerStore>((set, get) => {
  const analyzeSoon = () => setTimeout(() => {
    const a = audioEngine.analyze()
    if (a) set({ analysis: a })
  }, 30)
  audioEngine.on(event => {
    switch (event.type) {
      case 'loading':
        set({ playbackState: 'loading', loadProgress: event.total ? { loaded: event.loaded ?? 0, total: event.total } : null })
        break
      case 'loaded':
        set({ playbackState: 'paused', loadProgress: null })
        analyzeSoon()
        break
      case 'preview':
        set({ previewActive: event.active })
        break
      case 'background':
        set({ bgProgress: event.loaded >= event.total ? null : { loaded: event.loaded, total: event.total } })
        if (event.loaded >= event.total) analyzeSoon()
        break
      case 'timeupdate': {
        set({ currentTime: event.currentTime, duration: event.duration })
        const { track, playbackState, queue, queueIndex, queueRanges } = get()
        if (!track || playbackState !== 'playing' || _listen.trackId !== track.id) break
        const t = event.currentTime, d = t - _listen.last
        if (_listen.last >= 0 && d > 0 && d < 1.5) _listen.acc += d
        _listen.last = t
        if (_listen.acc >= 10) flushListen()
        const inShow = queue[queueIndex]?.id === track.id
        const end = (inShow && queueRanges[queueIndex]?.end) || event.duration
        if (!_listen.counted && event.duration > 30 && t >= end * 0.85) { _listen.counted = true; flushListen(); useProgressStore.getState().addPlay(track.id) }
        // show: a próxima música já fica pronta na memória nos últimos 45 s (entra sem espera)
        const nextT = queue[queueIndex + 1]
        if (nextT && inShow && useStageSettings.getState().autoAdvance && end - t < 45 && _listen.preloadFor !== nextT.id) {
          _listen.preloadFor = nextT.id
          void resolveTrackUrls(nextT).then(r => audioEngine.preload(r.stems, initialStemStates(nextT))).catch(() => {})
        }
        break
      }
      case 'ended': {
        set({ playbackState: 'stopped', currentTime: 0 })
        flushListen()
        const { queue, queueIndex } = get()
        const { autoAdvance, advanceGap } = useStageSettings.getState()
        if (autoAdvance && queueIndex >= 0 && queueIndex < queue.length - 1) {
          const index = queueIndex + 1
          if (advanceGap <= 0) { void get().playQueueIndex(index, { autoplay: true }); break }
          set({ pendingAdvance: { index, at: Date.now() + advanceGap * 1000 } })
          if (_advanceTimer) clearTimeout(_advanceTimer)
          _advanceTimer = setTimeout(() => { get().advanceNow() }, advanceGap * 1000)
        }
        break
      }
      case 'error':
        set({ error: event.message, playbackState: 'error', loadProgress: null })
        break
      case 'warning':
        toast.warning(event.message)
        break
      case 'loopwrap': {
        const { trainer, speed } = get()
        if (!trainer) break
        const next = Math.min(1, Math.round((speed + trainer.step) * 100) / 100)
        get().setSpeed(next)
        if (next >= 1) {
          set({ trainer: null })
          const tr = get().track
          if (tr) useProgressStore.getState().addTrainer(tr.id)
          toast.success('Chegou a 100% da velocidade! Trecho dominado 🎉')
          void import('@/lib/confetti').then(m => m.confetti())
        }
        break
      }
      case 'stemLoading':
        set(s => ({ loadingStems: event.active ? [...s.loadingStems, event.id] : s.loadingStems.filter(x => x !== event.id) }))
        // a voz guia chegou depois: as partes da música ficam mais precisas
        if (!event.active) analyzeSoon()
        break
    }
  })

  // Volume igual entre músicas: segue a preferência salva
  audioEngine.setNormalize(useStageSettings.getState().normalize)
  useStageSettings.subscribe(s => audioEngine.setNormalize(s.normalize))
  useStageSettings.subscribe((s, prev) => { if (s.ending !== prev.ending || s.fadeSecs !== prev.fadeSecs) get().applyEnding() })

  // Fones Bluetooth e tela bloqueada
  audioEngine.setMediaHandlers({
    play: () => { void get().play() },
    pause: () => get().pause(),
    seek: (t) => { if (typeof t === 'number') get().seek(t) },
    next: () => { void get().next() },
    prev: () => { void get().prev() },
  })

  return {
    track: null,
    playbackState: 'idle',
    currentTime: 0,
    duration: 0,
    pitch: 0,
    speed: 1,
    volume: 0.85,
    stemStates: {},
    isPerformanceMode: false,
    precountEnabled: useStageSettings.getState().precount,
    precountBeats: 4,
    error: null,
    isPitchProcessing: false,
    loadProgress: null,
    bgProgress: null,
    previewActive: false,
    loadingStems: [],
    queue: [],
    queueRanges: [],
    analysis: null,
    queueIndex: -1,
    loop: null,
    trainer: null,
    keySuggestion: null,
    pendingAdvance: null,

    // ─── Carregar música ────────────────────────────────────────────────────
    loadTrack: async (track, opts) => {
      // modo teste: música fora das 4 liberadas abre a tela de compra
      if (isLocked(track)) { useTrial.getState().openPaywall(track); return }
      const loadId = ++_trackLoadId
      audioEngine.setLoop(null)
      if (get().loop || get().trainer) set({ loop: null, trainer: null })
      if (_advanceTimer) { clearTimeout(_advanceTimer); _advanceTimer = null }
      if (get().pendingAdvance) set({ pendingAdvance: null })
      const saved = useTrackSettingsStore.getState().get(track.id)
      // só aproveita do salvo as pistas que ainda existem
      const stemStates = initialStemStates(track)
      resetListen(track.id)
      // sem ajuste salvo: sugere (ou aplica) o tom pela voz do músico
      const prefs = usePrefsStore.getState()
      const shift = suggestedShift(prefs.voice, track.artist)
      const auto = !saved && shift !== 0 && prefs.autoKey
      const pitch = saved?.pitch ?? (auto ? shift : 0)
      const speed = saved?.speed ?? 1
      const keySuggestion = shift !== 0 ? { shift, applied: auto || (saved ? Math.round(saved.pitch) === shift : false) } : null
      _pendingPlay = !!opts?.autoplay

      set({ track, stemStates, pitch, speed, keySuggestion, playbackState: 'loading', error: null, currentTime: 0, duration: 0, loadProgress: null, bgProgress: null, previewActive: false, loadingStems: [], analysis: null })
      try { localStorage.setItem(LAST_TRACK_KEY, track.id) } catch {}
      usePrefsStore.getState().pushRecent(track.id)
      audioEngine.setMediaMetadata({ title: track.title, artist: track.artist, artwork: track.coverUrl })
      try {
        AudioCache.revokeAll()
        let resolved: Track
        try { resolved = await resolveTrackUrls(track) } catch { resolved = track }
        if (loadId !== _trackLoadId) return
        audioEngine.setPitch(pitch)
        audioEngine.setSpeed(speed)
        get().applyEnding()
        await audioEngine.load(resolved.stems, stemStates, { mixUrl: track.mixUrl })
        if (loadId !== _trackLoadId || !audioEngine.loaded) return
        // trecho do show (medley): começa no ponto escolhido
        if (opts?.startAt && opts.startAt > 0) { audioEngine.seek(opts.startAt); set({ currentTime: opts.startAt }) }
        set({ playbackState: 'paused', duration: audioEngine.duration })
        if (_pendingPlay) { _pendingPlay = false; await get().play() }
      } catch (err: any) {
        console.error('[PlayerStore] loadTrack failed:', err)
        _pendingPlay = false
        if (loadId !== _trackLoadId) return
        set({ playbackState: 'error', error: `Não foi possível abrir a música: ${err?.message || err}` })
      }
    },

    // ─── Reprodução ─────────────────────────────────────────────────────────
    play: async () => {
      const { playbackState, track, precountBeats } = get()
      const precountEnabled = useStageSettings.getState().precount
      if (playbackState === 'playing') return
      if (playbackState === 'loading') { _pendingPlay = true; void audioEngine.unlock(); return }
      if (!track) return
      if (playbackState === 'error' || playbackState === 'idle') {
        // erro: tenta de novo do zero (ex.: caiu a internet). idle: música restaurada, áudio ainda não baixado
        await get().loadTrack(track, { autoplay: true })
        return
      }
      const countIn = precountEnabled && track.bpm > 0 && audioEngine.currentTime < 0.5
        ? { beats: precountBeats, bpm: track.bpm } : undefined
      await audioEngine.play({ countIn })
      if (audioEngine.isPlaying) {
        set({ playbackState: 'playing', error: null })
        if (track) usePracticeStore.getState().record(track.id)
      }
    },

    pause: () => { audioEngine.pause(); set({ playbackState: 'paused' }); flushListen() },

    togglePlay: () => {
      const st = get().playbackState
      if (st === 'playing') get().pause()
      else void get().play()
    },

    stop: () => { audioEngine.stop(); set({ playbackState: 'stopped', currentTime: 0 }) },

    seek: (seconds) => { audioEngine.seek(seconds); set({ currentTime: seconds }) },

    skipBackward: (seconds = 5) => {
      const t = Math.max(0, audioEngine.currentTime - seconds)
      audioEngine.seek(t); set({ currentTime: t })
    },

    skipForward: (seconds = 5) => {
      const t = Math.min(get().duration, audioEngine.currentTime + seconds)
      audioEngine.seek(t); set({ currentTime: t })
    },

    // ─── Tom (semitons; ½ tom = 1 semitom) e velocidade ─────────────────────
    setPitch: (semitones) => {
      const clamped = clamp(Math.round(semitones * 10) / 10, -12, 12)
      audioEngine.setPitch(clamped)
      set({ pitch: clamped })
      get().saveTrackSettings()
    },
    resetPitch: () => { audioEngine.resetPitch(); set({ pitch: 0 }); get().saveTrackSettings() },

    setSpeed: (speed) => {
      const clamped = clamp(Math.round(speed * 100) / 100, 0.5, 1.5)
      audioEngine.setSpeed(clamped)
      set({ speed: clamped })
      get().saveTrackSettings()
    },
    resetSpeed: () => { audioEngine.resetSpeed(); set({ speed: 1 }); get().saveTrackSettings() },

    setVolume: (volume) => {
      const clamped = clamp(volume, 0, 1)
      audioEngine.setVolume(clamped)
      set({ volume: clamped })
    },

    // ─── Mixer ──────────────────────────────────────────────────────────────
    setStemMuted: (stemId, muted) => {
      const stemStates = { ...get().stemStates }
      if (!stemStates[stemId]) return
      stemStates[stemId] = { ...stemStates[stemId], muted }
      audioEngine.setStemStates(stemStates)
      set({ stemStates })
      get().saveTrackSettings()
    },

    setStemSolo: (stemId, solo) => {
      const stemStates = { ...get().stemStates }
      Object.keys(stemStates).forEach(id => { stemStates[id] = { ...stemStates[id], solo: id === stemId ? solo : false } })
      audioEngine.setStemStates(stemStates)
      set({ stemStates })
    },

    setStemVolume: (stemId, volume) => {
      const stemStates = { ...get().stemStates }
      if (!stemStates[stemId]) return
      stemStates[stemId] = { ...stemStates[stemId], volume }
      audioEngine.setStemStates(stemStates)
      set({ stemStates })
      get().saveTrackSettings()
    },

    setStemFollowPitch: (stemId, follow) => {
      const stemStates = { ...get().stemStates }
      if (!stemStates[stemId]) return
      stemStates[stemId] = { ...stemStates[stemId], followPitch: follow }
      audioEngine.setStemStates(stemStates)
      set({ stemStates })
      get().saveTrackSettings()
    },

    resetMix: () => {
      const track = get().track
      if (!track) return
      const stemStates = buildStemStates(track)
      audioEngine.setStemStates(stemStates)
      set({ stemStates })
      get().saveTrackSettings()
    },

    /** Lembra tom, velocidade e mixer de cada música (abre do jeito que o músico deixou) */
    saveTrackSettings: () => {
      const { track, pitch, speed, stemStates } = get()
      if (!track) return
      useTrackSettingsStore.getState().save(track.id, pitch, speed, stemStates)
    },

    // ─── Fila (setlist em execução) ─────────────────────────────────────────
    setQueue: async (tracks, startIndex = 0, opts) => {
      set({ queue: tracks, queueIndex: -1, queueRanges: opts?.ranges ?? [] })
      if (tracks.length) await get().playQueueIndex(startIndex, opts)
    },

    playQueueIndex: async (index, opts) => {
      const { queue } = get()
      const t = queue[index]
      if (!t) return
      set({ queueIndex: index })
      await get().loadTrack(t, { ...opts, startAt: get().queueRanges[index]?.start })
      // deixa a próxima já baixada para entrar sem espera
      const nextTrack = queue[index + 1]
      if (nextTrack) void audioEngine.prefetch(nextTrack.stems.filter(s => !isSupportStem(s)).map(s => s.audioUrl).filter(u => /^https?:/.test(u)))
    },

    next: async () => {
      const { queue, queueIndex, playbackState } = get()
      if (queueIndex < 0 || queueIndex >= queue.length - 1) return false
      await get().playQueueIndex(queueIndex + 1, { autoplay: playbackState === 'playing' })
      return true
    },

    prev: async () => {
      const { queueIndex, playbackState } = get()
      // como nos players de música: volta ao começo se já passou de 3 s
      if (audioEngine.currentTime > 3 || queueIndex <= 0) { get().seek(get().queueRanges[queueIndex]?.start ?? 0); return queueIndex > 0 }
      await get().playQueueIndex(queueIndex - 1, { autoplay: playbackState === 'playing' })
      return true
    },

    applyKeySuggestion: () => {
      const ks = get().keySuggestion
      if (!ks) return
      get().setPitch(ks.shift)
      set({ keySuggestion: { ...ks, applied: true } })
    },

    /** 1º toque marca o início (A), 2º marca o fim (B) e começa a repetir, 3º desliga */
    loopTap: () => {
      const { loop } = get()
      const t = audioEngine.currentTime
      if (!loop) { set({ loop: { a: t, b: null } }); return }
      if (loop.b === null) {
        if (t - loop.a < 0.5) return
        const l = { a: loop.a, b: t }
        set({ loop: l }); audioEngine.setLoop(l as { a: number; b: number })
        return
      }
      get().clearLoop()
    },
    clearLoop: () => { get().stopTrainer(); audioEngine.setLoop(null); set({ loop: null }) },
    loopRange: (a, b) => {
      const l = { a: Math.max(0, a), b }
      set({ loop: l }); audioEngine.setLoop(l)
      if (get().playbackState === 'playing') audioEngine.seek(l.a)
    },
    applyEnding: () => {
      const { queue, queueIndex, queueRanges, track } = get()
      // fora do show a música toca inteira, do jeito que veio
      if (queueIndex < 0 || !track || queue[queueIndex]?.id !== track.id) { audioEngine.setEnding({}); return }
      const { ending, fadeSecs } = useStageSettings.getState()
      audioEngine.setEnding({ trim: ending !== 'normal', fade: ending === 'fade' ? fadeSecs : 0, end: queueRanges[queueIndex]?.end })
    },
    startTrainer: (from = 0.7) => {
      const { speed } = get()
      set({ trainer: { orig: speed, step: 0.05 } })
      get().setSpeed(Math.min(from, speed))
      toast('Treino progressivo: a cada repetição o trecho fica 5% mais rápido, até 100%')
    },
    stopTrainer: () => {
      const { trainer } = get()
      if (!trainer) return
      set({ trainer: null })
      get().setSpeed(trainer.orig)
    },

    /** Música inteira importada: alterna entre a original e a versão "sem voz" (beta) */
    toggleNoVocals: () => {
      const { track, stemStates } = get()
      const nv = track?.stems.find(s => s.derive === 'karaoke')
      const orig = track?.stems.find(s => !s.derive)
      if (!nv || !orig) return
      const on = !!stemStates[nv.id]?.muted
      get().setStemMuted(nv.id, !on)
      get().setStemMuted(orig.id, on)
    },

    cancelAdvance: () => {
      if (_advanceTimer) { clearTimeout(_advanceTimer); _advanceTimer = null }
      set({ pendingAdvance: null })
    },

    advanceNow: () => {
      const p = get().pendingAdvance
      if (_advanceTimer) { clearTimeout(_advanceTimer); _advanceTimer = null }
      set({ pendingAdvance: null })
      if (p) void get().playQueueIndex(p.index, { autoplay: true })
    },

    restoreLastTrack: async (findTrack) => {
      if (get().track) return
      let id: string | null = null
      try { id = localStorage.getItem(LAST_TRACK_KEY) } catch {}
      const t = id ? findTrack(id) : undefined
      if (!t || isLocked(t)) return
      // só mostra a música; o áudio é baixado quando o músico apertar play (economiza dados)
      const saved = useTrackSettingsStore.getState().get(t.id)
      const stemStates = buildStemStates(t)
      if (saved) for (const sid of Object.keys(saved.stemStates)) if (stemStates[sid]) stemStates[sid] = { ...saved.stemStates[sid], id: sid }
      set({ track: t, stemStates, pitch: saved?.pitch ?? 0, speed: saved?.speed ?? 1, playbackState: 'idle', currentTime: 0, duration: 0 })
    },

    // ─── Exportar ───────────────────────────────────────────────────────────
    isExporting: false,

    downloadMix: async () => {
      const { track, stemStates, pitch, speed } = get()
      if (!track) return
      set({ isExporting: true, error: null })
      try {
        await new Promise(r => setTimeout(r, 50))
        const blob = await audioEngine.exportMixdown(stemStates)
        if (!blob || blob.size < 100) { toast.error('Não foi possível exportar. Abra a música e tente de novo.'); return }
        const pitchStr = pitch !== 0 ? `_${pitch > 0 ? '+' : ''}${pitch}st` : ''
        const speedStr = speed !== 1 ? `_${speed}x` : ''
        const filename = `${track.title} - ${track.artist}${pitchStr}${speedStr}.mp3`
        const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent)
        if (isIOS && navigator.share) {
          try { await navigator.share({ files: [new File([blob], filename, { type: 'audio/mpeg' })] }); return } catch {}
        }
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = filename; a.style.display = 'none'
        document.body.appendChild(a); a.click()
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 500)
      } catch (err) {
        console.error('[Export] Failed:', err)
        toast.error('Erro ao exportar. Tente novamente.')
      } finally {
        set({ isExporting: false })
      }
    },

    togglePerformanceMode: () => set(s => ({ isPerformanceMode: !s.isPerformanceMode })),
    togglePrecount: () => {
      const on = !useStageSettings.getState().precount
      useStageSettings.getState().set({ precount: on })
      set({ precountEnabled: on })
    },

    _setTime: (currentTime, duration) => set({ currentTime, duration }),
    _setPlaybackState: (playbackState) => set({ playbackState }),
    _setError: (error) => set({ error }),
  }
})

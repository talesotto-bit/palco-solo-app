/**
 * PlayerStore — estado global do player (Zustand), coordenado com o AudioEngine.
 * Também guarda a fila (setlist em execução) para avançar sozinho entre as músicas.
 */

import { create } from 'zustand'
import { toast } from 'sonner'
import { audioEngine, isSupportStem } from '@/audio/AudioEngine'
import type { Track } from '@/types/track'
import type { PlayerState, StemState } from '@/types/player'
import { clamp } from '@/lib/utils'
import { AudioCache, isCacheUrl, urlToKey } from '@/lib/audioCache'
import { useTrackSettingsStore } from './trackSettingsStore'
import { useStageSettings } from './stageSettingsStore'
import { usePrefsStore } from './prefsStore'
import { detectInstrument } from '@/lib/stemDetection'

const LAST_TRACK_KEY = 'player-last-track-v1'

let _trackLoadId = 0
let _pendingPlay = false
let _advanceTimer: ReturnType<typeof setTimeout> | null = null

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
  loadingStems: string[]
  queue: Track[]
  queueIndex: number
  /** próxima música agendada (contagem regressiva entre músicas do show) */
  pendingAdvance: { index: number; at: number } | null
  cancelAdvance: () => void
  advanceNow: () => void
  loadTrack: (track: Track, opts?: { autoplay?: boolean }) => Promise<void>
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
  resetMix: () => void
  resetPitch: () => void
  resetSpeed: () => void
  saveTrackSettings: () => void
  setQueue: (tracks: Track[], startIndex?: number, opts?: { autoplay?: boolean }) => Promise<void>
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
    const mine = many && plays.has(stemInstrument(stem))
    states[stem.id] = { id: stem.id, muted: isSupportStem(stem) || mine, solo: false, volume: 1 }
  })
  return states
}

export const usePlayerStore = create<PlayerStore>((set, get) => {
  audioEngine.on(event => {
    switch (event.type) {
      case 'loading':
        set({ playbackState: 'loading', loadProgress: event.total ? { loaded: event.loaded ?? 0, total: event.total } : null })
        break
      case 'loaded':
        set({ playbackState: 'paused', loadProgress: null })
        break
      case 'timeupdate':
        set({ currentTime: event.currentTime, duration: event.duration })
        break
      case 'ended': {
        set({ playbackState: 'stopped', currentTime: 0 })
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
      case 'stemLoading':
        set(s => ({ loadingStems: event.active ? [...s.loadingStems, event.id] : s.loadingStems.filter(x => x !== event.id) }))
        break
    }
  })

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
    loadingStems: [],
    queue: [],
    queueIndex: -1,
    pendingAdvance: null,

    // ─── Carregar música ────────────────────────────────────────────────────
    loadTrack: async (track, opts) => {
      const loadId = ++_trackLoadId
      if (_advanceTimer) { clearTimeout(_advanceTimer); _advanceTimer = null }
      if (get().pendingAdvance) set({ pendingAdvance: null })
      const saved = useTrackSettingsStore.getState().get(track.id)
      const defaults = buildStemStates(track)
      // só aproveita do salvo as pistas que ainda existem
      const stemStates = { ...defaults }
      if (saved) for (const id of Object.keys(saved.stemStates)) if (stemStates[id]) stemStates[id] = { ...saved.stemStates[id], id }
      const pitch = saved?.pitch ?? 0
      const speed = saved?.speed ?? 1
      _pendingPlay = !!opts?.autoplay

      set({ track, stemStates, pitch, speed, playbackState: 'loading', error: null, currentTime: 0, duration: 0, loadProgress: null, loadingStems: [] })
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
        await audioEngine.load(resolved.stems, stemStates)
        if (loadId !== _trackLoadId || !audioEngine.loaded) return
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
      if (audioEngine.isPlaying) set({ playbackState: 'playing', error: null })
    },

    pause: () => { audioEngine.pause(); set({ playbackState: 'paused' }) },

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
      set({ queue: tracks, queueIndex: -1 })
      if (tracks.length) await get().playQueueIndex(startIndex, opts)
    },

    playQueueIndex: async (index, opts) => {
      const { queue } = get()
      const t = queue[index]
      if (!t) return
      set({ queueIndex: index })
      await get().loadTrack(t, opts)
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
      if (audioEngine.currentTime > 3 || queueIndex <= 0) { get().seek(0); return queueIndex > 0 }
      await get().playQueueIndex(queueIndex - 1, { autoplay: playbackState === 'playing' })
      return true
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
      if (!t) return
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

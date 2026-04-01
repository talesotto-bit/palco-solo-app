/**
 * PlayerStore — estado global do player com Zustand
 *
 * Gerencia todo o estado de reprodução e coordena com o AudioEngine.
 * Componentes consomem via hooks: usePlayerStore, usePlayerActions.
 */

import { create } from 'zustand'
import { audioEngine } from '@/audio/AudioEngine'
import type { Track } from '@/types/track'
import type { PlayerState, StemState } from '@/types/player'
import { clamp } from '@/lib/utils'
import { AudioCache, isCacheUrl, urlToKey } from '@/lib/audioCache'

/** Revoke previous blob URLs before loading a new track */
function cleanupPreviousBlobUrls() {
  AudioCache.revokeAll()
}
import { useTrackSettingsStore } from './trackSettingsStore'

/** Resolve cache:// URLs para blob URLs reais antes de carregar no engine */
async function resolveTrackUrls(track: Track): Promise<Track> {
  const cacheKeys = track.stems
    .filter(s => isCacheUrl(s.audioUrl))
    .map(s => urlToKey(s.audioUrl))
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
  // Actions
  loadTrack: (track: Track) => Promise<void>
  play: () => Promise<void>
  pause: () => void
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
  togglePerformanceMode: () => void
  togglePrecount: () => void
  // Internal — called by AudioEngine event listener
  _setTime: (currentTime: number, duration: number) => void
  _setPlaybackState: (state: PlayerState['playbackState']) => void
  _setError: (error: string | null) => void
}

function buildStemStates(track: Track): Record<string, StemState> {
  const states: Record<string, StemState> = {}
  track.stems.forEach(stem => {
    states[stem.id] = { id: stem.id, muted: false, solo: false, volume: 1 }
  })
  return states
}

export const usePlayerStore = create<PlayerStore>((set, get) => {
  // Subscribe to AudioEngine events once
  audioEngine.on(event => {
    switch (event.type) {
      case 'loading':
        get()._setPlaybackState('loading')
        break
      case 'loaded':
        get()._setPlaybackState('paused')
        break
      case 'timeupdate':
        get()._setTime(event.currentTime, event.duration)
        break
      case 'ended':
        get()._setPlaybackState('stopped')
        break
      case 'error':
        get()._setError(event.message)
        get()._setPlaybackState('error')
        break
    }
  })

  return {
    // Initial state
    track: null,
    playbackState: 'idle',
    currentTime: 0,
    duration: 0,
    pitch: 0,
    speed: 1,
    volume: 0.85,
    stemStates: {},
    isPerformanceMode: false,
    precountEnabled: false,
    precountBeats: 4,
    error: null,

    // ─── Track loading ──────────────────────────────────────────────────────
    loadTrack: async (track: Track) => {
      const defaultStems = buildStemStates(track)
      const saved = useTrackSettingsStore.getState().get(track.id)

      // Apply saved settings if available, otherwise use defaults
      const stemStates = saved ? { ...defaultStems, ...saved.stemStates } : defaultStems
      const pitch = saved?.pitch ?? 0
      const speed = saved?.speed ?? 1

      set({ track, stemStates, pitch, speed, playbackState: 'loading', error: null, currentTime: 0 })
      try {
        cleanupPreviousBlobUrls()
        const resolvedTrack = await resolveTrackUrls(track)
        await audioEngine.load(resolvedTrack.stems)

        // Apply saved pitch/speed/stems to engine
        if (pitch !== 0) audioEngine.setPitch(pitch)
        if (speed !== 1) audioEngine.setSpeed(speed)
        if (saved) audioEngine.setStemStates(stemStates)

        set({ playbackState: 'paused', duration: audioEngine.duration })
      } catch (err) {
        set({ playbackState: 'error', error: 'Falha ao carregar a faixa. Tente novamente.' })
      }
    },

    // ─── Playback ───────────────────────────────────────────────────────────
    play: async () => {
      const state = get().playbackState
      if (state === 'loading' || state === 'playing') return
      try {
        await audioEngine.play()
        set({ playbackState: 'playing' })
      } catch {
        // Tone.start() may fail if no user gesture — ignore silently
      }
    },

    pause: () => {
      audioEngine.pause()
      set({ playbackState: 'paused' })
    },

    stop: () => {
      audioEngine.stop()
      set({ playbackState: 'stopped', currentTime: 0 })
    },

    seek: (seconds: number) => {
      audioEngine.seek(seconds)
      set({ currentTime: seconds })
    },

    skipBackward: (seconds = 5) => {
      const newTime = Math.max(0, get().currentTime - seconds)
      audioEngine.seek(newTime)
      set({ currentTime: newTime })
    },

    skipForward: (seconds = 5) => {
      const newTime = Math.min(get().duration, get().currentTime + seconds)
      audioEngine.seek(newTime)
      set({ currentTime: newTime })
    },

    // ─── Pitch (-12..+12 semitones, supports fractional for fine-tuning) ────
    setPitch: (semitones: number) => {
      const clamped = clamp(Math.round(semitones * 10) / 10, -12, 12)
      audioEngine.setPitch(clamped)
      set({ pitch: clamped })
    },

    resetPitch: () => {
      audioEngine.resetPitch()
      set({ pitch: 0 })
    },

    // ─── Speed (0.5..2.0) ───────────────────────────────────────────────────
    setSpeed: (speed: number) => {
      const clamped = clamp(speed, 0.5, 2.0)
      audioEngine.setSpeed(clamped)
      set({ speed: clamped })
    },

    resetSpeed: () => {
      audioEngine.resetSpeed()
      set({ speed: 1 })
    },

    // ─── Volume ─────────────────────────────────────────────────────────────
    setVolume: (volume: number) => {
      const clamped = clamp(volume, 0, 1)
      audioEngine.setVolume(clamped)
      set({ volume: clamped })
    },

    // ─── Stem controls ──────────────────────────────────────────────────────
    setStemMuted: (stemId: string, muted: boolean) => {
      const stemStates = { ...get().stemStates }
      if (!stemStates[stemId]) return
      stemStates[stemId] = { ...stemStates[stemId], muted }
      audioEngine.setStemStates(stemStates)
      set({ stemStates })
    },

    setStemSolo: (stemId: string, solo: boolean) => {
      const stemStates = { ...get().stemStates }
      // Toggle solo: if enabling, disable solo on others
      Object.keys(stemStates).forEach(id => {
        stemStates[id] = { ...stemStates[id], solo: id === stemId ? solo : false }
      })
      audioEngine.setStemStates(stemStates)
      set({ stemStates })
    },

    setStemVolume: (stemId: string, volume: number) => {
      const stemStates = { ...get().stemStates }
      if (!stemStates[stemId]) return
      stemStates[stemId] = { ...stemStates[stemId], volume }
      audioEngine.setStemStates(stemStates)
      set({ stemStates })
    },

    resetMix: () => {
      const track = get().track
      if (!track) return
      const stemStates = buildStemStates(track)
      audioEngine.resetMix()
      set({ stemStates })
    },

    // ─── UI state ───────────────────────────────────────────────────────────
    togglePerformanceMode: () => {
      set(s => ({ isPerformanceMode: !s.isPerformanceMode }))
    },

    togglePrecount: () => {
      set(s => ({ precountEnabled: !s.precountEnabled }))
    },

    // ─── Internal setters (called by engine listener) ───────────────────────
    _setTime: (currentTime, duration) => set({ currentTime, duration }),
    _setPlaybackState: (playbackState) => set({ playbackState }),
    _setError: (error) => set({ error }),
  }
})

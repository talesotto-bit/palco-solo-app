import type { Track } from './track'

export type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'stopped' | 'error'

export interface StemState {
  id: string
  muted: boolean
  solo: boolean
  volume: number // 0..1
}

export interface PlayerState {
  track: Track | null
  playbackState: PlaybackState
  currentTime: number
  duration: number
  pitch: number         // semitones, -12..+12
  speed: number         // ratio, 0.5..2.0
  volume: number        // 0..1
  stemStates: Record<string, StemState>
  isPerformanceMode: boolean
  precountEnabled: boolean
  precountBeats: number
  error: string | null
  isPitchProcessing: boolean
}

export interface PlayerActions {
  loadTrack: (track: Track) => Promise<void>
  play: () => void
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
}

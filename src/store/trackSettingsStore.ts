import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { StemState } from '@/types/player'

export interface TrackSettings {
  pitch: number
  speed: number
  stemStates: Record<string, StemState>
  savedAt: number
}

interface TrackSettingsState {
  settings: Record<string, TrackSettings>
  save: (trackId: string, pitch: number, speed: number, stemStates: Record<string, StemState>) => void
  get: (trackId: string) => TrackSettings | null
  remove: (trackId: string) => void
  has: (trackId: string) => boolean
}

export const useTrackSettingsStore = create<TrackSettingsState>()(
  persist(
    (set, get) => ({
      settings: {},

      save: (trackId, pitch, speed, stemStates) => {
        set(s => ({
          settings: {
            ...s.settings,
            [trackId]: { pitch, speed, stemStates, savedAt: Date.now() },
          },
        }))
      },

      get: (trackId) => get().settings[trackId] ?? null,

      remove: (trackId) => {
        set(s => {
          const { [trackId]: _, ...rest } = s.settings
          return { settings: rest }
        })
      },

      has: (trackId) => trackId in get().settings,
    }),
    { name: 'palco-track-settings' }
  )
)

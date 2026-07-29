import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const TRIAL_DURATION = 300
const EXTENSION_DURATION = 120

interface TrialState {
  isTrialMode: boolean
  usedSeconds: number
  extended: boolean
  expired: boolean
  startTrial: () => void
  tick: () => void
  extend: () => void
  reset: () => void
}

export const useTrialStore = create<TrialState>()(
  persist(
    (set, get) => ({
      isTrialMode: false,
      usedSeconds: 0,
      extended: false,
      expired: false,

      startTrial: () => {
        const { expired, extended, usedSeconds } = get()
        const max = extended ? TRIAL_DURATION + EXTENSION_DURATION : TRIAL_DURATION
        if (expired && usedSeconds >= max) return
        set({ isTrialMode: true, expired: false })
      },

      tick: () => {
        const { isTrialMode, expired } = get()
        if (!isTrialMode || expired) return
        set(s => {
          const next = s.usedSeconds + 1
          const max = s.extended ? TRIAL_DURATION + EXTENSION_DURATION : TRIAL_DURATION
          if (next >= max) {
            return { usedSeconds: max, expired: true }
          }
          return { usedSeconds: next }
        })
      },

      extend: () => {
        const { extended } = get()
        if (extended) return
        set({ extended: true, expired: false })
      },

      reset: () => set({
        isTrialMode: false,
        usedSeconds: 0,
        extended: false,
        expired: false,
      }),
    }),
    {
      name: 'powertom-trial',
      partialize: (s) => ({
        isTrialMode: s.isTrialMode,
        usedSeconds: s.usedSeconds,
        extended: s.extended,
        expired: s.expired,
      }),
    }
  )
)

export function getTrialRemaining(state: { usedSeconds: number; extended: boolean }): number {
  const max = state.extended ? TRIAL_DURATION + EXTENSION_DURATION : TRIAL_DURATION
  return Math.max(0, max - state.usedSeconds)
}

export function formatTrialTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

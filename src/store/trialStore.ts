
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const TRIAL_MS = 180_000
const EXTENSION_MS = 120_000

interface TrialState {
  isTrialMode: boolean
  usedMs: number
  extended: boolean
  expired: boolean
  _playStartedAt: number | null
  startTrial: () => void
  onPlay: () => void
  onPause: () => void
  flush: () => void
  extend: () => void
  reset: () => void
}

function maxMs(extended: boolean) {
  return extended ? TRIAL_MS + EXTENSION_MS : TRIAL_MS
}

type ExpireCallback = () => void
const _expireListeners: ExpireCallback[] = []
export function onTrialExpire(cb: ExpireCallback) {
  _expireListeners.push(cb)
  return () => {
    const idx = _expireListeners.indexOf(cb)
    if (idx >= 0) _expireListeners.splice(idx, 1)
  }
}
function _notifyExpire() {
  _expireListeners.forEach(cb => cb())
}

let _expiryTimeout: ReturnType<typeof setTimeout> | null = null

function _scheduleExpiry(remainingMs: number, get: () => TrialState, set: (s: Partial<TrialState>) => void) {
  if (_expiryTimeout) clearTimeout(_expiryTimeout)
  if (remainingMs <= 0) return
  _expiryTimeout = setTimeout(() => {
    const s = get()
    if (!s.isTrialMode || s.expired) return
    const elapsed = s._playStartedAt ? Date.now() - s._playStartedAt : 0
    const newUsed = s.usedMs + elapsed
    const max = maxMs(s.extended)
    if (newUsed >= max) {
      set({ usedMs: max, expired: true, _playStartedAt: null })
      _notifyExpire()
    }
  }, remainingMs + 100)
}

export const useTrialStore = create<TrialState>()(
  persist(
    (set, get) => ({
      isTrialMode: false,
      usedMs: 0,
      extended: false,
      expired: false,
      _playStartedAt: null,

      startTrial: () => {
        const s = get()
        if (s.expired && s.usedMs >= maxMs(s.extended)) return
        set({ isTrialMode: true, expired: false })
      },

      onPlay: () => {
        const s = get()
        if (!s.isTrialMode || s.expired) return
        if (s._playStartedAt) return
        const now = Date.now()
        set({ _playStartedAt: now })
        const remaining = maxMs(s.extended) - s.usedMs
        _scheduleExpiry(remaining, get, set)
      },

      onPause: () => {
        const s = get()
        if (!s._playStartedAt) return
        if (_expiryTimeout) { clearTimeout(_expiryTimeout); _expiryTimeout = null }
        const elapsed = Date.now() - s._playStartedAt
        const newUsed = s.usedMs + elapsed
        const max = maxMs(s.extended)
        if (newUsed >= max) {
          set({ usedMs: max, expired: true, _playStartedAt: null })
          _notifyExpire()
        } else {
          set({ usedMs: newUsed, _playStartedAt: null })
        }
      },

      flush: () => {
        const s = get()
        if (!s.isTrialMode || s.expired || !s._playStartedAt) return
        const elapsed = Date.now() - s._playStartedAt
        const newUsed = s.usedMs + elapsed
        const max = maxMs(s.extended)
        if (newUsed >= max) {
          if (_expiryTimeout) { clearTimeout(_expiryTimeout); _expiryTimeout = null }
          set({ usedMs: max, expired: true, _playStartedAt: null })
          _notifyExpire()
        } else {
          set({ usedMs: newUsed, _playStartedAt: Date.now() })
        }
      },

      extend: () => {
        const s = get()
        if (s.extended) return
        set({ extended: true, expired: false })
      },

      reset: () => {
        if (_expiryTimeout) { clearTimeout(_expiryTimeout); _expiryTimeout = null }
        set({
          isTrialMode: false,
          usedMs: 0,
          extended: false,
          expired: false,
          _playStartedAt: null,
        })
      },
    }),
    {
      name: 'powertom-trial-v2',
      partialize: (s) => ({
        isTrialMode: s.isTrialMode,
        usedMs: s.usedMs,
        extended: s.extended,
        expired: s.expired,
      }),
    }
  )
)

// ─── Module-level flush loop ────────────────────────────────────────────────
// Runs independently of any component mount/unmount.
// This guarantees the timer always counts while _playStartedAt is set.
setInterval(() => {
  const s = useTrialStore.getState()
  if (!s.isTrialMode || s.expired || !s._playStartedAt) return
  s.flush()
}, 500)

export function getTrialRemaining(state: { usedMs: number; extended: boolean; _playStartedAt: number | null }): number {
  const max = maxMs(state.extended)
  let used = state.usedMs
  if (state._playStartedAt) {
    used += Date.now() - state._playStartedAt
  }
  return Math.max(0, Math.ceil((max - used) / 1000))
}

export function formatTrialTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

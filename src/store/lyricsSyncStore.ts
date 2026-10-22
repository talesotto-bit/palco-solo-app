/**
 * Ajuste de sincronia da letra por música (segundos somados aos tempos da letra).
 * Os playbacks costumam ter introdução diferente da gravação original.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface LyricsSyncState {
  offsets: Record<string, number>
  setOffset: (trackId: string, seconds: number) => void
  clearOffset: (trackId: string) => void
}

export const useLyricsSyncStore = create<LyricsSyncState>()(
  persist(
    (set) => ({
      offsets: {},
      setOffset: (id, seconds) => set(s => ({ offsets: { ...s.offsets, [id]: Math.round(seconds * 100) / 100 } })),
      clearOffset: (id) => set(s => { const o = { ...s.offsets }; delete o[id]; return { offsets: o } }),
    }),
    { name: 'lyrics-sync-v1' }
  )
)

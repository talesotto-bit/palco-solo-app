/** Preferências do Modo Palco (salvas no aparelho) */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type StageView = 'letra' | 'cifra' | 'setlist'

interface StageSettings {
  autoAdvance: boolean
  /** segundos de pausa antes da próxima música (0 = emenda direto) */
  advanceGap: number
  precount: boolean
  lyricScale: number
  /** volume igual entre as músicas (normalização) */
  normalize: boolean
  view: StageView
  set: (patch: Partial<Omit<StageSettings, 'set'>>) => void
}

export const useStageSettings = create<StageSettings>()(
  persist(
    (set) => ({
      autoAdvance: true,
      advanceGap: 5,
      precount: false,
      lyricScale: 1,
      normalize: true,
      view: 'letra',
      set: (patch) => set(patch),
    }),
    { name: 'stage-settings-v1' }
  )
)

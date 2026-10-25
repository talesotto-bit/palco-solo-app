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
  /** luzes de palco que reagem ao som */
  lights: boolean
  /** plateia virtual: aplausos no fim de cada música (para ensaio) */
  applause: boolean
  /** fim de cada música no show: normal, sem o silêncio do fim do arquivo, ou com fade */
  ending: 'normal' | 'trim' | 'fade'
  /** segundos do fade no final */
  fadeSecs: number
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
      lights: true,
      applause: false,
      ending: 'trim',
      fadeSecs: 5,
      set: (patch) => set(patch),
    }),
    { name: 'stage-settings-v1' }
  )
)

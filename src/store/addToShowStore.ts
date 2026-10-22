import { create } from 'zustand'
import type { Track } from '@/types/track'

/** Abre o painel "Adicionar ao show" de qualquer tela (um painel só, no layout) */
export const useAddToShow = create<{ track: Track | null; open: (t: Track) => void; close: () => void }>((set) => ({
  track: null,
  open: (track) => set({ track }),
  close: () => set({ track: null }),
}))

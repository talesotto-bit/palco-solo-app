/**
 * Preferências do músico:
 * - instrumentos que ele toca ao vivo (já abrem desligados no mixer de toda música);
 * - histórico das últimas músicas abertas ("Continue de onde parou");
 * - saída VS para a mesa (instrumental no R, click e regência no L), valendo para todas as músicas.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { InstrumentId } from '@/types/track'

export type PlayedInstrument = Extract<InstrumentId, 'acoustic' | 'guitar' | 'bass' | 'keys' | 'drums' | 'percussion' | 'voice'>

export const PLAYABLE: { id: PlayedInstrument; label: string; emoji: string }[] = [
  { id: 'acoustic', label: 'Violão', emoji: '🪕' },
  { id: 'guitar', label: 'Guitarra', emoji: '🎸' },
  { id: 'bass', label: 'Baixo', emoji: '🎸' },
  { id: 'keys', label: 'Teclado / sanfona', emoji: '🎹' },
  { id: 'drums', label: 'Bateria', emoji: '🥁' },
  { id: 'percussion', label: 'Percussão', emoji: '🪘' },
  { id: 'voice', label: 'Voz guia (eu canto)', emoji: '🎤' },
]

interface PrefsState {
  /** voz do músico, para sugerir o tom (masculina/feminina) */
  voice: 'masc' | 'fem' | null
  /** aplicar a sugestão de tom sozinho (senão só sugere) */
  autoKey: boolean
  setVoice: (v: 'masc' | 'fem' | null) => void
  setAutoKey: (on: boolean) => void
  plays: PlayedInstrument[]
  recent: string[]
  askedInstruments: boolean
  setPlays: (plays: PlayedInstrument[]) => void
  togglePlay: (id: PlayedInstrument) => void
  pushRecent: (trackId: string) => void
  setAsked: () => void
  vsOutput: boolean
  setVsOutput: (on: boolean) => void
}

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      voice: null,
      autoKey: false,
      setVoice: (voice) => set({ voice }),
      setAutoKey: (autoKey) => set({ autoKey }),
      plays: [],
      recent: [],
      askedInstruments: false,
      setPlays: (plays) => set({ plays, askedInstruments: true }),
      togglePlay: (id) => set(s => ({ plays: s.plays.includes(id) ? s.plays.filter(x => x !== id) : [...s.plays, id], askedInstruments: true })),
      pushRecent: (trackId) => set(s => ({ recent: [trackId, ...s.recent.filter(x => x !== trackId)].slice(0, 30) })),
      setAsked: () => set({ askedInstruments: true }),
      vsOutput: false,
      setVsOutput: (vsOutput) => set({ vsOutput }),
    }),
    { name: 'prefs-v1' }
  )
)

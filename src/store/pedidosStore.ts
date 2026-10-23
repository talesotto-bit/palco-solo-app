/** Perfil de pedidos/gorjeta do músico (salvo no aparelho) */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface PedidosProfile {
  artist: string
  whatsapp: string
  pixKey: string
  payeeName: string
  city: string
  message: string
  showIds: string[]
  includeFavorites: boolean
  theme?: number
  instagram?: string
}

interface PedidosState {
  profile: PedidosProfile
  link: string | null
  setProfile: (patch: Partial<PedidosProfile>) => void
  setLink: (link: string | null) => void
}

export const usePedidosStore = create<PedidosState>()(
  persist(
    (set) => ({
      profile: { artist: '', whatsapp: '', pixKey: '', payeeName: '', city: '', message: 'Peça sua música! Gorjetas são muito bem-vindas 🎤', showIds: [], includeFavorites: false },
      link: null,
      setProfile: (patch) => set(s => ({ profile: { ...s.profile, ...patch } })),
      setLink: (link) => set({ link }),
    }),
    { name: 'pedidos-v1' }
  )
)

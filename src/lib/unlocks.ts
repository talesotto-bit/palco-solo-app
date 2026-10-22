/**
 * Recursos extras comprados à parte (order bumps / upsells). A Cakto envia no e-mail da compra
 * um link app.powertom.com.br/ativar/<código>; o código libera o recurso neste aparelho.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Feature = 'pedidos'

/** Códigos de ativação de cada recurso (o mesmo vai no e-mail de entrega da Cakto) */
const CODES: Record<string, Feature> = {
  'pedidos-pix-7q4m2k': 'pedidos',
}

/** Página de compra de cada recurso (para quem ainda não tem) */
export const CHECKOUT: Record<Feature, string> = {
  pedidos: '', // preencher com o link da Cakto do produto "Pedidos e Gorjeta via Pix"
}

interface UnlockState {
  features: Feature[]
  activate: (code: string) => Feature | null
  has: (f: Feature) => boolean
}

export const useUnlocks = create<UnlockState>()(
  persist(
    (set, get) => ({
      features: [],
      activate: (code) => {
        const f = CODES[code.trim().toLowerCase()]
        if (!f) return null
        if (!get().features.includes(f)) set(s => ({ features: [...s.features, f] }))
        return f
      },
      has: (f) => get().features.includes(f),
    }),
    { name: 'unlocks-v1' }
  )
)

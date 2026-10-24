/**
 * Recursos extras comprados à parte (order bumps / upsells). A Cakto envia no e-mail da compra
 * um link app.powertom.com.br/ativar/<código>; o código libera o recurso neste aparelho.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Feature = 'pedidos' | 'multipistas'

/** Códigos de ativação de cada recurso (o mesmo vai no e-mail de entrega da Cakto) */
const CODES: Record<string, Feature> = {
  'pedidos-pix-7q4m2k': 'pedidos',
  'multipistas-k8r3vd': 'multipistas',
}

/** Página de compra de cada recurso (para quem ainda não tem) */
export const CHECKOUT: Record<Feature, string> = {
  pedidos: 'https://pay.cakto.com.br/mjhxvqz_1239757', // Cakto: "Pedidos e Gorjeta via Pix"
  multipistas: '', // preencher com o link da Cakto do produto "Pacote Multipistas"
}

/** Preço mostrado dentro do app para quem ainda não tem o recurso */
export const PRICE: Record<Feature, string> = {
  pedidos: 'R$ 27',
  multipistas: 'R$ 67',
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

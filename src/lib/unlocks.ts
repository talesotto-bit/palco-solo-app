/**
 * Recursos extras comprados à parte (order bumps / upsells). A Cakto envia no e-mail da compra
 * um link app.powertom.com.br/ativar/<código>; o código libera o recurso neste aparelho.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Feature = 'pedidos' | 'multipistas' | 'app'

/** Códigos de ativação de cada recurso (o mesmo vai no e-mail de entrega da Cakto) */
const CODES: Record<string, Feature> = {
  'pedidos-pix-7q4m2k': 'pedidos',
  'multipistas-k8r3vd': 'multipistas',
  // app completo (libera quem testou antes de comprar): vai no e-mail de entrega e na página de obrigado
  'app-vitalicio-r7m4xq': 'app',
}

/** Página de compra de cada recurso (para quem ainda não tem) */
export const CHECKOUT: Record<Feature, string> = {
  pedidos: 'https://pay.cakto.com.br/mjhxvqz_1239757', // Cakto: "Pedidos e Gorjeta via Pix"
  multipistas: 'https://pay.cakto.com.br/e2y8utm_1239819', // Cakto: "Pacote Multipistas"
  app: 'https://pay.cakto.com.br/ygt9oqx_1225675', // Cakto: Power Tom (oferta principal)
}

/** Preço mostrado dentro do app para quem ainda não tem o recurso */
export const PRICE: Record<Feature, string> = {
  pedidos: 'R$ 27',
  multipistas: 'R$ 67',
  app: 'R$ 47',
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

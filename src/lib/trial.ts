/**
 * Modo teste: quem chega pelo link de teste (app.powertom.com.br/experimente) usa o app completo,
 * com 4 músicas liberadas. As outras aparecem com cadeado e abrem a tela de compra.
 * Só vale no aparelho que entrou pelo link de teste: quem já comprou e nunca passou por ele não é afetado.
 * Quem compra depois de testar libera pelo link de ativação (app.powertom.com.br/ativar/<código>).
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useUnlocks } from './unlocks'
import type { Track } from '@/types/track'

export const APP_CHECKOUT = 'https://pay.cakto.com.br/ygt9oqx_1225675'

/** As 4 músicas liberadas no teste (mesmas do experimente.json) */
export const DEMO_IDS = new Set([
  'r2-pagode-intimistas-deixa-alagar',
  'r2-gospel-gabriela-rocha-lugar-secreto',
  'r2-rock-pop-mpb-legiao-urbana-tempo-perdido',
  'r2-atualizacoes-arranhao-henrique-e-juliano',
])

interface TrialState {
  active: boolean
  /** música que o cliente tentou abrir (null = tela fechada; 'geral' = sem música específica) */
  paywall: Track | 'geral' | null
  start: () => void
  openPaywall: (t?: Track) => void
  closePaywall: () => void
}

export const useTrial = create<TrialState>()(
  persist(
    (set) => ({
      active: false,
      paywall: null,
      start: () => set({ active: true }),
      openPaywall: (t) => set({ paywall: t ?? 'geral' }),
      closePaywall: () => set({ paywall: null }),
    }),
    { name: 'trial-v1', partialize: s => ({ active: s.active }) }
  )
)

/** No teste o app carrega só as 4 músicas: a biblioteca inteira aparece depois da compra */
export const FULL_CATALOG = '/catalog.json'
export const TRIAL_CATALOG = '/experimente.json'
export function catalogUrl(): string {
  return inTrial() ? TRIAL_CATALOG : FULL_CATALOG
}

/** Está testando (e ainda não comprou)? */
export function inTrial(): boolean {
  return useTrial.getState().active && !useUnlocks.getState().has('app')
}

/** Música trancada no teste: fora das 4 liberadas (as músicas do próprio músico sempre abrem) */
export function isLocked(track: Pick<Track, 'id'>): boolean {
  return inTrial() && !DEMO_IDS.has(track.id) && !track.id.startsWith('local-')
}

/** Hook para a interface reagir quando o teste começa ou o app é liberado */
export function useInTrial(): boolean {
  const active = useTrial(s => s.active)
  const bought = useUnlocks(s => s.features.includes('app'))
  return active && !bought
}

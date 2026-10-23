/** Dias de ensaio e músicas tocadas (para a sequência 🔥 da tela inicial). Fica no aparelho. */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

interface PracticeState {
  /** dia → quantas músicas diferentes tocou */
  days: Record<string, string[]>
  record: (trackId: string) => void
}

export const usePracticeStore = create<PracticeState>()(
  persist(
    (set) => ({
      days: {},
      record: (trackId) => set(s => {
        const k = dayKey()
        const list = s.days[k] || []
        if (list.includes(trackId)) return s
        const days = { ...s.days, [k]: [...list, trackId].slice(-200) }
        // guarda só os últimos 60 dias
        const keys = Object.keys(days).sort()
        for (const old of keys.slice(0, Math.max(0, keys.length - 60))) delete days[old]
        return { days }
      }),
    }),
    { name: 'practice-v1' }
  )
)

/** Sequência de dias seguidos (conta hoje ou, se ainda não tocou hoje, até ontem) e músicas na semana */
export function practiceStats(days: Record<string, string[]>) {
  const d = new Date()
  const todayDone = !!days[dayKey(d)]?.length
  if (!todayDone) d.setDate(d.getDate() - 1)
  let streak = 0
  while (days[dayKey(d)]?.length) { streak++; d.setDate(d.getDate() - 1) }
  let week = 0
  const w = new Date()
  for (let i = 0; i < 7; i++) { week += days[dayKey(w)]?.length || 0; w.setDate(w.getDate() - 1) }
  return { streak, todayDone, week }
}

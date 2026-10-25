/**
 * Progresso do músico (fica no aparelho):
 * - situação de cada música: Aprendendo → Ensaiando → Pronta pro show (avança sozinha com o uso, ou o músico escolhe);
 * - conquistas (sequência de dias, músicas prontas, horas de ensaio, shows, gravações).
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { toast } from 'sonner'
import { usePracticeStore, practiceStats } from './practiceStore'

export type SongStatus = 'aprendendo' | 'ensaiando' | 'pronta'

export interface SongProgress {
  /** segundos ouvidos/tocados */
  listened: number
  /** vezes que tocou a música até o fim */
  plays: number
  /** trechos dominados no treino progressivo */
  trainer: number
  /** escolha do músico (vale mais que a automática) */
  manual?: SongStatus | null
  lastAt: number
}

export const STATUS_INFO: Record<SongStatus, { label: string; short: string; emoji: string; className: string }> = {
  aprendendo: { label: 'Aprendendo', short: 'Aprendendo', emoji: '🌱', className: 'bg-sky-400/15 text-sky-300' },
  ensaiando: { label: 'Ensaiando', short: 'Ensaiando', emoji: '🎯', className: 'bg-amber-400/15 text-amber-300' },
  pronta: { label: 'Pronta pro show', short: 'Pronta', emoji: '✅', className: 'bg-[hsl(var(--primary))]/20 text-[hsl(var(--primary))]' },
}

/** Situação automática: tocou até o fim 3 vezes (ou 1 vez + treino) = pronta; tocou inteira ou 3 min = ensaiando */
export function songStatus(p?: SongProgress): SongStatus | null {
  if (!p) return null
  if (p.manual) return p.manual
  if (p.plays >= 3 || (p.plays >= 1 && p.trainer >= 1)) return 'pronta'
  if (p.plays >= 1 || p.listened >= 180) return 'ensaiando'
  if (p.listened >= 20) return 'aprendendo'
  return null
}

/** O que falta para a próxima etapa (aparece no player) */
export function nextStepHint(p?: SongProgress): string | null {
  const st = songStatus(p)
  if (!p || p.manual || st === 'pronta') return null
  if (st === 'ensaiando') return `Toque até o fim mais ${Math.max(1, 3 - p.plays)} vez${3 - p.plays === 1 ? '' : 'es'} (ou domine um trecho no treino) para ficar pronta`
  return 'Toque a música até o fim para passar para "Ensaiando"'
}

interface Ctx { ready: number; plays: number; hours: number; streak: number; trainer: number; shows: number; recordings: number }
export interface Achievement { id: string; emoji: string; title: string; desc: string; goal: number; value: (c: Ctx) => number }

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'play-1', emoji: '🎵', title: 'Primeira do repertório', desc: 'Tocar uma música até o fim', goal: 1, value: c => c.plays },
  { id: 'streak-3', emoji: '🔥', title: 'Pegando ritmo', desc: '3 dias seguidos ensaiando', goal: 3, value: c => c.streak },
  { id: 'streak-7', emoji: '🔥', title: 'Semana de ensaio', desc: '7 dias seguidos ensaiando', goal: 7, value: c => c.streak },
  { id: 'streak-30', emoji: '🏆', title: 'Disciplina de profissional', desc: '30 dias seguidos ensaiando', goal: 30, value: c => c.streak },
  { id: 'ready-1', emoji: '✅', title: 'Pronta pro show', desc: '1 música pronta', goal: 1, value: c => c.ready },
  { id: 'ready-10', emoji: '🎤', title: 'Repertório de barzinho', desc: '10 músicas prontas', goal: 10, value: c => c.ready },
  { id: 'ready-30', emoji: '🌟', title: 'Show completo', desc: '30 músicas prontas', goal: 30, value: c => c.ready },
  { id: 'hours-1', emoji: '⏱️', title: 'Primeira hora', desc: '1 hora de ensaio no app', goal: 1, value: c => c.hours },
  { id: 'hours-10', emoji: '💪', title: 'Dez horas de estrada', desc: '10 horas de ensaio no app', goal: 10, value: c => c.hours },
  { id: 'trainer-1', emoji: '🎯', title: 'Trecho dominado', desc: 'Chegar a 100% no treino progressivo', goal: 1, value: c => c.trainer },
  { id: 'trainer-10', emoji: '🥇', title: 'Mestre dos trechos', desc: '10 trechos dominados', goal: 10, value: c => c.trainer },
  { id: 'show-1', emoji: '🎉', title: 'Primeiro show', desc: 'Tocar um show inteiro no Modo Palco', goal: 1, value: c => c.shows },
  { id: 'show-5', emoji: '🎸', title: 'Na estrada', desc: '5 shows completos no Modo Palco', goal: 5, value: c => c.shows },
  { id: 'rec-1', emoji: '🎙️', title: 'Primeira gravação', desc: 'Gravar você tocando junto', goal: 1, value: c => c.recordings },
  { id: 'rec-10', emoji: '📼', title: 'Artista de estúdio', desc: '10 gravações', goal: 10, value: c => c.recordings },
]

interface ProgressState {
  songs: Record<string, SongProgress>
  recordings: number
  showsDone: number
  /** id da conquista → quando ganhou */
  unlocked: Record<string, number>
  addListen: (trackId: string, secs: number) => void
  addPlay: (trackId: string) => void
  addTrainer: (trackId: string) => void
  setManual: (trackId: string, status: SongStatus | null) => void
  addRecording: () => void
  addShow: () => void
}

const touch = (songs: Record<string, SongProgress>, id: string, patch: (p: SongProgress) => Partial<SongProgress>) => {
  const p = songs[id] || { listened: 0, plays: 0, trainer: 0, lastAt: 0 }
  return { ...songs, [id]: { ...p, ...patch(p), lastAt: Date.now() } }
}

export const useProgressStore = create<ProgressState>()(
  persist(
    (set) => ({
      songs: {},
      recordings: 0,
      showsDone: 0,
      unlocked: {},
      addListen: (id, secs) => { if (secs > 0) set(s => ({ songs: touch(s.songs, id, p => ({ listened: Math.round((p.listened + secs) * 10) / 10 })) })) },
      addPlay: (id) => {
        const before = songStatus(useProgressStore.getState().songs[id])
        set(s => ({ songs: touch(s.songs, id, p => ({ plays: p.plays + 1 })) }))
        const after = songStatus(useProgressStore.getState().songs[id])
        if (after !== before && after) toast.success(`${STATUS_INFO[after].emoji} Música agora: ${STATUS_INFO[after].label}`)
      },
      addTrainer: (id) => set(s => ({ songs: touch(s.songs, id, p => ({ trainer: p.trainer + 1 })) })),
      setManual: (id, status) => set(s => ({ songs: touch(s.songs, id, () => ({ manual: status })) })),
      addRecording: () => set(s => ({ recordings: s.recordings + 1 })),
      addShow: () => set(s => ({ showsDone: s.showsDone + 1 })),
    }),
    { name: 'progress-v1' }
  )
)

export function progressCtx(): Ctx {
  const s = useProgressStore.getState()
  const all = Object.values(s.songs)
  return {
    ready: all.filter(p => songStatus(p) === 'pronta').length,
    plays: all.reduce((n, p) => n + p.plays, 0),
    hours: all.reduce((n, p) => n + p.listened, 0) / 3600,
    streak: practiceStats(usePracticeStore.getState().days).streak,
    trainer: all.reduce((n, p) => n + p.trainer, 0),
    shows: s.showsDone,
    recordings: s.recordings,
  }
}

/** Confere conquistas novas e comemora (uma de cada vez; várias juntas viram um aviso só) */
function evaluate() {
  const s = useProgressStore.getState()
  const c = progressCtx()
  const fresh = ACHIEVEMENTS.filter(a => !s.unlocked[a.id] && a.value(c) >= a.goal)
  if (!fresh.length) return
  const now = Date.now()
  useProgressStore.setState({ unlocked: { ...s.unlocked, ...Object.fromEntries(fresh.map(a => [a.id, now])) } })
  if (fresh.length === 1) toast.success(`${fresh[0].emoji} Conquista: ${fresh[0].title}`, { description: fresh[0].desc })
  else toast.success(`🏆 ${fresh.length} conquistas desbloqueadas`, { description: fresh.map(a => a.title).join(' · ') })
  void import('@/lib/confetti').then(m => m.confetti())
}

let timer: ReturnType<typeof setTimeout> | null = null
const schedule = () => { if (timer) clearTimeout(timer); timer = setTimeout(evaluate, 1500) }
useProgressStore.subscribe(schedule)
usePracticeStore.subscribe(schedule)
// ao abrir o app: confere o que já foi conquistado (inclusive o histórico de antes desta versão)
if (typeof window !== 'undefined') setTimeout(evaluate, 4000)

/**
 * Situação das músicas (Aprendendo → Ensaiando → Pronta pro show) e conquistas.
 */
import { useState } from 'react'
import { Check, Trophy } from 'lucide-react'
import { Sheet } from '@/components/ui/sheet'
import { useProgressStore, songStatus, nextStepHint, STATUS_INFO, ACHIEVEMENTS, progressCtx, type SongStatus } from '@/store/progressStore'
import { cn } from '@/lib/utils'

/** Selo pequeno (lista de músicas, setlist) */
export function StatusBadge({ trackId, className }: { trackId: string; className?: string }) {
  const st = useProgressStore(s => songStatus(s.songs[trackId]))
  if (!st) return null
  const info = STATUS_INFO[st]
  return <span title={info.label} className={cn('inline-flex items-center rounded-full px-1.5 text-[10px] font-bold leading-4 shrink-0', info.className, className)}>{info.emoji} {info.short}</span>
}

/** Botão do player: mostra a situação e deixa o músico escolher */
export function SongStatusChip({ trackId }: { trackId: string }) {
  const p = useProgressStore(s => s.songs[trackId])
  const setManual = useProgressStore(s => s.setManual)
  const [open, setOpen] = useState(false)
  const st = songStatus(p)
  const info = st ? STATUS_INFO[st] : null
  const hint = nextStepHint(p)
  const choose = (v: SongStatus | null) => { setManual(trackId, v); setOpen(false) }
  return (
    <>
      <button onClick={() => setOpen(true)} className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full', info ? info.className : 'bg-white/10 text-white/70')}>
        {info ? `${info.emoji} ${info.label}` : '🌱 Nova pra mim'}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Como está esta música?">
        <div className="p-3 space-y-2" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}>
          {hint && <p className="px-1 pb-1 text-xs text-[#b3b3b3]">{hint}.</p>}
          {(Object.keys(STATUS_INFO) as SongStatus[]).map(k => (
            <button key={k} onClick={() => choose(k)}
              className={cn('w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left active:bg-white/10', st === k ? 'bg-white/10' : 'bg-white/[0.04]')}>
              <span className="text-xl">{STATUS_INFO[k].emoji}</span>
              <span className="flex-1 font-semibold">{STATUS_INFO[k].label}</span>
              {st === k && <Check className="h-5 w-5 text-[hsl(var(--primary))]" />}
            </button>
          ))}
          <button onClick={() => choose(null)} className={cn('w-full rounded-xl px-3 py-3 text-left text-sm active:bg-white/10', !p?.manual ? 'bg-white/10' : 'bg-white/[0.04]')}>
            <span className="font-semibold">Automático</span>
            <span className="block text-xs text-[#9a9a9a]">Avança sozinho: tocar até o fim, treinar trechos e ensaiar</span>
          </button>
          {p && <p className="px-1 pt-1 text-[11px] text-[#7a7a7a]">Tocada até o fim {p.plays}× · {Math.round(p.listened / 60)} min de ensaio{p.trainer ? ` · ${p.trainer} trecho(s) dominado(s)` : ''}</p>}
        </div>
      </Sheet>
    </>
  )
}

/** Lista de conquistas com o progresso de cada uma */
export function AchievementsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const unlocked = useProgressStore(s => s.unlocked)
  useProgressStore(s => s.songs) // atualiza com o progresso
  const c = progressCtx()
  const done = ACHIEVEMENTS.filter(a => unlocked[a.id]).length
  return (
    <Sheet open={open} onClose={onClose} title={<span className="flex items-center gap-2"><Trophy className="h-5 w-5 text-amber-400" /> Conquistas · {done}/{ACHIEVEMENTS.length}</span>}>
      <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}>
        {ACHIEVEMENTS.map(a => {
          const got = !!unlocked[a.id] || a.value(c) >= a.goal
          const v = Math.min(a.goal, a.value(c))
          return (
            <div key={a.id} className={cn('flex items-center gap-3 rounded-xl p-3', got ? 'bg-amber-400/10 border border-amber-400/25' : 'bg-white/[0.04]')}>
              <span className={cn('text-2xl', !got && 'grayscale opacity-40')}>{a.emoji}</span>
              <span className="flex-1 min-w-0">
                <span className={cn('block text-sm font-bold truncate', !got && 'text-white/70')}>{a.title}</span>
                <span className="block text-[11px] text-[#9a9a9a]">{a.desc}</span>
                {!got && (
                  <span className="mt-1.5 flex items-center gap-2">
                    <span className="h-1.5 flex-1 rounded-full bg-white/10 overflow-hidden"><span className="block h-full bg-amber-400" style={{ width: `${(v / a.goal) * 100}%` }} /></span>
                    <span className="text-[10px] tabular-nums text-[#9a9a9a]">{a.id.startsWith('hours') ? v.toFixed(1) : Math.floor(v)}/{a.goal}</span>
                  </span>
                )}
              </span>
              {got && <Check className="h-5 w-5 text-amber-400 shrink-0" />}
            </div>
          )
        })}
      </div>
    </Sheet>
  )
}

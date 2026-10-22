import { usePrefsStore, PLAYABLE } from '@/store/prefsStore'
import { cn } from '@/lib/utils'

/** "O que você toca ao vivo?" — esses instrumentos já abrem desligados no mixer */
export function InstrumentPicker() {
  const plays = usePrefsStore(s => s.plays)
  const toggle = usePrefsStore(s => s.togglePlay)
  return (
    <div className="flex flex-wrap gap-2">
      {PLAYABLE.map(p => {
        const on = plays.includes(p.id)
        return (
          <button key={p.id} onClick={() => toggle(p.id)} aria-pressed={on}
            className={cn('h-11 px-4 rounded-full text-sm font-semibold flex items-center gap-1.5 transition-colors',
              on ? 'bg-[hsl(var(--primary))] text-black' : 'bg-white/[0.08] text-white/85')}>
            <span>{p.emoji}</span>{p.label}
          </button>
        )
      })}
    </div>
  )
}

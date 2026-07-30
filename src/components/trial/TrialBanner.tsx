import { useEffect, useState } from 'react'
import { Clock, Zap } from 'lucide-react'
import { useTrialStore, getTrialRemaining, formatTrialTime } from '@/store/trialStore'
import { cn } from '@/lib/utils'

export function TrialBanner() {
  const isTrialMode = useTrialStore(s => s.isTrialMode)
  const usedMs = useTrialStore(s => s.usedMs)
  const extended = useTrialStore(s => s.extended)
  const expired = useTrialStore(s => s.expired)
  const playStartedAt = useTrialStore(s => s._playStartedAt)
  const [, setTick] = useState(0)

  // Re-render every 500ms to keep countdown display in sync
  useEffect(() => {
    if (!isTrialMode || expired) return
    const id = setInterval(() => setTick(t => t + 1), 500)
    return () => clearInterval(id)
  }, [isTrialMode, expired])

  if (!isTrialMode || expired) return null

  const remaining = getTrialRemaining({ usedMs, extended, _playStartedAt: playStartedAt })
  const isLow = remaining <= 60
  const isCritical = remaining <= 30

  return (
    <div className="shrink-0">
      <div className={cn(
        'flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold transition-colors',
        isCritical
          ? 'bg-red-600 text-white animate-pulse'
          : isLow
            ? 'bg-amber-500 text-black'
            : 'bg-[hsl(var(--primary))]/15 text-[hsl(var(--primary))]'
      )}>
        <Clock className="h-3.5 w-3.5" />
        <span>Teste grátis — {formatTrialTime(remaining)} restantes</span>
        {!isLow && (
          <span className="hidden sm:inline text-[10px] opacity-70 ml-1">
            (conta apenas enquanto a música toca)
          </span>
        )}
        {isCritical && <Zap className="h-3.5 w-3.5" />}
      </div>
    </div>
  )
}

import { useEffect, useRef } from 'react'
import { Clock, Zap } from 'lucide-react'
import { useTrialStore, getTrialRemaining, formatTrialTime } from '@/store/trialStore'
import { usePlayerStore } from '@/store/playerStore'
import { cn } from '@/lib/utils'

export function TrialBanner() {
  const isTrialMode = useTrialStore(s => s.isTrialMode)
  const usedSeconds = useTrialStore(s => s.usedSeconds)
  const extended = useTrialStore(s => s.extended)
  const expired = useTrialStore(s => s.expired)
  const tick = useTrialStore(s => s.tick)
  const intervalRef = useRef<ReturnType<typeof setInterval>>()

  useEffect(() => {
    if (!isTrialMode || expired) return
    intervalRef.current = setInterval(() => {
      const playing = usePlayerStore.getState().playbackState === 'playing'
      if (playing) tick()
    }, 1000)
    return () => clearInterval(intervalRef.current)
  }, [isTrialMode, expired, tick])

  if (!isTrialMode || expired) return null

  const remaining = getTrialRemaining({ usedSeconds, extended })
  const isLow = remaining <= 60
  const isCritical = remaining <= 30

  return (
    <div className={cn(
      'flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold shrink-0 transition-colors',
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
  )
}

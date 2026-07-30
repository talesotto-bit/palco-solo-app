import { useEffect, useRef, useState } from 'react'
import { Clock, Zap, Volume2, X } from 'lucide-react'
import { useTrialStore, getTrialRemaining, formatTrialTime } from '@/store/trialStore'
import { cn } from '@/lib/utils'

export function TrialBanner() {
  const isTrialMode = useTrialStore(s => s.isTrialMode)
  const usedMs = useTrialStore(s => s.usedMs)
  const extended = useTrialStore(s => s.extended)
  const expired = useTrialStore(s => s.expired)
  const playStartedAt = useTrialStore(s => s._playStartedAt)
  const flush = useTrialStore(s => s.flush)
  const [, setTick] = useState(0)
  const [showSoundTip, setShowSoundTip] = useState(true)
  const intervalRef = useRef<ReturnType<typeof setInterval>>()
  const tipTimerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (!isTrialMode || expired) return
    intervalRef.current = setInterval(() => {
      flush()
      setTick(t => t + 1)
    }, 1000)
    return () => clearInterval(intervalRef.current)
  }, [isTrialMode, expired, flush])

  // Auto-hide sound tip after 45 seconds from mount
  useEffect(() => {
    if (!isTrialMode) return
    tipTimerRef.current = setTimeout(() => setShowSoundTip(false), 45_000)
    return () => clearTimeout(tipTimerRef.current)
  }, [isTrialMode])

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

      {showSoundTip && (
        <div className="flex items-center justify-center gap-2 px-4 py-1.5 bg-amber-500/10 text-amber-400 text-[11px] font-medium">
          <Volume2 className="h-3.5 w-3.5 shrink-0" />
          <span>Sem som? Retire o telefone do Modo Silencioso e aumente o volume!</span>
          <button
            onClick={() => setShowSoundTip(false)}
            className="ml-1 p-0.5 rounded hover:bg-white/10 transition-colors shrink-0"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  )
}

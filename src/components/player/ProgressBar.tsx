import { useRef, useState } from 'react'
import { usePlayerStore } from '@/store/playerStore'
import { formatTime } from '@/lib/utils'
import { cn } from '@/lib/utils'

export function ProgressBar() {
  const { currentTime, duration, seek, playbackState } = usePlayerStore()
  const barRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [hoverX, setHoverX] = useState<number | null>(null)

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0
  const isLoading = playbackState === 'loading'

  const getTimeFromEvent = (e: React.MouseEvent<HTMLDivElement> | MouseEvent) => {
    if (!barRef.current || duration === 0) return 0
    const rect = barRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    return ratio * duration
  }

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    seek(getTimeFromEvent(e))
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!barRef.current) return
    const rect = barRef.current.getBoundingClientRect()
    setHoverX(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)))
  }

  const hoverTime = hoverX !== null && duration > 0 ? hoverX * duration : null

  return (
    <div className="w-full space-y-1.5">
      {/* Progress track */}
      <div
        ref={barRef}
        className="group relative h-2 md:h-1 md:hover:h-1.5 w-full cursor-pointer rounded-full bg-white/10 transition-all"
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverX(null)}
      >
        {/* Progress fill */}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-white group-hover:bg-[hsl(var(--primary))] transition-colors duration-75"
          style={{ width: `${progress}%` }}
        />

        {/* Thumb */}
        <div
          className={cn(
            'absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full bg-white shadow-md transition-all',
            isDragging
              ? 'h-3.5 w-3.5 opacity-100'
              : 'h-3 w-3 opacity-0 group-hover:opacity-100'
          )}
          style={{ left: `${progress}%` }}
        />

        {/* Hover time tooltip */}
        {hoverTime !== null && (
          <div
            className="absolute -top-8 -translate-x-1/2 px-2 py-0.5 rounded bg-[#2a2a2a] text-white text-[10px] font-medium tabular-nums opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
            style={{ left: `${hoverX! * 100}%` }}
          >
            {formatTime(hoverTime)}
          </div>
        )}

        {/* Loading shimmer */}
        {isLoading && (
          <div className="absolute inset-0 rounded-full overflow-hidden">
            <div className="h-full w-1/3 bg-white/20 animate-pulse" />
          </div>
        )}
      </div>

      {/* Time labels */}
      <div className="flex items-center justify-between text-xs md:text-[11px] tabular-nums text-[#b3b3b3]">
        <span>{formatTime(currentTime)}</span>
        <span>-{formatTime(Math.max(0, duration - currentTime))}</span>
      </div>
    </div>
  )
}

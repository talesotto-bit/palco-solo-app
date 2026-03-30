import { Minus, Plus, RotateCcw } from 'lucide-react'
import { usePlayerStore } from '@/store/playerStore'
import { Slider } from '@/components/ui/slider'
import { semitonesToLabel } from '@/lib/utils'
import { cn } from '@/lib/utils'

const KEY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

interface PitchControlProps {
  compact?: boolean
}

export function PitchControl({ compact = false }: PitchControlProps) {
  const { pitch, setPitch, resetPitch } = usePlayerStore()

  const step = (direction: 1 | -1) => {
    const next = pitch + direction
    if (next >= -12 && next <= 12) setPitch(next)
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-white uppercase tracking-wider">Tom (Pitch)</p>
        <button
          onClick={resetPitch}
          disabled={pitch === 0}
          className={cn(
            'flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 transition-colors',
            pitch !== 0
              ? 'text-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 hover:bg-[hsl(var(--primary))]/20'
              : 'text-[#535353] cursor-default'
          )}
        >
          <RotateCcw className="h-2.5 w-2.5" />
          Reset
        </button>
      </div>

      {/* Value display — large */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => step(-1)}
          disabled={pitch <= -12}
          className="flex items-center justify-center h-11 w-11 md:h-8 md:w-8 rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 transition-colors"
        >
          <Minus className="h-4 w-4 md:h-3.5 md:w-3.5" />
        </button>

        <div className="text-center min-w-[80px]">
          <span className={cn(
            'text-2xl font-bold tabular-nums',
            pitch === 0 ? 'text-[#b3b3b3]' : 'text-[hsl(var(--primary))]'
          )}>
            {pitch > 0 ? '+' : ''}{pitch}
          </span>
          <span className="text-xs text-[#b3b3b3] ml-1">st</span>
        </div>

        <button
          onClick={() => step(1)}
          disabled={pitch >= 12}
          className="flex items-center justify-center h-11 w-11 md:h-8 md:w-8 rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 transition-colors"
        >
          <Plus className="h-4 w-4 md:h-3.5 md:w-3.5" />
        </button>
      </div>

      {/* Slider */}
      <div className="space-y-1">
        <Slider
          min={-12}
          max={12}
          step={1}
          value={[pitch]}
          onValueChange={([v]) => setPitch(v)}
        />
        <div className="flex justify-between text-[10px] md:text-[9px] text-[#535353] px-0.5">
          <span>-12</span>
          <span>0</span>
          <span>+12</span>
        </div>
      </div>

      {/* Quick presets */}
      <div className="flex items-center justify-center gap-1.5 md:gap-1">
        {[-5, -3, -1, 0, 1, 3, 5].map(v => (
          <button
            key={v}
            onClick={() => setPitch(v)}
            className={cn(
              'h-9 min-w-[38px] md:h-7 md:min-w-[32px] rounded-md text-xs md:text-[10px] font-bold transition-colors',
              Math.abs(pitch - v) < 0.5
                ? 'bg-[hsl(var(--primary))] text-black'
                : 'bg-white/5 text-[#b3b3b3] hover:bg-white/10 hover:text-white'
            )}
          >
            {v > 0 ? '+' : ''}{v}
          </button>
        ))}
      </div>
    </div>
  )
}

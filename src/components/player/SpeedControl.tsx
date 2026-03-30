import { Minus, Plus, RotateCcw } from 'lucide-react'
import { usePlayerStore } from '@/store/playerStore'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'

const SPEED_PRESETS = [
  { label: '0.5x', value: 0.5 },
  { label: '0.7x', value: 0.7 },
  { label: '0.8x', value: 0.8 },
  { label: '0.9x', value: 0.9 },
  { label: '0.95x', value: 0.95 },
  { label: '1x', value: 1.0 },
  { label: '1.05x', value: 1.05 },
  { label: '1.1x', value: 1.1 },
  { label: '1.2x', value: 1.2 },
  { label: '1.5x', value: 1.5 },
]

interface SpeedControlProps {
  compact?: boolean
}

export function SpeedControl({ compact = false }: SpeedControlProps) {
  const { speed, setSpeed, resetSpeed } = usePlayerStore()
  const track = usePlayerStore(s => s.track)

  const step = (direction: 1 | -1) => {
    const next = Math.round((speed + direction * 0.01) * 100) / 100
    if (next >= 0.5 && next <= 2.0) setSpeed(next)
  }

  const pct = Math.round(speed * 100)
  const bpm = track?.bpm ? Math.round(track.bpm * speed) : null

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-white uppercase tracking-wider">Velocidade</p>
        <button
          onClick={resetSpeed}
          disabled={speed === 1}
          className={cn(
            'flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 transition-colors',
            speed !== 1
              ? 'text-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 hover:bg-[hsl(var(--primary))]/20'
              : 'text-[#535353] cursor-default'
          )}
        >
          <RotateCcw className="h-2.5 w-2.5" />
          Reset
        </button>
      </div>

      {/* Value display */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => step(-1)}
          disabled={speed <= 0.5}
          className="flex items-center justify-center h-11 w-11 md:h-8 md:w-8 rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 transition-colors"
        >
          <Minus className="h-4 w-4 md:h-3.5 md:w-3.5" />
        </button>

        <div className="text-center min-w-[80px]">
          <span className={cn(
            'text-2xl font-bold tabular-nums',
            speed === 1 ? 'text-[#b3b3b3]' : 'text-[hsl(var(--primary))]'
          )}>
            {pct}
          </span>
          <span className="text-xs text-[#b3b3b3] ml-1">%</span>
          {bpm && bpm > 0 && speed !== 1 && (
            <p className="text-[10px] text-[#808080] mt-0.5">
              {track!.bpm} → {bpm} BPM
            </p>
          )}
        </div>

        <button
          onClick={() => step(1)}
          disabled={speed >= 2.0}
          className="flex items-center justify-center h-11 w-11 md:h-8 md:w-8 rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 transition-colors"
        >
          <Plus className="h-4 w-4 md:h-3.5 md:w-3.5" />
        </button>
      </div>

      {/* Slider */}
      <div className="space-y-1">
        <Slider
          min={0.5}
          max={2.0}
          step={0.01}
          value={[speed]}
          onValueChange={([v]) => setSpeed(Math.round(v * 100) / 100)}
        />
        <div className="flex justify-between text-[10px] md:text-[9px] text-[#535353] px-0.5">
          <span>50%</span>
          <span>100%</span>
          <span>200%</span>
        </div>
      </div>

      {/* Presets */}
      <div className="flex items-center justify-center gap-1.5 md:gap-1 flex-wrap">
        {SPEED_PRESETS.map(p => (
          <button
            key={p.value}
            onClick={() => setSpeed(p.value)}
            className={cn(
              'h-9 min-w-[38px] md:h-7 md:min-w-[34px] rounded-md text-xs md:text-[10px] font-bold transition-colors',
              Math.abs(speed - p.value) < 0.005
                ? 'bg-[hsl(var(--primary))] text-black'
                : 'bg-white/5 text-[#b3b3b3] hover:bg-white/10 hover:text-white'
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )
}

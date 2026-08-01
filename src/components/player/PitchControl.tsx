import { Minus, Plus, RotateCcw, ChevronDown, ChevronUp, Lock } from 'lucide-react'
import { usePlayerStore } from '@/store/playerStore'
import { useTrialStore } from '@/store/trialStore'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import { useState } from 'react'

interface PitchControlProps {
  compact?: boolean
}

export function PitchControl({ compact = false }: PitchControlProps) {
  const pitch = usePlayerStore(s => s.pitch)
  const setPitch = usePlayerStore(s => s.setPitch)
  const resetPitch = usePlayerStore(s => s.resetPitch)
  const isTrialMode = useTrialStore(s => s.isTrialMode)
  const [fineMode, setFineMode] = useState(false)
  const [showBanner, setShowBanner] = useState(false)

  const locked = isTrialMode

  const semitones = Math.trunc(pitch)
  const cents = Math.round((pitch - semitones) * 100)

  const handleLockedAction = () => {
    if (locked) { setShowBanner(true); return true }
    return false
  }

  const stepCoarse = (dir: 1 | -1) => {
    if (handleLockedAction()) return
    const next = Math.round((pitch + dir * 0.5) * 10) / 10
    if (next >= -12 && next <= 12) setPitch(next)
  }

  const stepFine = (dir: 1 | -1) => {
    if (handleLockedAction()) return
    const next = Math.round((pitch + dir * 0.1) * 10) / 10
    if (next >= -12 && next <= 12) setPitch(next)
  }

  const handleSlider = ([v]: number[]) => {
    if (handleLockedAction()) return
    setPitch(Math.round(v * 10) / 10)
  }

  const handlePreset = (v: number) => {
    if (v !== 0 && handleLockedAction()) return
    setPitch(v)
  }

  const formatPitch = (v: number) => {
    const s = Math.trunc(v)
    const c = Math.round((v - s) * 100)
    if (c === 0) return `${v > 0 ? '+' : ''}${s}`
    return `${v > 0 ? '+' : ''}${s}.${Math.abs(c / 10)}`
  }

  return (
    <div className="space-y-3">
      {/* Trial upsell banner */}
      {locked && showBanner && (
        <div className="relative rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 animate-fade-in">
          <button
            onClick={() => setShowBanner(false)}
            className="absolute top-1.5 right-2 text-[#808080] hover:text-white text-xs"
          >
            &times;
          </button>
          <div className="flex items-start gap-2.5">
            <Lock className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[12px] text-[#b3b3b3] leading-snug">
              <span className="font-semibold text-white">Ajuste o tom sem distorção</span> a partir da versão completa do Power Tom.
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-white uppercase tracking-wider">Tom (Pitch)</p>
          {locked && <Lock className="h-3 w-3 text-[#808080]" />}
          {!locked && (
            <button
              onClick={() => setFineMode(!fineMode)}
              className={cn(
                'text-[9px] font-bold rounded px-1.5 py-0.5 transition-colors',
                fineMode
                  ? 'bg-[hsl(var(--primary))]/20 text-[hsl(var(--primary))]'
                  : 'bg-white/5 text-[#808080] hover:text-white'
              )}
            >
              FINO
            </button>
          )}
        </div>
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

      {/* Coarse: semitone +/- */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => stepCoarse(-1)}
          disabled={!locked && pitch <= -12}
          className={cn(
            'flex items-center justify-center h-11 w-11 md:h-8 md:w-8 rounded-full transition-colors',
            locked
              ? 'bg-white/5 text-[#535353]'
              : 'bg-white/10 text-white hover:bg-white/20 disabled:opacity-30'
          )}
        >
          <Minus className="h-4 w-4 md:h-3.5 md:w-3.5" />
        </button>

        <div className="text-center min-w-[100px]">
          <span className={cn(
            'text-2xl font-bold tabular-nums',
            locked ? 'text-[#535353]' : pitch === 0 ? 'text-[#b3b3b3]' : 'text-[hsl(var(--primary))]'
          )}>
            {formatPitch(pitch)}
          </span>
          <span className="text-xs text-[#b3b3b3] ml-1">st</span>
          {cents !== 0 && (
            <p className="text-[10px] text-[#808080] mt-0.5">
              {cents > 0 ? '+' : ''}{cents} cents
            </p>
          )}
        </div>

        <button
          onClick={() => stepCoarse(1)}
          disabled={!locked && pitch >= 12}
          className={cn(
            'flex items-center justify-center h-11 w-11 md:h-8 md:w-8 rounded-full transition-colors',
            locked
              ? 'bg-white/5 text-[#535353]'
              : 'bg-white/10 text-white hover:bg-white/20 disabled:opacity-30'
          )}
        >
          <Plus className="h-4 w-4 md:h-3.5 md:w-3.5" />
        </button>
      </div>

      {/* Fine adjustment: ±10 cents */}
      {!locked && fineMode && (
        <div className="flex items-center justify-center gap-2 animate-fade-in">
          <span className="text-[10px] text-[#808080] font-medium">Ajuste fino</span>
          <button
            onClick={() => stepFine(-1)}
            disabled={pitch <= -12}
            className="flex items-center justify-center h-8 w-8 rounded-full bg-white/5 text-[#b3b3b3] hover:bg-white/10 hover:text-white disabled:opacity-30 transition-colors"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <span className="text-xs font-bold text-white tabular-nums min-w-[50px] text-center">
            {cents > 0 ? '+' : ''}{cents} ¢
          </span>
          <button
            onClick={() => stepFine(1)}
            disabled={pitch >= 12}
            className="flex items-center justify-center h-8 w-8 rounded-full bg-white/5 text-[#b3b3b3] hover:bg-white/10 hover:text-white disabled:opacity-30 transition-colors"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Slider */}
      <div className={cn('space-y-1', locked && 'opacity-40 pointer-events-none')}>
        <Slider
          min={-12}
          max={12}
          step={fineMode ? 0.1 : 0.5}
          value={[pitch]}
          onValueChange={handleSlider}
        />
        <div className="flex justify-between text-[10px] md:text-[9px] text-[#535353] px-0.5">
          <span>-12</span>
          <span>0</span>
          <span>+12</span>
        </div>
      </div>

      {/* Presets */}
      <div className="flex items-center justify-center gap-1.5 md:gap-1 flex-wrap">
        {[-3, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 3].map(v => (
          <button
            key={v}
            onClick={() => handlePreset(v)}
            className={cn(
              'h-9 min-w-[34px] md:h-7 md:min-w-[28px] rounded-md text-[11px] md:text-[10px] font-bold transition-colors',
              locked && v !== 0
                ? 'bg-white/5 text-[#535353]'
                : Math.abs(pitch - v) < 0.05
                  ? 'bg-[hsl(var(--primary))] text-black'
                  : 'bg-white/5 text-[#b3b3b3] hover:bg-white/10 hover:text-white'
            )}
          >
            {v > 0 ? '+' : ''}{v % 1 === 0 ? v : v.toFixed(1)}
          </button>
        ))}
      </div>
    </div>
  )
}

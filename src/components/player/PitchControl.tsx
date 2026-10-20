import { Minus, Plus, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react'
import { usePlayerStore } from '@/store/playerStore'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import { formatTons } from '@/lib/musicTheory'
import { useState } from 'react'

interface PitchControlProps {
  compact?: boolean
}

// Atalhos em semitons: -2 tons … +2 tons, de ½ em ½ tom
const PRESETS = [-4, -3, -2, -1, 0, 1, 2, 3, 4]

export function PitchControl({ compact = false }: PitchControlProps) {
  const pitch = usePlayerStore(s => s.pitch)
  const setPitch = usePlayerStore(s => s.setPitch)
  const resetPitch = usePlayerStore(s => s.resetPitch)
  const [fineMode, setFineMode] = useState(false)

  const semitones = Math.round(pitch)
  const cents = Math.round((pitch - semitones) * 100)

  // ½ tom por clique (1 semitom); valores fracionados antigos são arredondados
  const stepCoarse = (dir: 1 | -1) => {
    const next = Math.round(pitch) + dir
    if (next >= -12 && next <= 12) setPitch(next)
  }

  // Ajuste fino de 10 cents, para afinar com instrumento fora do padrão
  const stepFine = (dir: 1 | -1) => {
    const next = Math.round((pitch + dir * 0.1) * 10) / 10
    if (next >= -12 && next <= 12) setPitch(next)
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-white uppercase tracking-wider">Tom</p>
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
          Original
        </button>
      </div>

      {/* ½ tom +/- */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => stepCoarse(-1)}
          disabled={pitch <= -12}
          aria-label="Descer meio tom"
          className="flex items-center justify-center h-11 w-11 md:h-8 md:w-8 rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 transition-colors"
        >
          <Minus className="h-4 w-4 md:h-3.5 md:w-3.5" />
        </button>

        <div className="text-center min-w-[120px]">
          <span className={cn(
            'text-2xl font-bold tabular-nums',
            pitch === 0 ? 'text-[#b3b3b3]' : 'text-[hsl(var(--primary))]'
          )}>
            {semitones === 0 ? 'Original' : formatTons(semitones)}
          </span>
          {(semitones !== 0 || cents !== 0) && (
            <p className="text-[10px] text-[#808080] mt-0.5 tabular-nums">
              {semitones !== 0 && `${semitones > 0 ? '+' : ''}${semitones} semitom${Math.abs(semitones) > 1 ? 's' : ''}`}
              {semitones !== 0 && cents !== 0 && ' · '}
              {cents !== 0 && `${cents > 0 ? '+' : ''}${cents} cents`}
            </p>
          )}
        </div>

        <button
          onClick={() => stepCoarse(1)}
          disabled={pitch >= 12}
          aria-label="Subir meio tom"
          className="flex items-center justify-center h-11 w-11 md:h-8 md:w-8 rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 transition-colors"
        >
          <Plus className="h-4 w-4 md:h-3.5 md:w-3.5" />
        </button>
      </div>

      {/* Fine adjustment: ±10 cents */}
      {fineMode && (
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
      <div className="space-y-1">
        <Slider
          min={-12}
          max={12}
          step={fineMode ? 0.1 : 1}
          value={[pitch]}
          onValueChange={([v]) => setPitch(fineMode ? Math.round(v * 10) / 10 : Math.round(v))}
        />
        <div className="flex justify-between text-[10px] md:text-[9px] text-[#535353] px-0.5">
          <span>-6 tons</span>
          <span>Original</span>
          <span>+6 tons</span>
        </div>
      </div>

      {/* Presets */}
      {!compact && (
        <div className="flex items-center justify-center gap-1.5 md:gap-1 flex-wrap">
          {PRESETS.map(v => (
            <button
              key={v}
              onClick={() => setPitch(v)}
              className={cn(
                'h-9 min-w-[40px] md:h-7 md:min-w-[34px] px-1.5 rounded-md text-[11px] md:text-[10px] font-bold transition-colors',
                Math.abs(pitch - v) < 0.05
                  ? 'bg-[hsl(var(--primary))] text-black'
                  : 'bg-white/5 text-[#b3b3b3] hover:bg-white/10 hover:text-white'
              )}
            >
              {v === 0 ? '0' : formatTons(v).replace(/ tons?$/, '')}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

import { Volume2, VolumeX, RotateCcw, Layers } from 'lucide-react'
import { usePlayerStore } from '@/store/playerStore'
import { Slider } from '@/components/ui/slider'
import { INSTRUMENT_LABELS, INSTRUMENT_ICONS } from '@/types/track'
import type { InstrumentId } from '@/types/track'
import { cn } from '@/lib/utils'
import { useEffect, useRef } from 'react'

function stemIcon(stemId: string): string {
  if (stemId in INSTRUMENT_ICONS) return INSTRUMENT_ICONS[stemId as InstrumentId]
  if (/drum|bater|percus|click/.test(stemId)) return '🥁'
  if (/bass|baixo/.test(stemId)) return '🎸'
  if (/guitar|gtr|violo/.test(stemId)) return '🎸'
  if (/acoust|acust|sanfon/.test(stemId)) return '🪗'
  if (/key|piano|teclad|ep|rhodes|organ/.test(stemId)) return '🎹'
  if (/voice|vocal|voz|canto|guia/.test(stemId)) return '🎤'
  if (/choir|coro|back/.test(stemId)) return '🎙️'
  if (/brass|metal|horn/.test(stemId)) return '🎺'
  if (/string|cord|violin/.test(stemId)) return '🎻'
  if (/synth|pad|fx/.test(stemId)) return '🎛️'
  return '🎵'
}

function stemDisplayLabel(stemId: string, fallback: string): string {
  if (stemId in INSTRUMENT_LABELS) return INSTRUMENT_LABELS[stemId as InstrumentId]
  return fallback
}

function VuMeter({ active, volume }: { active: boolean; volume: number }) {
  const barRef = useRef<HTMLDivElement>(null)
  const bar2Ref = useRef<HTMLDivElement>(null)
  const frameRef = useRef<number>(0)
  const prevRef = useRef(0)
  const prev2Ref = useRef(0)

  useEffect(() => {
    if (!active) {
      prevRef.current = 0
      prev2Ref.current = 0
      if (barRef.current) barRef.current.style.height = '0%'
      if (bar2Ref.current) bar2Ref.current.style.height = '0%'
      return () => {} // explicit no-op cleanup
    }
    let cancelled = false
    const animate = () => {
      if (cancelled) return
      const target = volume * (0.4 + Math.random() * 0.6)
      const target2 = volume * (0.3 + Math.random() * 0.5)
      prevRef.current += (target - prevRef.current) * 0.3
      prev2Ref.current += (target2 - prev2Ref.current) * 0.25
      const pct = Math.round(prevRef.current * 100)
      const pct2 = Math.round(prev2Ref.current * 100)
      if (barRef.current) {
        barRef.current.style.height = `${Math.min(100, pct)}%`
        barRef.current.className = `absolute bottom-0 left-0 right-0 rounded-sm transition-none ${pct > 85 ? 'bg-red-500' : pct > 60 ? 'bg-yellow-400' : 'bg-[hsl(var(--primary))]'}`
      }
      if (bar2Ref.current) {
        bar2Ref.current.style.height = `${Math.min(100, pct2)}%`
        bar2Ref.current.className = `absolute bottom-0 left-0 right-0 rounded-sm transition-none ${pct2 > 85 ? 'bg-red-500' : pct2 > 60 ? 'bg-yellow-400' : 'bg-[hsl(var(--primary))]'}`
      }
      frameRef.current = requestAnimationFrame(animate)
    }
    frameRef.current = requestAnimationFrame(animate)
    return () => {
      cancelled = true
      cancelAnimationFrame(frameRef.current)
    }
  }, [active, volume])

  return (
    <div className="flex gap-[1px] h-full items-end w-3 shrink-0">
      <div className="flex-1 h-full bg-white/5 rounded-sm overflow-hidden relative">
        <div ref={barRef} className="absolute bottom-0 left-0 right-0 rounded-sm bg-[hsl(var(--primary))]" style={{ height: '0%' }} />
      </div>
      <div className="flex-1 h-full bg-white/5 rounded-sm overflow-hidden relative">
        <div ref={bar2Ref} className="absolute bottom-0 left-0 right-0 rounded-sm bg-[hsl(var(--primary))]" style={{ height: '0%' }} />
      </div>
    </div>
  )
}

export function StemMixer() {
  const { track, stemStates, playbackState, setStemMuted, setStemSolo, setStemVolume, resetMix } = usePlayerStore()

  if (!track) return null

  const stems = track.stems
  const hasSolo = Object.values(stemStates).some(s => s.solo)
  const anyModified = Object.values(stemStates).some(s => s.muted || s.solo || s.volume !== 0.85)
  const isPlaying = playbackState === 'playing'

  if (!track.hasStems || stems.length <= 1) {
    return (
      <div className="rounded-lg bg-white/5 p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <Layers className="h-8 w-8 text-[#535353]" />
          <p className="text-sm font-medium text-white">Mix estéreo</p>
          <p className="text-xs text-[#b3b3b3] max-w-xs">
            Esta faixa não possui pistas separadas.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg bg-white/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 md:px-5 py-3 md:py-4">
        <div className="flex items-center gap-3">
          <Layers className="h-5 w-5 text-[hsl(var(--primary))]" />
          <div>
            <p className="text-sm font-bold text-white">
              Mixer — {stems.length} pistas
            </p>
            {hasSolo && (
              <p className="text-xs text-[hsl(var(--primary))]">Solo ativo</p>
            )}
          </div>
        </div>
        <button
          onClick={resetMix}
          disabled={!anyModified}
          className={cn(
            'flex items-center gap-1.5 h-7 rounded-full px-3 text-xs font-semibold transition-colors',
            anyModified
              ? 'text-white bg-white/10 hover:bg-white/20'
              : 'text-[#535353] cursor-default'
          )}
        >
          <RotateCcw className="h-3 w-3" />
          Reset
        </button>
      </div>

      {/* Stem rows */}
      <div className="divide-y divide-white/5">
        {stems.map(stem => {
          const state = stemStates[stem.id]
          if (!state) return null

          const isMuted = state.muted
          const isSolo = state.solo
          const isInactive = hasSolo && !isSolo
          const icon = stemIcon(stem.id)
          const label = stemDisplayLabel(stem.id, stem.label)
          const stemActive = isPlaying && !isMuted && (!hasSolo || isSolo)

          return (
            <div
              key={stem.id}
              className={cn(
                'flex items-center gap-2 md:gap-3 px-3 md:px-5 py-3 transition-all',
                isSolo && 'bg-[hsl(var(--primary))]/5',
                isInactive && 'opacity-25',
              )}
            >
              {/* VU meter */}
              <div className="h-8 hidden sm:block">
                <VuMeter active={stemActive} volume={state.volume} />
              </div>

              {/* Icon + label */}
              <div className="flex items-center gap-2 w-24 md:w-32 shrink-0">
                <span className="text-lg leading-none">{icon}</span>
                <span className={cn(
                  'text-sm font-medium truncate',
                  isMuted ? 'text-[#535353] line-through' : 'text-white',
                  isSolo && 'text-[hsl(var(--primary))] font-semibold',
                )}>
                  {label}
                </span>
              </div>

              {/* Volume fader */}
              <div className="flex-1 min-w-0 flex items-center gap-3">
                <Slider
                  min={0}
                  max={1}
                  step={0.01}
                  value={[isMuted ? 0 : state.volume]}
                  onValueChange={([v]) => setStemVolume(stem.id, v)}
                  disabled={isMuted}
                  className={cn('flex-1', isMuted && 'opacity-20 pointer-events-none')}
                />
                <span className="text-xs text-[#b3b3b3] w-8 text-right tabular-nums shrink-0">
                  {Math.round(state.volume * 100)}
                </span>
              </div>

              {/* Mute button */}
              <button
                onClick={() => setStemMuted(stem.id, !isMuted)}
                className={cn(
                  'flex items-center justify-center h-10 w-10 md:h-8 md:w-8 rounded-full shrink-0 transition-colors text-xs font-bold',
                  isMuted
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-white/5 text-[#b3b3b3] hover:text-white hover:bg-white/10'
                )}
              >
                {isMuted ? <VolumeX className="h-4 w-4 md:h-3.5 md:w-3.5" /> : 'M'}
              </button>

              {/* Solo button */}
              <button
                onClick={() => setStemSolo(stem.id, !isSolo)}
                className={cn(
                  'flex items-center justify-center h-10 w-10 md:h-8 md:w-8 rounded-full shrink-0 transition-colors text-xs font-bold',
                  isSolo
                    ? 'bg-[hsl(var(--primary))] text-black'
                    : 'bg-white/5 text-[#b3b3b3] hover:text-white hover:bg-white/10'
                )}
              >
                S
              </button>
            </div>
          )
        })}
      </div>

      {/* Solo hint */}
      {hasSolo && (
        <div className="px-4 md:px-5 py-2.5 bg-[hsl(var(--primary))]/5 border-t border-[hsl(var(--primary))]/10">
          <p className="text-xs text-[hsl(var(--primary))] text-center font-medium">
            Solo ativo · Toque em S para desativar
          </p>
        </div>
      )}
    </div>
  )
}

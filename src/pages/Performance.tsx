/**
 * Performance Mode — tela otimizada para uso no palco.
 * Interface limpa, botões grandes, sem distrações.
 */

import { useNavigate } from 'react-router-dom'
import {
  Play, Pause, Square, SkipBack, SkipForward,
  RotateCcw, X, Library, Mic2, Layers,
  ChevronDown, ChevronUp,
} from 'lucide-react'
import { usePlayerStore } from '@/store/playerStore'
import { PitchControl } from '@/components/player/PitchControl'
import { SpeedControl } from '@/components/player/SpeedControl'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TooltipProvider } from '@/components/ui/tooltip'
import { formatTime, semitonesToLabel, speedToLabel } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { useState } from 'react'

type Panel = 'none' | 'stems' | 'pitch' | 'speed'

function stemIconPerformance(stemId: string, label: string): string {
  const id = (stemId + ' ' + label).toLowerCase()
  if (/drum|bater|percus|click/.test(id)) return '🥁'
  if (/bass|baixo/.test(id)) return '🎸'
  if (/guitar|gtr|guitarra/.test(id)) return '🎸'
  if (/acoust|acust|violao|violo/.test(id)) return '🪕'
  if (/sanfon|acordeon/.test(id)) return '🪗'
  if (/key|piano|teclad|ep|rhodes|organ|cravo/.test(id)) return '🎹'
  if (/voice|vocal|voz|canto|guia/.test(id)) return '🎤'
  if (/choir|coro|back/.test(id)) return '🎙️'
  if (/brass|metal|horn|trompet|trombon/.test(id)) return '🎺'
  if (/string|cord|violin|cello/.test(id)) return '🎻'
  if (/synth|pad|fx|efeit/.test(id)) return '🎛️'
  if (/main|mix|master/.test(id)) return '🎵'
  return '🎵'
}

export default function Performance() {
  const navigate = useNavigate()
  const {
    track, playbackState, currentTime, duration,
    pitch, speed, stemStates,
    play, pause, stop, seek, skipBackward, skipForward,
    setStemMuted, setStemSolo,
    resetMix, togglePerformanceMode,
  } = usePlayerStore()

  const [activePanel, setActivePanel] = useState<Panel>('none')

  const isPlaying = playbackState === 'playing'
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  const togglePanel = (panel: Panel) => {
    setActivePanel(p => p === panel ? 'none' : panel)
  }

  if (!track) {
    return (
      <div className="flex flex-col items-center justify-center h-dvh gap-4 bg-black p-8">
        <Mic2 className="h-16 w-16 text-muted-foreground" />
        <h2 className="text-2xl font-bold text-foreground">Nenhuma faixa carregada</h2>
        <Button variant="brand" onClick={() => navigate('/app/library')}>
          <Library className="h-4 w-4 mr-2" />
          Abrir Biblioteca
        </Button>
        <Button variant="ghost" onClick={() => navigate(-1)} className="text-muted-foreground">
          Voltar
        </Button>
      </div>
    )
  }

  const hasSolo = Object.values(stemStates).some(s => s.solo)

  return (
    <TooltipProvider>
      <div className="flex flex-col h-dvh bg-black text-white select-none overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 md:px-6 pt-4 md:pt-5 pb-3 shrink-0">
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-black truncate leading-tight">{track.title}</h1>
            <p className="text-sm md:text-base text-muted-foreground truncate">{track.artist}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            {pitch !== 0 && (
              <Badge variant="brand" className="text-sm px-3 py-1">{semitonesToLabel(pitch)}</Badge>
            )}
            {speed !== 1 && (
              <Badge variant="secondary" className="text-sm px-3 py-1">{speedToLabel(speed)}</Badge>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => { togglePerformanceMode(); navigate('/app/player') }}
              className="text-muted-foreground hover:text-white"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="px-4 md:px-6 shrink-0">
          <div
            className="h-2 rounded-full bg-white/10 cursor-pointer relative group"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              seek(((e.clientX - rect.left) / rect.width) * duration)
            }}
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-brand transition-all duration-100"
              style={{ width: `${progress}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-4 w-4 rounded-full bg-white opacity-0 group-hover:opacity-100 shadow-lg"
              style={{ left: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-1.5 text-sm text-white/40 tabular-nums">
            <span>{formatTime(currentTime)}</span>
            <span>-{formatTime(Math.max(0, duration - currentTime))}</span>
          </div>
        </div>

        {/* MAIN CONTROLS */}
        <div className="flex-1 flex flex-col items-center justify-center gap-5 md:gap-6 px-4 md:px-8 min-h-0">
          <div className="flex items-center gap-3 md:gap-5">
            <button
              onClick={() => seek(0)}
              className="flex h-12 w-12 md:h-14 md:w-14 items-center justify-center rounded-full bg-white/5 text-white hover:bg-white/10 active:bg-white/20 transition-colors"
            >
              <RotateCcw className="h-5 w-5 md:h-6 md:w-6" />
            </button>

            <button
              onClick={() => skipBackward(5)}
              className="flex h-12 w-12 md:h-14 md:w-14 items-center justify-center rounded-full bg-white/5 text-white hover:bg-white/10 active:bg-white/20 transition-colors"
            >
              <SkipBack className="h-5 w-5 md:h-6 md:w-6" />
            </button>

            <button
              onClick={() => isPlaying ? pause() : play()}
              className={cn(
                'flex h-20 w-20 md:h-24 md:w-24 items-center justify-center rounded-full shadow-xl transition-all active:scale-95',
                isPlaying
                  ? 'bg-brand shadow-brand/40'
                  : 'bg-white text-black shadow-white/20'
              )}
            >
              {isPlaying
                ? <Pause className="h-8 w-8 md:h-10 md:w-10 fill-white text-white" />
                : <Play className="h-8 w-8 md:h-10 md:w-10 fill-black text-black ml-1" />
              }
            </button>

            <button
              onClick={() => skipForward(5)}
              className="flex h-12 w-12 md:h-14 md:w-14 items-center justify-center rounded-full bg-white/5 text-white hover:bg-white/10 active:bg-white/20 transition-colors"
            >
              <SkipForward className="h-5 w-5 md:h-6 md:w-6" />
            </button>

            <button
              onClick={stop}
              className="flex h-12 w-12 md:h-14 md:w-14 items-center justify-center rounded-full bg-white/5 text-white hover:bg-white/10 active:bg-white/20 transition-colors"
            >
              <Square className="h-4 w-4 md:h-5 md:w-5" />
            </button>
          </div>

          {/* Quick action buttons */}
          <div className="flex items-center gap-2 md:gap-3 flex-wrap justify-center">
            <button
              onClick={() => togglePanel('pitch')}
              className={cn(
                'flex items-center gap-2 rounded-full px-4 py-2.5 text-xs md:text-sm font-medium transition-colors',
                activePanel === 'pitch' ? 'bg-brand text-white' : 'bg-white/10 text-white hover:bg-white/15'
              )}
            >
              🎵 Tom {pitch !== 0 && `(${semitonesToLabel(pitch)})`}
            </button>
            <button
              onClick={() => togglePanel('speed')}
              className={cn(
                'flex items-center gap-2 rounded-full px-4 py-2.5 text-xs md:text-sm font-medium transition-colors',
                activePanel === 'speed' ? 'bg-brand text-white' : 'bg-white/10 text-white hover:bg-white/15'
              )}
            >
              ⏱️ Velocidade {speed !== 1 && `(${speedToLabel(speed)})`}
            </button>
            {track.hasStems && (
              <button
                onClick={() => togglePanel('stems')}
                className={cn(
                  'flex items-center gap-2 rounded-full px-4 py-2.5 text-xs md:text-sm font-medium transition-colors',
                  activePanel === 'stems' ? 'bg-brand text-white' : 'bg-white/10 text-white hover:bg-white/15'
                )}
              >
                <Layers className="h-4 w-4" />
                Stems {hasSolo && '(Solo)'}
              </button>
            )}
          </div>
        </div>

        {/* Expandable panels */}
        <div className="shrink-0 max-h-[40vh] overflow-y-auto">
          {activePanel === 'pitch' && (
            <div className="mx-4 mb-4 rounded-2xl bg-white/5 border border-white/10 p-4">
              <PitchControl compact />
            </div>
          )}

          {activePanel === 'speed' && (
            <div className="mx-4 mb-4 rounded-2xl bg-white/5 border border-white/10 p-4">
              <SpeedControl compact />
            </div>
          )}

          {activePanel === 'stems' && track.hasStems && (
            <div className="mx-4 mb-4 rounded-2xl bg-white/5 border border-white/10 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-white/50">
                  Stems — {track.stems.length} pistas
                </p>
                <button onClick={resetMix} className="text-xs text-white/50 hover:text-white transition-colors">
                  Reset
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {track.stems.map(stem => {
                  const state = stemStates[stem.id]
                  if (!state) return null
                  const isSolo = state.solo
                  const isMuted = state.muted
                  const icon = stemIconPerformance(stem.id, stem.label)

                  return (
                    <button
                      key={stem.id}
                      onClick={() => setStemMuted(stem.id, !isMuted)}
                      onDoubleClick={() => setStemSolo(stem.id, !isSolo)}
                      className={cn(
                        'flex flex-col items-center gap-1.5 rounded-xl p-3 text-xs font-medium transition-all',
                        isSolo
                          ? 'bg-brand/30 text-white border-2 border-brand ring-1 ring-brand/50'
                          : isMuted
                          ? 'bg-white/5 text-white/30'
                          : 'bg-white/10 text-white border border-white/10 hover:bg-white/15'
                      )}
                    >
                      <span className="text-2xl">{icon}</span>
                      <span className={cn('truncate max-w-full', isMuted && 'line-through')}>
                        {stem.label}
                      </span>
                      {isSolo && (
                        <span className="text-[9px] text-brand uppercase font-bold">Solo</span>
                      )}
                    </button>
                  )
                })}
              </div>
              <p className="text-[10px] text-white/30 text-center">
                Toque para mutar · duplo toque para solo
              </p>
            </div>
          )}
        </div>

        <div className="pb-safe-area-inset-bottom h-4 shrink-0" />
      </div>
    </TooltipProvider>
  )
}

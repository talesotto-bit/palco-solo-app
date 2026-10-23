import { useState, useEffect, useRef } from 'react'
import { audioEngine } from '@/audio/AudioEngine'
import { FastForward, Loader2, Pause, Play, Repeat, Rewind, RotateCcw, SkipBack, SkipForward, Square, Volume2, VolumeX, X } from 'lucide-react'
import { usePlayerStore } from '@/store/playerStore'
import { Slider } from '@/components/ui/slider'
import { cn, formatTime } from '@/lib/utils'

interface PlayerControlsProps {
  size?: 'default' | 'large'
}

export function PlayerControls({ size = 'default' }: PlayerControlsProps) {
  // Aviso do modo silencioso: só no iPhone/iPad antigo (iOS 17+ toca mesmo no silencioso) e até o músico fechar
  const needsTip = /iPhone|iPad|iPod/i.test(navigator.userAgent) && !('audioSession' in navigator)
  const [showSoundTip, setShowSoundTip] = useState(() => {
    try { return needsTip && !localStorage.getItem('sound-tip-closed') } catch { return false }
  })
  const tipTimerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (!showSoundTip) return
    tipTimerRef.current = setTimeout(() => setShowSoundTip(false), 60_000)
    return () => clearTimeout(tipTimerRef.current)
  }, [showSoundTip])

  // Individual selectors — prevents re-render on every currentTime update (60fps)
  const playbackState = usePlayerStore(s => s.playbackState)
  const volume = usePlayerStore(s => s.volume)
  const play = usePlayerStore(s => s.play)
  const pause = usePlayerStore(s => s.pause)
  const stop = usePlayerStore(s => s.stop)
  const seek = usePlayerStore(s => s.seek)
  const skipBackward = usePlayerStore(s => s.skipBackward)
  const skipForward = usePlayerStore(s => s.skipForward)
  const setVolume = usePlayerStore(s => s.setVolume)

  const isPlaying = playbackState === 'playing'
  const isLoading = playbackState === 'loading'
  const hasTrack = usePlayerStore(s => !!s.track)

  const isLarge = size === 'large'
  const queueLen = usePlayerStore(s => s.queue.length)
  const queueIndex = usePlayerStore(s => s.queueIndex)
  const nextSong = usePlayerStore(s => s.next)
  const prevSong = usePlayerStore(s => s.prev)

  return (
    <div className="flex flex-col items-center gap-3 md:gap-4">
      {/* Transporte */}
      {queueLen > 1 && queueIndex >= 0 && (
        <p className="text-[11px] font-semibold text-[#9a9a9a] -mb-1">Música {queueIndex + 1} de {queueLen}</p>
      )}
      <div className="flex items-center gap-1 md:gap-2">
        {queueLen > 1 ? (
          <CtlButton label="Música anterior" disabled={!hasTrack} onClick={() => void prevSong()}>
            <SkipBack className={cn('fill-current', isLarge ? 'h-5 w-5' : 'h-4 w-4')} />
          </CtlButton>
        ) : (
          <CtlButton label="Voltar ao começo" disabled={!hasTrack} onClick={() => seek(0)}>
            <RotateCcw className={cn(isLarge ? 'h-5 w-5' : 'h-4 w-4')} />
          </CtlButton>
        )}

        <CtlButton label="Voltar 5 segundos" disabled={!hasTrack} onClick={() => skipBackward(5)}>
          <span className="flex flex-col items-center leading-none"><Rewind className={cn(isLarge ? 'h-5 w-5' : 'h-4 w-4')} /><span className="text-[9px] font-bold mt-0.5">5s</span></span>
        </CtlButton>

        <button
          disabled={!hasTrack}
          aria-label={isPlaying ? 'Pausar' : 'Tocar'}
          onClick={() => { void audioEngine.unlock(); isPlaying ? pause() : play() }}
          className={cn(
            'mx-1 flex items-center justify-center rounded-full bg-white text-black',
            'hover:scale-105 active:scale-95 transition-transform disabled:opacity-50',
            isLarge ? 'h-16 w-16' : 'h-11 w-11'
          )}
        >
          {isLoading ? (
            <Loader2 className={cn('animate-spin', isLarge ? 'h-7 w-7' : 'h-5 w-5')} />
          ) : isPlaying ? (
            <Pause className={cn('fill-black', isLarge ? 'h-7 w-7' : 'h-5 w-5')} />
          ) : (
            <Play className={cn('fill-black ml-0.5', isLarge ? 'h-7 w-7' : 'h-5 w-5')} />
          )}
        </button>

        <CtlButton label="Avançar 5 segundos" disabled={!hasTrack} onClick={() => skipForward(5)}>
          <span className="flex flex-col items-center leading-none"><FastForward className={cn(isLarge ? 'h-5 w-5' : 'h-4 w-4')} /><span className="text-[9px] font-bold mt-0.5">5s</span></span>
        </CtlButton>

        {queueLen > 1 ? (
          <CtlButton label="Próxima música" disabled={!hasTrack || queueIndex >= queueLen - 1} onClick={() => void nextSong()}>
            <SkipForward className={cn('fill-current', isLarge ? 'h-5 w-5' : 'h-4 w-4')} />
          </CtlButton>
        ) : (
          <CtlButton label="Parar" disabled={!hasTrack} onClick={stop}>
            <Square className={cn(isLarge ? 'h-4 w-4' : 'h-3.5 w-3.5')} />
          </CtlButton>
        )}
      </div>

      {/* Loop A-B: ensaiar um trecho */}
      <LoopButton />

      {/* Volume */}
      <div className="flex items-center gap-2 w-full max-w-[180px]">
        <button
          onClick={() => setVolume(volume === 0 ? 0.85 : 0)}
          className="text-[#b3b3b3] hover:text-white transition-colors shrink-0"
        >
          {volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
        <Slider
          min={0}
          max={1}
          step={0.01}
          value={[volume]}
          onValueChange={([v]) => setVolume(v)}
          className="flex-1"
        />
      </div>

      {showSoundTip && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 text-amber-400 text-[11px] font-medium w-full max-w-xs">
          <Volume2 className="h-3.5 w-3.5 shrink-0" />
          <span>Sem som? Retire o telefone do Modo Silencioso e aumente o volume!</span>
          <button
            onClick={() => { setShowSoundTip(false); try { localStorage.setItem('sound-tip-closed', '1') } catch {} }}
            className="ml-auto p-0.5 rounded hover:bg-white/10 transition-colors shrink-0"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  )
}

function LoopButton() {
  const loop = usePlayerStore(s => s.loop)
  const tap = usePlayerStore(s => s.loopTap)
  const clear = usePlayerStore(s => s.clearLoop)
  const hasTrack = usePlayerStore(s => !!s.track)
  const label = !loop ? 'Repetir um trecho (A-B)' : loop.b === null ? `Início marcado em ${formatTime(loop.a)} · toque no fim` : `Repetindo ${formatTime(loop.a)}–${formatTime(loop.b)}`
  return (
    <div className="flex items-center gap-1.5">
      <button disabled={!hasTrack} onClick={tap}
        className={cn('h-9 px-3.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-30',
          loop ? 'bg-amber-400 text-black' : 'bg-white/[0.07] text-[#d0d0d0]')}>
        <Repeat className="h-3.5 w-3.5" /> {!loop ? 'Loop A-B' : loop.b === null ? 'Marcar fim (B)' : 'Loop ligado'}
      </button>
      {loop && <button onClick={clear} aria-label="Desligar loop" className="h-9 w-9 rounded-full bg-white/[0.07] flex items-center justify-center"><X className="h-3.5 w-3.5" /></button>}
      <span className="sr-only">{label}</span>
      {loop && <span className="text-[11px] text-amber-200/90 tabular-nums">{formatTime(loop.a)}{loop.b !== null ? `–${formatTime(loop.b)}` : ' → ?'}</span>}
    </div>
  )
}

function CtlButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button aria-label={label} title={label} disabled={disabled} onClick={onClick}
      className="h-11 w-11 flex items-center justify-center rounded-full text-[#c8c8c8] hover:text-white active:bg-white/10 disabled:opacity-30 transition-colors">
      {children}
    </button>
  )
}

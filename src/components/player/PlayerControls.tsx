import { useState, useEffect, useRef } from 'react'
import * as Tone from 'tone'
import {
  Play, Pause, Square, SkipBack, SkipForward,
  RotateCcw, Volume2, VolumeX, Loader2, X,
} from 'lucide-react'
import { usePlayerStore } from '@/store/playerStore'
import { useTrialStore } from '@/store/trialStore'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'

interface PlayerControlsProps {
  size?: 'default' | 'large'
}

export function PlayerControls({ size = 'default' }: PlayerControlsProps) {
  const isTrialMode = useTrialStore(s => s.isTrialMode)
  const [showSoundTip, setShowSoundTip] = useState(true)
  const tipTimerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (!isTrialMode) return
    tipTimerRef.current = setTimeout(() => setShowSoundTip(false), 60_000)
    return () => clearTimeout(tipTimerRef.current)
  }, [isTrialMode])

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
  const hasTrack = playbackState !== 'idle'

  const isLarge = size === 'large'

  return (
    <div className="flex flex-col items-center gap-3 md:gap-4">
      {/* Transport controls */}
      <div className="flex items-center gap-4 md:gap-5">
        {/* Rewind to start */}
        <button
          disabled={!hasTrack}
          onClick={() => seek(0)}
          className="text-[#b3b3b3] hover:text-white disabled:opacity-30 transition-colors"
        >
          <RotateCcw className={cn(isLarge ? 'h-5 w-5' : 'h-4 w-4')} />
        </button>

        {/* Skip back */}
        <button
          disabled={!hasTrack}
          onClick={() => skipBackward(5)}
          className="text-[#b3b3b3] hover:text-white disabled:opacity-30 transition-colors"
        >
          <SkipBack className={cn(isLarge ? 'h-5 w-5' : 'h-4 w-4')} />
        </button>

        {/* Play / Pause */}
        <button
          disabled={!hasTrack || isLoading}
          onClick={() => { Tone.start().catch(() => {}); isPlaying ? pause() : play() }}
          className={cn(
            'flex items-center justify-center rounded-full bg-white text-black',
            'hover:scale-105 active:scale-95 transition-transform disabled:opacity-50',
            isLarge ? 'h-14 w-14' : 'h-10 w-10'
          )}
        >
          {isLoading ? (
            <Loader2 className={cn('animate-spin', isLarge ? 'h-6 w-6' : 'h-5 w-5')} />
          ) : isPlaying ? (
            <Pause className={cn('fill-black', isLarge ? 'h-6 w-6' : 'h-5 w-5')} />
          ) : (
            <Play className={cn('fill-black ml-0.5', isLarge ? 'h-6 w-6' : 'h-5 w-5')} />
          )}
        </button>

        {/* Skip forward */}
        <button
          disabled={!hasTrack}
          onClick={() => skipForward(5)}
          className="text-[#b3b3b3] hover:text-white disabled:opacity-30 transition-colors"
        >
          <SkipForward className={cn(isLarge ? 'h-5 w-5' : 'h-4 w-4')} />
        </button>

        {/* Stop */}
        <button
          disabled={!hasTrack}
          onClick={stop}
          className="text-[#b3b3b3] hover:text-white disabled:opacity-30 transition-colors"
        >
          <Square className={cn(isLarge ? 'h-4 w-4' : 'h-3.5 w-3.5')} />
        </button>
      </div>

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

      {isTrialMode && showSoundTip && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 text-amber-400 text-[11px] font-medium w-full max-w-xs">
          <Volume2 className="h-3.5 w-3.5 shrink-0" />
          <span>Sem som? Retire o telefone do Modo Silencioso e aumente o volume!</span>
          <button
            onClick={() => setShowSoundTip(false)}
            className="ml-auto p-0.5 rounded hover:bg-white/10 transition-colors shrink-0"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  )
}

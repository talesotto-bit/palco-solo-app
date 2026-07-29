import { useNavigate } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import { Play, Pause, SkipBack, SkipForward, ChevronUp, Volume2, VolumeX } from 'lucide-react'
import { usePlayerStore } from '@/store/playerStore'
import { useCoverArt } from '@/hooks/useCoverArt'
import { Slider } from '@/components/ui/slider'
import { formatTime } from '@/lib/utils'

export function MiniPlayer() {
  const navigate = useNavigate()
  const track = usePlayerStore(s => s.track)
  const playbackState = usePlayerStore(s => s.playbackState)
  const volume = usePlayerStore(s => s.volume)
  const play = usePlayerStore(s => s.play)
  const pause = usePlayerStore(s => s.pause)
  const skipBackward = usePlayerStore(s => s.skipBackward)
  const skipForward = usePlayerStore(s => s.skipForward)
  const setVolume = usePlayerStore(s => s.setVolume)
  const seek = usePlayerStore(s => s.seek)

  const coverUrl = useCoverArt(track?.artist || '', track?.title || '', track?.coverUrl || '')

  const progressRef = useRef<HTMLDivElement>(null)
  const mobileTimeRef = useRef<HTMLSpanElement>(null)
  const desktopTimeRef = useRef<HTMLSpanElement>(null)
  const desktopDurRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    return usePlayerStore.subscribe((state) => {
      const { currentTime, duration } = state
      const pct = duration > 0 ? (currentTime / duration) * 100 : 0
      if (progressRef.current) progressRef.current.style.width = `${pct}%`
      const timeStr = formatTime(currentTime)
      if (mobileTimeRef.current) mobileTimeRef.current.textContent = timeStr
      if (desktopTimeRef.current) desktopTimeRef.current.textContent = timeStr
      if (desktopDurRef.current) desktopDurRef.current.textContent = formatTime(duration)
    })
  }, [])

  if (!track) return null

  const isPlaying = playbackState === 'playing'

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    const duration = usePlayerStore.getState().duration
    seek(pct * duration)
  }

  return (
    <div className="mini-player">
      {/* Progress bar */}
      <div
        className="group h-1 hover:h-1.5 bg-white/10 cursor-pointer transition-all relative"
        onClick={handleProgressClick}
      >
        <div
          ref={progressRef}
          className="absolute inset-y-0 left-0 bg-white group-hover:bg-[hsl(var(--primary))] transition-colors"
          style={{ width: '0%' }}
        />
      </div>

      {/* Content */}
      <div className="relative flex items-center h-[54px] md:h-[72px] px-3 md:px-4 gap-2 md:gap-0">
        {/* Left — Track info */}
        <div
          className="flex items-center gap-2.5 md:gap-3 flex-1 md:flex-none md:w-[30%] min-w-0 cursor-pointer"
          onClick={() => navigate('/app/player')}
        >
          <img
            src={coverUrl}
            alt={track.title}
            className="h-10 w-10 md:h-14 md:w-14 rounded-md object-cover shrink-0 shadow-lg bg-[#2a2a2a]"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs md:text-sm font-medium text-white truncate">
              {track.title}
            </p>
            <p className="text-[11px] md:text-xs text-[#b3b3b3] truncate">{track.artist}</p>
          </div>
        </div>

        {/* Center — Controls */}
        <div className="flex items-center gap-3 md:gap-4 md:flex-1 md:justify-center md:max-w-[40%]">
          <button
            onClick={() => skipBackward(5)}
            className="hidden md:block text-[#b3b3b3] hover:text-white transition-colors"
          >
            <SkipBack className="h-4 w-4" />
          </button>

          <button
            onClick={() => isPlaying ? pause() : play()}
            className="flex items-center justify-center h-9 w-9 md:h-8 md:w-8 rounded-full bg-white hover:scale-105 active:scale-95 transition-transform shrink-0"
          >
            {isPlaying
              ? <Pause className="h-4 w-4 text-black fill-black" />
              : <Play className="h-4 w-4 text-black fill-black ml-0.5" />
            }
          </button>

          <button
            onClick={() => skipForward(5)}
            className="hidden md:block text-[#b3b3b3] hover:text-white transition-colors"
          >
            <SkipForward className="h-4 w-4" />
          </button>
        </div>

        {/* Time — mobile only */}
        <div className="flex md:hidden text-[10px] text-[#b3b3b3] tabular-nums shrink-0">
          <span ref={mobileTimeRef}>0:00</span>
        </div>

        {/* Desktop — Time */}
        <div className="hidden md:flex items-center justify-center gap-2 absolute left-1/2 -translate-x-1/2 bottom-2 text-[11px] text-[#b3b3b3] tabular-nums">
          <span ref={desktopTimeRef}>0:00</span>
          <span className="text-white/20">/</span>
          <span ref={desktopDurRef}>0:00</span>
        </div>

        {/* Right — Volume + expand (desktop) */}
        <div className="hidden md:flex items-center justify-end gap-3 w-[30%]">
          <div className="flex items-center gap-2 w-32">
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

          <button
            onClick={() => navigate('/app/player')}
            className="text-[#b3b3b3] hover:text-white transition-colors"
          >
            <ChevronUp className="h-5 w-5" />
          </button>
        </div>

        {/* Mobile expand button */}
        <button
          onClick={() => navigate('/app/player')}
          className="md:hidden text-[#b3b3b3] active:text-white transition-colors shrink-0 p-1"
        >
          <ChevronUp className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}

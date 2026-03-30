import { Play, Pause, Layers } from 'lucide-react'
import type { Track } from '@/types/track'
import { cn } from '@/lib/utils'
import { usePlayerStore } from '@/store/playerStore'
import { useNavigate } from 'react-router-dom'

interface TrackCardProps {
  track: Track
  view?: 'grid' | 'list'
  index?: number
}

export function TrackCard({ track, view = 'grid', index }: TrackCardProps) {
  const navigate = useNavigate()
  const loadTrack = usePlayerStore(s => s.loadTrack)
  const currentTrack = usePlayerStore(s => s.track)
  const playbackState = usePlayerStore(s => s.playbackState)
  const play = usePlayerStore(s => s.play)
  const pause = usePlayerStore(s => s.pause)

  const isActive = currentTrack?.id === track.id
  const isPlaying = isActive && playbackState === 'playing'

  const handlePlay = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isPlaying) {
      pause()
    } else if (isActive) {
      play()
    } else {
      await loadTrack(track)
    }
  }

  const handleNavigate = () => {
    if (!isActive) loadTrack(track)
    navigate('/app/player')
  }

  if (view === 'list') {
    return (
      <div
        className={cn(
          'flex items-center gap-3 md:gap-4 px-3 md:px-4 py-2.5 md:py-2 rounded-md group cursor-pointer transition-colors',
          isActive ? 'bg-white/10' : 'hover:bg-white/5'
        )}
        onClick={handleNavigate}
      >
        {/* Index / play */}
        <div className="w-7 shrink-0 text-center">
          {isPlaying ? (
            <div className="flex items-end justify-center gap-[2px] h-4">
              <span className="eq-bar" style={{ animationDuration: '0.6s' }} />
              <span className="eq-bar" style={{ animationDuration: '0.8s' }} />
              <span className="eq-bar" style={{ animationDuration: '0.5s' }} />
            </div>
          ) : (
            <>
              <span className="text-sm text-[#b3b3b3] group-hover:hidden tabular-nums">
                {index || ''}
              </span>
              <button
                className="hidden group-hover:block text-white"
                onClick={handlePlay}
              >
                <Play className="h-4 w-4 fill-white" />
              </button>
            </>
          )}
        </div>

        {/* Cover */}
        <img
          src={track.coverUrl}
          alt={track.title}
          className="h-10 w-10 rounded object-cover shrink-0"
        />

        {/* Info */}
        <div className="min-w-0 flex-1">
          <p className={cn(
            'text-sm font-medium truncate',
            isActive ? 'text-[hsl(var(--primary))]' : 'text-white'
          )}>
            {track.title}
          </p>
          <p className="text-xs text-[#b3b3b3] truncate">{track.artist}</p>
        </div>

        {/* Genre label */}
        <span className="hidden lg:block text-xs text-[#b3b3b3] truncate max-w-[120px]">
          {track.genreLabel}
        </span>

        {/* Stems badge */}
        {track.hasStems && track.stems.length > 1 && (
          <div className="hidden sm:flex items-center gap-1 text-[10px] text-[hsl(var(--primary))] font-semibold shrink-0">
            <Layers className="h-3 w-3" />
            {track.stems.length}
          </div>
        )}
      </div>
    )
  }

  // Grid view — Spotify card style
  return (
    <div
      className="group relative rounded-md bg-white/5 hover:bg-white/10 p-2.5 md:p-3 cursor-pointer transition-all duration-200"
      onClick={handleNavigate}
    >
      {/* Cover */}
      <div className="relative aspect-square mb-2 md:mb-3 rounded-md overflow-hidden shadow-lg shadow-black/40">
        <img
          src={track.coverUrl}
          alt={track.title}
          className="h-full w-full object-cover"
        />

        {/* Play button — appears on hover */}
        <button
          onClick={handlePlay}
          className={cn(
            'absolute bottom-2 right-2 flex items-center justify-center',
            'h-10 w-10 rounded-full bg-[hsl(var(--primary))] shadow-xl shadow-black/50',
            'transition-all duration-200',
            isPlaying
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0',
            'hover:scale-105 active:scale-95'
          )}
        >
          {isPlaying
            ? <Pause className="h-5 w-5 text-black fill-black" />
            : <Play className="h-5 w-5 text-black fill-black ml-0.5" />
          }
        </button>

        {/* Playing indicator */}
        {isPlaying && (
          <div className="absolute top-2 left-2 flex items-end gap-[2px] h-4">
            <span className="eq-bar" style={{ animationDuration: '0.6s' }} />
            <span className="eq-bar" style={{ animationDuration: '0.8s' }} />
            <span className="eq-bar" style={{ animationDuration: '0.5s' }} />
          </div>
        )}

        {/* Stems badge */}
        {track.hasStems && track.stems.length > 1 && (
          <div className="absolute top-2 right-2 flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-white font-semibold backdrop-blur-sm">
            <Layers className="h-2.5 w-2.5" />
            {track.stems.length}
          </div>
        )}
      </div>

      {/* Info */}
      <p className={cn(
        'text-sm font-semibold truncate',
        isActive ? 'text-[hsl(var(--primary))]' : 'text-white'
      )}>
        {track.title}
      </p>
      <p className="text-xs text-[#b3b3b3] truncate mt-0.5">
        {track.genreLabel}
      </p>
    </div>
  )
}

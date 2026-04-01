import { Play, Pause, Layers, Heart } from 'lucide-react'
import type { Track } from '@/types/track'
import { cn } from '@/lib/utils'
import { usePlayerStore } from '@/store/playerStore'
import { useFavoritesStore } from '@/store/favoritesStore'
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

  const isFav = useFavoritesStore(s => s.isFavorite)(track.id)
  const toggleFav = useFavoritesStore(s => s.toggle)

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

  const handleNavigate = async () => {
    if (!isActive) await loadTrack(track)
    navigate('/app/player')
    // Scroll to mixer after navigation + render
    setTimeout(() => {
      document.getElementById('player-mixer')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 300)
  }

  // ─── List view ─────────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <div
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-md group cursor-pointer transition-colors',
          isActive ? 'bg-white/10' : 'hover:bg-white/5'
        )}
        onClick={handleNavigate}
      >
        {/* Index / eq */}
        <div className="w-6 shrink-0 text-center">
          {isPlaying ? (
            <div className="flex items-end justify-center gap-[2px] h-4">
              <span className="eq-bar" style={{ animationDuration: '0.6s' }} />
              <span className="eq-bar" style={{ animationDuration: '0.8s' }} />
              <span className="eq-bar" style={{ animationDuration: '0.5s' }} />
            </div>
          ) : (
            <span className="text-xs text-[#808080] tabular-nums">
              {index || ''}
            </span>
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
          <p className="text-[11px] text-[#808080] truncate">
            {track.artist}
          </p>
        </div>

        {/* Stems */}
        {track.hasStems && track.stems.length > 1 && (
          <div className="flex items-center gap-1 text-[10px] text-[#808080] font-medium shrink-0">
            <Layers className="h-3 w-3" />
            <span>{track.stems.length}</span>
          </div>
        )}

        {/* Favorite */}
        <button
          className="shrink-0 p-1.5 transition-colors"
          onClick={(e) => { e.stopPropagation(); toggleFav(track.id) }}
        >
          <Heart className={cn(
            'h-4 w-4 transition-colors',
            isFav ? 'fill-red-500 text-red-500' : 'text-[#808080] hover:text-white'
          )} />
        </button>

        {/* Play on hover (desktop) */}
        <button
          className="hidden group-hover:flex items-center justify-center h-8 w-8 rounded-full bg-[hsl(var(--primary))] shrink-0 hover:scale-105 transition-transform"
          onClick={handlePlay}
        >
          {isPlaying
            ? <Pause className="h-3.5 w-3.5 text-black fill-black" />
            : <Play className="h-3.5 w-3.5 text-black fill-black ml-0.5" />
          }
        </button>
      </div>
    )
  }

  // ─── Grid view ─────────────────────────────────────────────────────
  return (
    <div
      className="group relative rounded-lg bg-white/[0.03] hover:bg-white/[0.08] p-2.5 md:p-3 cursor-pointer transition-all duration-200"
      onClick={handleNavigate}
    >
      {/* Cover */}
      <div className="relative aspect-square mb-2.5 rounded-md overflow-hidden shadow-lg shadow-black/40">
        <img
          src={track.coverUrl}
          alt={track.title}
          className="h-full w-full object-cover"
        />

        {/* Play button */}
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

        {/* Stems badge */}
        {track.hasStems && track.stems.length > 1 && (
          <div
            className="absolute top-1.5 right-1.5 flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-black/60 text-white/80 font-medium backdrop-blur-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <Layers className="h-2.5 w-2.5" />
            {track.stems.length}
          </div>
        )}

        {/* Playing indicator */}
        {isPlaying && (
          <div className="absolute top-1.5 left-1.5 flex items-end gap-[2px] h-3">
            <span className="eq-bar" style={{ animationDuration: '0.6s' }} />
            <span className="eq-bar" style={{ animationDuration: '0.8s' }} />
            <span className="eq-bar" style={{ animationDuration: '0.5s' }} />
          </div>
        )}

        {/* Favorite heart */}
        <button
          className={cn(
            'absolute bottom-2 left-2 p-1 rounded-full transition-all duration-200',
            isFav
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100'
          )}
          onClick={(e) => { e.stopPropagation(); toggleFav(track.id) }}
        >
          <Heart className={cn(
            'h-4 w-4 drop-shadow-lg transition-colors',
            isFav ? 'fill-red-500 text-red-500' : 'text-white hover:text-red-400'
          )} />
        </button>
      </div>

      {/* Info */}
      <p className={cn(
        'text-[13px] font-semibold truncate leading-tight',
        isActive ? 'text-[hsl(var(--primary))]' : 'text-white'
      )}>
        {track.title}
      </p>
      <p className="text-[11px] text-[#808080] truncate mt-0.5 leading-tight">
        {track.artist}
      </p>
    </div>
  )
}

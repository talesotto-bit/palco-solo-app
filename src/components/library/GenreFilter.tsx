import { GENRES } from '@/data/genres'
import type { Genre } from '@/types/track'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'

interface GenreFilterProps {
  selected: string
  onChange: (genre: string) => void
  catalogGenres?: { id: string; label: string; count: number }[]
}

export function GenreFilter({ selected, onChange, catalogGenres }: GenreFilterProps) {
  // Merge static genres with catalog genres (catalog takes priority for count)
  const allGenres = catalogGenres && catalogGenres.length > 0
    ? catalogGenres.map(cg => {
        const staticMatch = GENRES.find(g => g.id === cg.id)
        return {
          id: cg.id,
          label: staticMatch?.label || cg.label,
          emoji: staticMatch?.emoji || '🎵',
          count: cg.count,
        }
      })
    : GENRES.map(g => ({ ...g, count: 0 }))

  return (
    <ScrollArea className="w-full">
      <div className="flex items-center gap-2 pb-2">
        <button
          onClick={() => onChange('all')}
          className={cn(
            'flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors shrink-0',
            selected === 'all'
              ? 'bg-brand text-white'
              : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
          )}
        >
          🎵 Todos
        </button>

        {allGenres.map(genre => (
          <button
            key={genre.id}
            onClick={() => onChange(genre.id)}
            className={cn(
              'flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors shrink-0',
              selected === genre.id
                ? 'bg-brand text-white'
                : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
            )}
          >
            {genre.emoji} {genre.label}
            {genre.count > 0 && (
              <span className="text-[10px] opacity-70">({genre.count})</span>
            )}
          </button>
        ))}
      </div>
    </ScrollArea>
  )
}

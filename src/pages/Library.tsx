import { useState, useMemo, useEffect } from 'react'
import { Search, X, Loader2, LayoutGrid, List, Heart } from 'lucide-react'
import { useLocalTracksStore } from '@/store/localTracksStore'
import { useCatalogStore } from '@/store/catalogStore'
import { useFavoritesStore } from '@/store/favoritesStore'
import { TrackCard } from '@/components/library/TrackCard'
import { cn } from '@/lib/utils'

export default function Library() {
  const [search, setSearch] = useState('')
  const [genre, setGenre] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [showFavs, setShowFavs] = useState(false)

  const localTracks = useLocalTracksStore(s => s.tracks)
  const catalogTracks = useCatalogStore(s => s.tracks)
  const favIds = useFavoritesStore(s => s.ids)
  const catalogGenres = useCatalogStore(s => s.genres)
  const catalogLoading = useCatalogStore(s => s.isLoading)
  const loadCatalog = useCatalogStore(s => s.loadCatalog)

  useEffect(() => {
    if (catalogTracks.length === 0 && !catalogLoading) loadCatalog()
  }, [])

  const tracks = useMemo(() => [...localTracks, ...catalogTracks], [localTracks, catalogTracks])

  const isFiltering = search.trim() !== '' || genre !== 'all' || showFavs

  const filtered = useMemo(() => {
    let list = tracks

    if (showFavs) {
      list = list.filter(t => favIds.includes(t.id))
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.tags.some(tag => tag.toLowerCase().includes(q))
      )
    }

    if (genre !== 'all') {
      list = list.filter(t => t.genre === genre || t.tags.includes(genre))
    }

    return list.sort((a, b) => a.title.localeCompare(b.title))
  }, [tracks, search, genre, showFavs, favIds])

  // Grouped by first letter for alphabetical sections
  const alphabetSections = useMemo(() => {
    if (!isFiltering && genre === 'all') return null
    const sections: { letter: string; tracks: typeof filtered }[] = []
    const map = new Map<string, typeof filtered>()

    for (const t of filtered) {
      const letter = (t.title[0] || '#').toUpperCase().replace(/[^A-Z]/, '#')
      if (!map.has(letter)) map.set(letter, [])
      map.get(letter)!.push(t)
    }

    for (const [letter, tracks] of [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      sections.push({ letter, tracks })
    }
    return sections
  }, [filtered, isFiltering, genre, showFavs])

  // Genre sections for browse mode
  const genreSections = useMemo(() => {
    if (isFiltering || genre !== 'all') return null
    const sections: { id: string; label: string; tracks: typeof tracks }[] = []
    const genreMap = new Map<string, typeof tracks>()

    for (const t of tracks) {
      const gId = t.tags[0] || 'other'
      if (!genreMap.has(gId)) genreMap.set(gId, [])
      genreMap.get(gId)!.push(t)
    }

    const sorted = [...genreMap.entries()].sort((a, b) => b[1].length - a[1].length)
    for (const [id, genreTracks] of sorted) {
      const cg = catalogGenres.find(g => g.id === id)
      sections.push({
        id,
        label: cg?.label || id,
        tracks: genreTracks.sort((a, b) => a.title.localeCompare(b.title)),
      })
    }
    return sections
  }, [tracks, isFiltering, genre, showFavs, catalogGenres])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-0 z-10 px-4 md:px-6 pt-4 md:pt-6 pb-2 bg-[#1a1a1a]">
        {/* Title row */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg md:text-2xl font-bold text-white">
              {catalogLoading ? 'Carregando...' : 'Biblioteca'}
            </h1>
            {genre !== 'all' && (
              <p className="text-[11px] md:text-xs text-[#808080] mt-0.5">
                {catalogGenres.find(g => g.id === genre)?.label || genre}
              </p>
            )}
          </div>

          {/* View toggle */}
          {!catalogLoading && tracks.length > 0 && (
            <div className="flex items-center bg-[#2a2a2a] rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('grid')}
                className={cn(
                  'p-1.5 rounded-md transition-colors',
                  viewMode === 'grid' ? 'bg-white/10 text-white' : 'text-[#808080]'
                )}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={cn(
                  'p-1.5 rounded-md transition-colors',
                  viewMode === 'list' ? 'bg-white/10 text-white' : 'text-[#808080]'
                )}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#808080]" />
          <input
            type="text"
            placeholder="Buscar por título ou artista..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 rounded-lg bg-[#2a2a2a] pl-10 pr-10 text-sm text-white placeholder:text-[#808080] border-0 outline-none focus:ring-1 focus:ring-white/20 transition"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#808080] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Genre pills */}
        {catalogGenres.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-2 -mx-4 px-4 md:-mx-6 md:px-6 scrollbar-none">
            <button
              onClick={() => { setGenre('all'); setShowFavs(false) }}
              className={cn(
                'shrink-0 h-8 rounded-full px-4 text-xs font-semibold transition-colors',
                genre === 'all' && !showFavs
                  ? 'bg-white text-black'
                  : 'bg-[#2a2a2a] text-[#b3b3b3] hover:bg-[#3a3a3a]'
              )}
            >
              Todos
            </button>
            <button
              onClick={() => { setShowFavs(!showFavs); setGenre('all') }}
              className={cn(
                'shrink-0 h-8 rounded-full px-4 text-xs font-semibold transition-colors flex items-center gap-1.5',
                showFavs
                  ? 'bg-red-500 text-white'
                  : 'bg-[#2a2a2a] text-[#b3b3b3] hover:bg-[#3a3a3a]'
              )}
            >
              <Heart className={cn('h-3 w-3', showFavs && 'fill-white')} />
              Favoritos
              {favIds.length > 0 && (
                <span className="text-[10px] opacity-60">{favIds.length}</span>
              )}
            </button>
            {catalogGenres.map(g => (
              <button
                key={g.id}
                onClick={() => { setGenre(prev => prev === g.id ? 'all' : g.id); setShowFavs(false) }}
                className={cn(
                  'shrink-0 h-8 rounded-full px-4 text-xs font-semibold transition-colors',
                  genre === g.id
                    ? 'bg-white text-black'
                    : 'bg-[#2a2a2a] text-[#b3b3b3] hover:bg-[#3a3a3a]'
                )}
              >
                {g.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-4">
        {/* Loading */}
        {catalogLoading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-white/40" />
            <p className="text-sm text-[#808080]">Carregando catálogo...</p>
          </div>
        )}

        {/* Empty */}
        {!catalogLoading && tracks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <p className="text-lg font-semibold text-white">Biblioteca vazia</p>
            <p className="text-sm text-[#808080] max-w-xs">
              Use a página "Separar" para importar suas músicas.
            </p>
          </div>
        )}

        {/* No results */}
        {!catalogLoading && tracks.length > 0 && filtered.length === 0 && (
          <div className="flex flex-col items-center py-20 gap-2">
            {showFavs ? (
              <>
                <Heart className="h-10 w-10 text-[#808080] mb-2" />
                <p className="text-base font-semibold text-white">Nenhum favorito</p>
                <p className="text-sm text-[#808080]">Toque no cora\u00e7\u00e3o de uma m\u00fasica para adicion\u00e1-la aqui.</p>
              </>
            ) : (
              <>
                <p className="text-base font-semibold text-white">Nenhum resultado</p>
                <p className="text-sm text-[#808080]">Tente outro termo ou g\u00eanero.</p>
              </>
            )}
            <button
              onClick={() => { setSearch(''); setGenre('all'); setShowFavs(false) }}
              className="mt-3 h-8 rounded-full px-5 text-xs font-semibold bg-white text-black hover:scale-105 transition-transform"
            >
              Limpar filtros
            </button>
          </div>
        )}

        {/* Browse mode — genre sections */}
        {genreSections && genreSections.length > 0 && (
          <div className="space-y-8 md:space-y-10">
            {genreSections.map(section => (
              <section key={section.id}>
                <div className="flex items-center justify-between mb-3">
                  <h2
                    className="text-base md:text-lg font-bold text-white cursor-pointer hover:underline"
                    onClick={() => setGenre(section.id)}
                  >
                    {section.label}
                  </h2>
                  <button
                    onClick={() => setGenre(section.id)}
                    className="text-xs font-semibold text-[#808080] hover:text-white transition-colors"
                  >
                    Ver tudo
                  </button>
                </div>

                {viewMode === 'grid' ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
                    {section.tracks.slice(0, 12).map(track => (
                      <TrackCard key={track.id} track={track} view="grid" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {section.tracks.slice(0, 10).map((track, i) => (
                      <TrackCard key={track.id} track={track} view="list" index={i + 1} />
                    ))}
                  </div>
                )}
              </section>
            ))}

            {/* End-of-list search hint */}
            <div className="flex items-center justify-center gap-2 py-8 text-[#808080]">
              <Search className="h-4 w-4 shrink-0" />
              <p className="text-xs text-center">
                Para uma melhor experiência, busque por título ou artista na barra acima.
              </p>
            </div>
          </div>
        )}

        {/* Filtered results with alphabetical sections */}
        {alphabetSections && alphabetSections.length > 0 && (
          <div className="space-y-5">
            {alphabetSections.map(section => (
              <section key={section.letter}>
                <div className="sticky top-0 z-[5] bg-[#121212] py-1 mb-1">
                  <span className="text-xs font-bold text-[#808080] uppercase tracking-wider">
                    {section.letter}
                  </span>
                </div>

                {viewMode === 'grid' ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
                    {section.tracks.map(track => (
                      <TrackCard key={track.id} track={track} view="grid" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {section.tracks.map((track, i) => (
                      <TrackCard key={track.id} track={track} view="list" index={i + 1} />
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

import { useState, useMemo, useEffect } from 'react'
import { Search, SlidersHorizontal, Loader2, X, Wand2 } from 'lucide-react'
import { useLocalTracksStore } from '@/store/localTracksStore'
import { useCatalogStore } from '@/store/catalogStore'
import { TrackCard } from '@/components/library/TrackCard'
import { LocalFileLoader } from '@/components/library/LocalFileLoader'
import { StemSeparator } from '@/components/library/StemSeparator'
import { cn } from '@/lib/utils'

export default function Library() {
  const [search, setSearch] = useState('')
  const [genre, setGenre] = useState<string>('all')
  const [stemsOnly, setStemsOnly] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showSeparator, setShowSeparator] = useState(false)

  const localTracks = useLocalTracksStore(s => s.tracks)
  const catalogTracks = useCatalogStore(s => s.tracks)
  const catalogGenres = useCatalogStore(s => s.genres)
  const catalogLoading = useCatalogStore(s => s.isLoading)
  const loadCatalog = useCatalogStore(s => s.loadCatalog)

  useEffect(() => {
    if (catalogTracks.length === 0 && !catalogLoading) {
      loadCatalog()
    }
  }, [])

  const tracks = useMemo(() => [...localTracks, ...catalogTracks], [localTracks, catalogTracks])

  const filtered = useMemo(() => {
    let list = tracks

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

    if (stemsOnly) {
      list = list.filter(t => t.hasStems)
    }

    return list.sort((a, b) => a.title.localeCompare(b.title))
  }, [tracks, search, genre, stemsOnly])

  const genreSections = useMemo(() => {
    if (search.trim() || genre !== 'all' || stemsOnly) return null

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
        tracks: genreTracks.slice(0, 20),
      })
    }
    return sections
  }, [tracks, search, genre, stemsOnly, catalogGenres])

  const totalTracks = tracks.length
  const totalStems = tracks.filter(t => t.hasStems).length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-0 z-10 px-4 md:px-6 pt-4 md:pt-6 pb-3 md:pb-4 bg-gradient-to-b from-[#1a1a1a] to-transparent">
        <div className="flex items-center justify-between mb-4 md:mb-5">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-white">
              {catalogLoading ? 'Carregando...' : 'Biblioteca'}
            </h1>
            {totalTracks > 0 && (
              <p className="text-xs md:text-sm text-[#b3b3b3] mt-0.5">
                {totalTracks} faixa{totalTracks !== 1 ? 's' : ''} {totalStems > 0 && `· ${totalStems} com stems`}
              </p>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#b3b3b3]" />
          <input
            type="text"
            placeholder="O que você quer ouvir?"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 rounded-full bg-[#2a2a2a] pl-10 pr-10 text-sm text-white placeholder:text-[#b3b3b3] border-0 outline-none focus:ring-2 focus:ring-white/20 transition"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#b3b3b3] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Filter buttons — scrollable row */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 md:-mx-6 md:px-6 pb-1">
          <button
            onClick={() => setStemsOnly(s => !s)}
            className={cn(
              'flex items-center gap-1.5 h-8 rounded-full px-3 md:px-4 text-xs font-semibold transition-colors whitespace-nowrap shrink-0',
              stemsOnly
                ? 'bg-[hsl(var(--primary))] text-black'
                : 'bg-[#2a2a2a] text-white hover:bg-[#3a3a3a]'
            )}
          >
            <SlidersHorizontal className="h-3 w-3" />
            Stems
          </button>

          <button
            onClick={() => { setShowSeparator(s => !s); setShowImport(false) }}
            className={cn(
              'flex items-center gap-1.5 h-8 rounded-full px-3 md:px-4 text-xs font-semibold transition-colors whitespace-nowrap shrink-0',
              showSeparator
                ? 'bg-purple-500 text-white'
                : 'bg-gradient-to-r from-purple-500/20 to-[hsl(var(--primary))]/20 text-purple-300 hover:from-purple-500/30 hover:to-[hsl(var(--primary))]/30'
            )}
          >
            <Wand2 className="h-3 w-3" />
            Separar IA
          </button>

          <button
            onClick={() => { setShowImport(s => !s); setShowSeparator(false) }}
            className="h-8 rounded-full px-3 md:px-4 text-xs font-semibold bg-[#2a2a2a] text-white hover:bg-[#3a3a3a] transition-colors whitespace-nowrap shrink-0"
          >
            + Importar
          </button>
        </div>

        {/* Genre pills */}
        {catalogGenres.length > 0 && (
          <div className="flex items-center gap-2 mt-3 overflow-x-auto pb-1 -mx-4 px-4 md:-mx-6 md:px-6 scrollbar-none">
            <button
              onClick={() => setGenre('all')}
              className={cn(
                'shrink-0 h-8 rounded-full px-3 md:px-4 text-xs font-semibold transition-colors',
                genre === 'all'
                  ? 'bg-white text-black'
                  : 'bg-[#2a2a2a] text-white hover:bg-[#3a3a3a]'
              )}
            >
              Todos
            </button>
            {catalogGenres.map(g => (
              <button
                key={g.id}
                onClick={() => setGenre(g.id)}
                className={cn(
                  'shrink-0 h-8 rounded-full px-3 md:px-4 text-xs font-semibold transition-colors',
                  genre === g.id
                    ? 'bg-white text-black'
                    : 'bg-[#2a2a2a] text-white hover:bg-[#3a3a3a]'
                )}
              >
                {g.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Separator zone */}
      {showSeparator && (
        <div className="px-4 md:px-6 pb-4 animate-fade-in">
          <StemSeparator onClose={() => setShowSeparator(false)} />
        </div>
      )}

      {/* Import zone */}
      {showImport && (
        <div className="px-4 md:px-6 pb-4 animate-fade-in">
          <LocalFileLoader />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-8">
        {/* Loading */}
        {catalogLoading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--primary))]" />
            <p className="text-sm text-[#b3b3b3]">Carregando catálogo...</p>
          </div>
        )}

        {/* Empty state */}
        {!catalogLoading && tracks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <div className="h-20 w-20 rounded-full bg-[#2a2a2a] flex items-center justify-center">
              <Search className="h-8 w-8 text-[#535353]" />
            </div>
            <div>
              <p className="text-xl font-bold text-white">Biblioteca vazia</p>
              <p className="text-sm text-[#b3b3b3] mt-2 max-w-xs">
                Clique em "Importar" para adicionar seus arquivos de stems.
              </p>
            </div>
          </div>
        )}

        {/* No results */}
        {!catalogLoading && tracks.length > 0 && filtered.length === 0 && (
          <div className="flex flex-col items-center py-20 gap-3">
            <p className="text-base font-semibold text-white">Nenhum resultado para "{search}"</p>
            <p className="text-sm text-[#b3b3b3]">Tente buscar por outro termo.</p>
            <button
              onClick={() => { setSearch(''); setGenre('all'); setStemsOnly(false) }}
              className="mt-2 h-8 rounded-full px-5 text-sm font-semibold bg-white text-black hover:scale-105 transition-transform"
            >
              Limpar filtros
            </button>
          </div>
        )}

        {/* Genre sections (browsing mode) */}
        {genreSections && genreSections.length > 0 && (
          <div className="space-y-6 md:space-y-8">
            {genreSections.map(section => (
              <section key={section.id} className="animate-fade-in">
                <div className="flex items-center justify-between mb-3 md:mb-4">
                  <h2 className="text-lg md:text-xl font-bold text-white hover:underline cursor-pointer"
                      onClick={() => setGenre(section.id)}>
                    {section.label}
                  </h2>
                  <button
                    onClick={() => setGenre(section.id)}
                    className="text-xs md:text-sm font-semibold text-[#b3b3b3] hover:text-white transition-colors"
                  >
                    Ver tudo
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
                  {section.tracks.slice(0, 6).map(track => (
                    <TrackCard key={track.id} track={track} view="grid" />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* Filtered results */}
        {!genreSections && filtered.length > 0 && (
          <div className="space-y-1">
            {filtered.map((track, i) => (
              <TrackCard key={track.id} track={track} view="list" index={i + 1} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { Search, X, Loader2, LayoutGrid, List, Heart, ChevronDown, Lock } from 'lucide-react'
import { useLocalTracksStore } from '@/store/localTracksStore'
import { useCatalogStore } from '@/store/catalogStore'
import { useFavoritesStore } from '@/store/favoritesStore'
import { useTrialStore } from '@/store/trialStore'
import { TrackCard } from '@/components/library/TrackCard'
import { cn } from '@/lib/utils'

const BATCH_SIZE = 60

export default function Library() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [genre, setGenre] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [showFavs, setShowFavs] = useState(false)
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  const localTracks = useLocalTracksStore(s => s.tracks)
  const catalogTracks = useCatalogStore(s => s.tracks)
  const favIds = useFavoritesStore(s => s.ids)
  const catalogGenres = useCatalogStore(s => s.genres)
  const catalogLoading = useCatalogStore(s => s.isLoading)
  const loadCatalog = useCatalogStore(s => s.loadCatalog)
  const isTrialMode = useTrialStore(s => s.isTrialMode)

  useEffect(() => {
    if (catalogTracks.length === 0 && !catalogLoading) loadCatalog()
  }, [])

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(value), 350)
  }, [])

  useEffect(() => () => clearTimeout(debounceRef.current), [])

  const allTracks = useMemo(
    () => [...localTracks, ...catalogTracks].sort((a, b) => a.title.localeCompare(b.title)),
    [localTracks, catalogTracks]
  )

  useEffect(() => { setVisibleCount(BATCH_SIZE) }, [debouncedSearch, genre, showFavs])

  const filtered = useMemo(() => {
    let list = allTracks

    if (showFavs) {
      list = list.filter(t => favIds.includes(t.id))
    }

    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase()
      list = list.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        (t.tags || []).some(tag => tag.toLowerCase().includes(q))
      )
    }

    if (genre !== 'all') {
      list = list.filter(t => t.genre === genre || (t.tags || []).includes(genre))
    }

    return list
  }, [allTracks, debouncedSearch, genre, showFavs, favIds])

  const displayTracks = filtered.slice(0, visibleCount)
  const hasMore = visibleCount < filtered.length
  const totalCount = filtered.length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-0 z-10 px-4 md:px-6 pt-4 md:pt-6 pb-2 bg-[#1a1a1a]">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg md:text-2xl font-bold text-white">
              {catalogLoading ? 'Carregando...' : 'Biblioteca'}
            </h1>
            <p className="text-[11px] md:text-xs text-[#808080] mt-0.5">
              {catalogLoading ? '' : genre !== 'all'
                ? catalogGenres.find(g => g.id === genre)?.label || genre
                : isTrialMode
                  ? `${allTracks.length} faixas — amostra do catálogo`
                  : `${allTracks.length} faixas`}
            </p>
          </div>

          {!catalogLoading && allTracks.length > 0 && (
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
            placeholder="Buscar por titulo ou artista..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full h-10 rounded-lg bg-[#2a2a2a] pl-10 pr-10 text-sm text-white placeholder:text-[#808080] border-0 outline-none focus:ring-1 focus:ring-white/20 transition"
          />
          {search && (
            <button
              onClick={() => { setSearch(''); setDebouncedSearch(''); clearTimeout(debounceRef.current) }}
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
                <span className="ml-1 text-[10px] opacity-50">{g.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-4">
        {catalogLoading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-white/40" />
            <p className="text-sm text-[#808080]">Carregando catalogo...</p>
          </div>
        )}

        {!catalogLoading && allTracks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <p className="text-lg font-semibold text-white">Biblioteca vazia</p>
            <p className="text-sm text-[#808080] max-w-xs">
              Use a pagina "Separar" para importar suas musicas.
            </p>
          </div>
        )}

        {!catalogLoading && allTracks.length > 0 && totalCount === 0 && (
          <div className="flex flex-col items-center py-20 gap-2">
            {showFavs ? (
              <>
                <Heart className="h-10 w-10 text-[#808080] mb-2" />
                <p className="text-base font-semibold text-white">Nenhum favorito</p>
                <p className="text-sm text-[#808080]">Toque no coracao de uma musica para adiciona-la aqui.</p>
              </>
            ) : (
              <>
                <p className="text-base font-semibold text-white">Nenhum resultado</p>
                <p className="text-sm text-[#808080]">Tente outro termo ou genero.</p>
              </>
            )}
            <button
              onClick={() => { setSearch(''); setDebouncedSearch(''); clearTimeout(debounceRef.current); setGenre('all'); setShowFavs(false) }}
              className="mt-3 h-8 rounded-full px-5 text-xs font-semibold bg-white text-black hover:scale-105 transition-transform"
            >
              Limpar filtros
            </button>
          </div>
        )}

        {/* Track list */}
        {!catalogLoading && totalCount > 0 && (
          <div>
            {(debouncedSearch || genre !== 'all' || showFavs) && (
              <p className="text-xs text-[#808080] mb-3">
                {totalCount} resultado{totalCount !== 1 ? 's' : ''}
              </p>
            )}

            {viewMode === 'grid' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
                {displayTracks.map(track => (
                  <TrackCard key={track.id} track={track} view="grid" />
                ))}
              </div>
            ) : (
              <div className="space-y-0.5">
                {displayTracks.map((track, i) => (
                  <TrackCard key={track.id} track={track} view="list" index={i + 1} />
                ))}
              </div>
            )}

            {hasMore && (
              <div className="flex flex-col items-center gap-2 py-6">
                <p className="text-[11px] text-[#808080]">
                  Mostrando {displayTracks.length} de {totalCount}
                </p>
                <button
                  onClick={() => setVisibleCount(v => v + BATCH_SIZE)}
                  className="flex items-center gap-2 h-9 rounded-full px-6 text-xs font-semibold bg-white/10 text-white hover:bg-white/20 transition-colors"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                  Carregar mais
                </button>
              </div>
            )}

            {!hasMore && totalCount > BATCH_SIZE && !isTrialMode && (
              <p className="text-center text-[11px] text-[#808080] py-6">
                Todas as {totalCount} faixas carregadas
              </p>
            )}

            {isTrialMode && (
              <div className="flex flex-col items-center gap-3 py-8 mt-4 rounded-xl bg-white/[0.03] border border-white/5">
                <Lock className="h-6 w-6 text-[#808080]" />
                <p className="text-sm font-semibold text-white">
                  +100.000 faixas no catálogo completo
                </p>
                <p className="text-xs text-[#808080] text-center max-w-xs">
                  Você está ouvindo apenas uma amostra. Adquira o acesso completo para desbloquear todo o catálogo com atualizações semanais.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

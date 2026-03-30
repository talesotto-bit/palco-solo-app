/**
 * Store que carrega o catálogo de músicas do R2.
 * Fase 1: lê catalog.json (gerado pelo script de upload)
 * Fase 2: será substituído por Supabase queries
 */
import { create } from 'zustand'
import type { Track, Stem } from '@/types/track'

interface CatalogSong {
  name: string
  slug: string
  genre: string
  genreSlug: string
  stems: {
    name: string
    slug: string
    key: string
    url: string
    format: string
    size: number
  }[]
  stemCount: number
}

interface CatalogState {
  tracks: Track[]
  genres: { id: string; label: string; count: number }[]
  isLoading: boolean
  error: string | null
  loadCatalog: () => Promise<void>
}

function genreSlugToLabel(slug: string): string {
  const map: Record<string, string> = {
    'atualizacoes': 'Atualizações',
    'forro': 'Forró',
    'pagode': 'Pagode',
    'sertanejo': 'Sertanejo',
    'gospel': 'Gospel',
    'rock-pop-mpb': 'Rock Pop MPB',
    'axe-carnaval': 'Axé / Carnaval',
    'aberturas': 'Aberturas',
    'playbacks': 'Playbacks',
    'shows-multipistas': 'Shows Multipistas',
    'shows-playbacks': 'Shows Playbacks',
  }
  return map[slug] || slug
}

function catalogToTrack(song: CatalogSong, index: number): Track {
  const stems: Stem[] = song.stems.map((s, i) => ({
    id: s.slug || `stem-${i}`,
    label: s.name,
    audioUrl: s.url,
    isPrimary: i === 0,
  }))

  // Generate a color-based cover placeholder
  const colors = ['#1a1a2e', '#16213e', '#0f3460', '#1b1b2f', '#162447', '#1f4068', '#1b262c', '#0f0e17']
  const color = colors[index % colors.length]
  const initial = (song.name || '?').charAt(0).toUpperCase()
  // Truncate name for SVG display
  const displayName = song.name.length > 20 ? song.name.slice(0, 18) + '...' : song.name

  return {
    id: `r2-${song.genreSlug}-${song.slug}`,
    title: song.name,
    artist: song.genreSlug === 'gospel' ? 'Gospel' : genreSlugToLabel(song.genreSlug),
    genre: song.genreSlug as any,
    genreLabel: genreSlugToLabel(song.genreSlug),
    bpm: 0,
    keyNote: '',
    keyScale: 'major',
    durationSeconds: 0,
    coverUrl: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect fill="${color}" width="200" height="200"/><text x="100" y="100" text-anchor="middle" dominant-baseline="central" fill="rgba(255,255,255,0.15)" font-size="120" font-weight="bold" font-family="sans-serif">${initial}</text><text x="100" y="170" text-anchor="middle" fill="rgba(255,255,255,0.5)" font-size="11" font-family="sans-serif">${song.stemCount} stems</text></svg>`)}`,
    previewUrl: stems[0]?.audioUrl || '',
    hasStems: song.stemCount > 1,
    stems,
    hasLyrics: false,
    tags: [song.genreSlug],
  }
}

export const useCatalogStore = create<CatalogState>((set) => ({
  tracks: [],
  genres: [],
  isLoading: false,
  error: null,

  loadCatalog: async () => {
    set({ isLoading: true, error: null })
    try {
      // Try loading from the R2 public URL first, fallback to local
      let catalog: CatalogSong[] = []

      try {
        const res = await fetch('/catalog.json')
        if (res.ok) {
          catalog = await res.json()
        }
      } catch {
        // Will be empty, that's ok
      }

      if (catalog.length === 0) {
        set({ isLoading: false, tracks: [], genres: [] })
        return
      }

      const tracks = catalog.map((song, i) => catalogToTrack(song, i))

      // Extract genres with counts
      const genreMap = new Map<string, number>()
      for (const song of catalog) {
        genreMap.set(song.genreSlug, (genreMap.get(song.genreSlug) || 0) + 1)
      }
      const genres = Array.from(genreMap.entries()).map(([id, count]) => ({
        id,
        label: genreSlugToLabel(id),
        count,
      })).sort((a, b) => b.count - a.count)

      set({ tracks, genres, isLoading: false })
    } catch (err: any) {
      set({ error: err.message, isLoading: false })
    }
  },
}))

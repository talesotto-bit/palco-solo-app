import { create } from 'zustand'
import type { Track, Stem } from '@/types/track'
import { cleanSongName, parseFolderName, detectInstrument, stemLabel, toTitleCase } from '@/lib/stemDetection'
import { INSTRUMENT_LABELS } from '@/types/track'

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

// ─── Genre labels ──────────────────────────────────────────────────────

function genreSlugToLabel(slug: string): string {
  const map: Record<string, string> = {
    'atualizacoes': 'Lançamentos',
    'forro': 'Forró',
    'pagode': 'Pagode',
    'sertanejo': 'Sertanejo',
    'gospel': 'Gospel',
    'rock-pop-mpb': 'Rock / Pop / MPB',
    'axe-carnaval': 'Axé / Carnaval',
    'aberturas': 'Aberturas',
    'playbacks': 'Playbacks',
    'shows-multipistas': 'Shows Multipistas',
    'shows-playbacks': 'Shows Playbacks',
  }
  return map[slug] || toTitleCase(slug.replace(/-/g, ' '))
}

// ─── Cover art gradient generator ──────────────────────────────────────

const GRADIENT_PAIRS = [
  ['#1a1a2e', '#4a1942'],
  ['#0f3460', '#16213e'],
  ['#1b262c', '#0f4c75'],
  ['#2d132c', '#801336'],
  ['#1a1a2e', '#e94560'],
  ['#0a3d62', '#3c6382'],
  ['#1e3799', '#0c2461'],
  ['#6a0572', '#ab83a1'],
  ['#1b4332', '#2d6a4f'],
  ['#3d0066', '#7b2ff7'],
  ['#1c1c3d', '#4834d4'],
  ['#2c003e', '#512b58'],
]

function hashCode(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

function generateCover(title: string, artist: string, index: number): string {
  const hash = hashCode(title + artist)
  const [c1, c2] = GRADIENT_PAIRS[hash % GRADIENT_PAIRS.length]
  const initial = (title || '?').charAt(0).toUpperCase()

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${c1}"/>
        <stop offset="100%" stop-color="${c2}"/>
      </linearGradient>
    </defs>
    <rect fill="url(#g)" width="200" height="200"/>
    <text x="100" y="105" text-anchor="middle" dominant-baseline="central" fill="rgba(255,255,255,0.12)" font-size="140" font-weight="900" font-family="sans-serif">${initial}</text>
  </svg>`

  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

// ─── Clean stem name (remove song prefix from stem names) ──────────────

function cleanStemName(stemName: string, songName: string): string {
  let name = stemName
    .replace(/\.(mp3|wav|ogg|flac)$/i, '')
    .trim()

  // Some stems include the song name as prefix: "SONG NAME-STEM.MP3"
  const songClean = cleanSongName(songName).toLowerCase()
  const nameLower = name.toLowerCase()
  if (nameLower.startsWith(songClean)) {
    name = name.slice(songClean.length).replace(/^[-\s]+/, '').trim()
  }
  // Also check slug-like prefix
  const slugPrefix = songClean.replace(/\s+/g, '-')
  if (nameLower.startsWith(slugPrefix)) {
    name = name.slice(slugPrefix.length).replace(/^[-\s]+/, '').trim()
  }

  return name || stemName.replace(/\.(mp3|wav|ogg|flac)$/i, '')
}

// ─── Convert catalog song to Track ─────────────────────────────────────

function catalogToTrack(song: CatalogSong, index: number): Track {
  const { artist, title } = parseFolderName(song.name)

  // Extract BPM from raw name if present
  const bpmMatch = song.name.match(/(\d+(?:\.\d+)?)\s*BPM/i)
  const bpm = bpmMatch ? Math.round(parseFloat(bpmMatch[1])) : 0

  // Extract key from raw name if present
  const keyMatch = song.name.match(/[-\s]([A-G][b#]?)(?:\s*$|-\d)/)
  const keyNote = keyMatch ? keyMatch[1] : ''

  // Process stems with instrument detection and numbering
  const instrumentCounts = new Map<string, number>()

  const stems: Stem[] = song.stems.map((s, i) => {
    const cleaned = cleanStemName(s.name, song.name)
    const instrument = detectInstrument(cleaned)
    const label = instrument !== 'main' ? INSTRUMENT_LABELS[instrument] : toTitleCase(cleaned)

    // Number duplicate instruments: Guitarra 1, Guitarra 2
    const count = (instrumentCounts.get(instrument) || 0) + 1
    instrumentCounts.set(instrument, count)

    return {
      id: s.slug || `stem-${i}`,
      label,
      audioUrl: s.url,
      isPrimary: i === 0,
    } satisfies Stem
  })

  // Post-process: add numbers to duplicate instrument labels
  const finalStems = stems.map(s => {
    const instrument = detectInstrument(s.label.toLowerCase())
    const total = instrumentCounts.get(instrument) || 1
    if (total > 1 && instrument !== 'main') {
      // Count which number this is
      let n = 0
      for (const st of stems) {
        if (detectInstrument(st.label.toLowerCase()) === instrument) {
          n++
          if (st === s) {
            return { ...s, label: `${INSTRUMENT_LABELS[instrument]} ${n}` }
          }
        }
      }
    }
    return s
  })

  return {
    id: `r2-${song.genreSlug}-${song.slug}`,
    title,
    artist: artist || genreSlugToLabel(song.genreSlug),
    genre: song.genreSlug as any,
    genreLabel: genreSlugToLabel(song.genreSlug),
    bpm,
    keyNote,
    keyScale: 'major',
    durationSeconds: 0,
    coverUrl: generateCover(title, artist, index),
    previewUrl: finalStems[0]?.audioUrl || '',
    hasStems: song.stemCount > 1,
    stems: finalStems,
    hasLyrics: false,
    tags: [song.genreSlug],
  }
}

// ─── Store ─────────────────────────────────────────────────────────────

export const useCatalogStore = create<CatalogState>((set) => ({
  tracks: [],
  genres: [],
  isLoading: false,
  error: null,

  loadCatalog: async () => {
    set({ isLoading: true, error: null })
    try {
      let catalog: CatalogSong[] = []

      try {
        const res = await fetch('/catalog.json')
        if (res.ok) catalog = await res.json()
      } catch { /* empty catalog is ok */ }

      if (catalog.length === 0) {
        set({ isLoading: false, tracks: [], genres: [] })
        return
      }

      const tracks = catalog.map((song, i) => catalogToTrack(song, i))

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

import { create } from 'zustand'

export interface LrcLine {
  time: number
  text: string
}

interface LyricsState {
  plainLyrics: string | null
  syncedLines: LrcLine[] | null
  isLoading: boolean
  error: string | null
  trackId: string | null
  source: string | null
  fetchLyrics: (artist: string, title: string, trackId: string) => Promise<void>
  searchManual: (query: string, trackId: string) => Promise<void>
  resetToSearch: () => void
  clear: () => void
}

const CACHE_KEY = 'palco-lyrics-cache-v4'
const MAX_CACHE = 200

try { localStorage.removeItem('palco-lyrics-cache-v2') } catch {}
try { localStorage.removeItem('palco-lyrics-cache-v3') } catch {}

interface CacheEntry {
  plainLyrics: string
  syncedLyrics: string | null
  source: string
}

function getCache(): Record<string, CacheEntry> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')
  } catch {
    return {}
  }
}

function setCache(key: string, entry: CacheEntry) {
  try {
    const cache = getCache()
    cache[key] = entry
    const keys = Object.keys(cache)
    if (keys.length > MAX_CACHE) {
      keys.slice(0, keys.length - MAX_CACHE).forEach(k => delete cache[k])
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {}
}

function cacheKeyFor(artist: string, title: string): string {
  return `${artist.toLowerCase().trim()}::${title.toLowerCase().trim()}`
}

function cleanTitleForSearch(raw: string): string {
  let t = raw.trim()
  t = t.replace(/\s*[-–]?\s*vers[aã]o\s+\w+(\s+\w+)?$/i, '')
  t = t.replace(/\s*[-–]?\s*(dvd\s+\w+(\s+\w+)*|ao\s+vivo(\s+\w+)*|eletr[io]co|original|pagod[aã]o|cabar[eé]\s*\d*)$/i, '')
  t = t.replace(/\s+a\s+lenda\s+ws\s+safad[aã]o$/i, '')
  t = t.replace(/\s+\d{1,2}$/, '')
  t = t.replace(/\s+embaixador\s+\w+(\s+\w+)*$/i, '')
  return t.trim() || raw.trim()
}

function parseLrc(lrc: string): LrcLine[] {
  const lines: LrcLine[] = []
  for (const raw of lrc.split('\n')) {
    const match = raw.match(/^\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.*)$/)
    if (!match) continue
    const mins = parseInt(match[1], 10)
    const secs = parseInt(match[2], 10)
    const ms = match[3].length === 2
      ? parseInt(match[3], 10) * 10
      : parseInt(match[3], 10)
    const time = mins * 60 + secs + ms / 1000
    const text = match[4].trim()
    if (text) lines.push({ time, text })
  }
  return lines.sort((a, b) => a.time - b.time)
}

export const useLyricsStore = create<LyricsState>((set, get) => ({
  plainLyrics: null,
  syncedLines: null,
  isLoading: false,
  error: null,
  trackId: null,
  source: null,

  fetchLyrics: async (artist: string, title: string, trackId: string) => {
    if (get().trackId === trackId && (get().plainLyrics || get().syncedLines)) return

    const cleanedTitle = cleanTitleForSearch(title)
    const key = cacheKeyFor(artist, cleanedTitle)
    const cached = getCache()[key]
    if (cached) {
      const synced = cached.syncedLyrics ? parseLrc(cached.syncedLyrics) : null
      set({
        plainLyrics: cached.plainLyrics || null,
        syncedLines: synced && synced.length > 0 ? synced : null,
        source: cached.source,
        trackId,
        isLoading: false,
        error: null,
      })
      return
    }

    set({ isLoading: true, error: null, trackId, plainLyrics: null, syncedLines: null, source: null })

    try {
      const params = new URLSearchParams({ artist, title: cleanedTitle })
      const res = await fetch(`/api/lyrics?${params}`)

      if (get().trackId !== trackId) return

      if (res.status === 404) {
        set({ isLoading: false, error: 'not_found' })
        return
      }

      if (!res.ok) {
        set({ isLoading: false, error: 'fetch_error' })
        return
      }

      const data = await res.json()
      const plain = data.plainLyrics || data.lyrics || ''
      const synced = data.syncedLyrics || null
      setCache(key, {
        plainLyrics: plain,
        syncedLyrics: synced,
        source: data.source,
      })

      if (get().trackId !== trackId) return

      const parsed = synced ? parseLrc(synced) : null
      set({
        plainLyrics: plain || null,
        syncedLines: parsed && parsed.length > 0 ? parsed : null,
        source: data.source,
        isLoading: false,
      })
    } catch {
      if (get().trackId !== trackId) return
      set({ isLoading: false, error: 'fetch_error' })
    }
  },

  searchManual: async (query: string, trackId: string) => {
    const parts = query.split(/\s*[-–—]\s*/)
    let artist = ''
    let title = query.trim()
    if (parts.length >= 2) {
      artist = parts[0].trim()
      title = parts.slice(1).join(' - ').trim()
    }

    const key = cacheKeyFor(artist || '_manual', title)
    const cached = getCache()[key]
    if (cached) {
      const synced = cached.syncedLyrics ? parseLrc(cached.syncedLyrics) : null
      set({
        plainLyrics: cached.plainLyrics || null,
        syncedLines: synced && synced.length > 0 ? synced : null,
        source: cached.source,
        trackId,
        isLoading: false,
        error: null,
      })
      return
    }

    set({ isLoading: true, error: null, plainLyrics: null, syncedLines: null, source: null })

    try {
      const params = new URLSearchParams({ artist, title })
      const res = await fetch(`/api/lyrics?${params}`)

      if (get().trackId !== trackId) return

      if (res.status === 404) {
        set({ isLoading: false, error: 'not_found' })
        return
      }

      if (!res.ok) {
        set({ isLoading: false, error: 'fetch_error' })
        return
      }

      const data = await res.json()
      const plain = data.plainLyrics || data.lyrics || ''
      const synced = data.syncedLyrics || null
      setCache(key, {
        plainLyrics: plain,
        syncedLyrics: synced,
        source: data.source,
      })

      if (get().trackId !== trackId) return

      const parsed = synced ? parseLrc(synced) : null
      set({
        plainLyrics: plain || null,
        syncedLines: parsed && parsed.length > 0 ? parsed : null,
        source: data.source,
        isLoading: false,
      })
    } catch {
      if (get().trackId !== trackId) return
      set({ isLoading: false, error: 'fetch_error' })
    }
  },

  resetToSearch: () => set({
    plainLyrics: null,
    syncedLines: null,
    isLoading: false,
    error: 'not_found',
    source: null,
  }),

  clear: () => set({
    plainLyrics: null,
    syncedLines: null,
    isLoading: false,
    error: null,
    trackId: null,
    source: null,
  }),
}))

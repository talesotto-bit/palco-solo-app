import { create } from 'zustand'

interface LyricsState {
  lyrics: string | null
  isLoading: boolean
  error: string | null
  trackId: string | null
  source: string | null
  fetchLyrics: (artist: string, title: string, trackId: string) => Promise<void>
  clear: () => void
}

const CACHE_KEY = 'palco-lyrics-cache'
const MAX_CACHE = 200

function getCache(): Record<string, { lyrics: string; source: string }> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')
  } catch {
    return {}
  }
}

function setCache(key: string, lyrics: string, source: string) {
  try {
    const cache = getCache()
    cache[key] = { lyrics, source }
    const keys = Object.keys(cache)
    if (keys.length > MAX_CACHE) {
      keys.slice(0, keys.length - MAX_CACHE).forEach(k => delete cache[k])
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {}
}

function cacheKey(artist: string, title: string): string {
  return `${artist.toLowerCase().trim()}::${title.toLowerCase().trim()}`
}

export const useLyricsStore = create<LyricsState>((set, get) => ({
  lyrics: null,
  isLoading: false,
  error: null,
  trackId: null,
  source: null,

  fetchLyrics: async (artist: string, title: string, trackId: string) => {
    if (get().trackId === trackId && get().lyrics) return

    const key = cacheKey(artist, title)
    const cached = getCache()[key]
    if (cached) {
      set({ lyrics: cached.lyrics, source: cached.source, trackId, isLoading: false, error: null })
      return
    }

    set({ isLoading: true, error: null, trackId, lyrics: null, source: null })

    try {
      const params = new URLSearchParams({ artist, title })
      const res = await fetch(`/api/lyrics?${params}`)

      if (get().trackId !== trackId) return

      if (res.status === 404) {
        set({ isLoading: false, error: 'not_found' })
        return
      }

      if (res.status === 503) {
        set({ isLoading: false, error: 'not_configured' })
        return
      }

      if (!res.ok) {
        set({ isLoading: false, error: 'fetch_error' })
        return
      }

      const data = await res.json()
      setCache(key, data.lyrics, data.source)
      if (get().trackId !== trackId) return
      set({ lyrics: data.lyrics, source: data.source, isLoading: false })
    } catch {
      if (get().trackId !== trackId) return
      set({ isLoading: false, error: 'fetch_error' })
    }
  },

  clear: () => set({ lyrics: null, isLoading: false, error: null, trackId: null, source: null }),
}))

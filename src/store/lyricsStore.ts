import { useOwnLyrics } from './ownLyricsStore'
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
  fetchLyrics: (artist: string, title: string, trackId: string, lrclibId?: number, trackSeconds?: number, voiceUrl?: string) => Promise<void>
  searchManual: (query: string, trackId: string) => Promise<void>
  resetToSearch: () => void
  /** o músico escolheu a letra certa numa lista do LRCLIB: carrega e lembra para esta música */
  pickLyrics: (lrclibId: number, artist: string, title: string, trackId: string, trackSeconds?: number) => Promise<void>
  reload: (artist: string, title: string, trackId: string, lrclibId?: number, trackSeconds?: number, voiceUrl?: string) => void
  clear: () => void
}

const CACHE_KEY = 'palco-lyrics-cache-v5'
const MAX_CACHE = 200

try { localStorage.removeItem('palco-lyrics-cache-v2') } catch {}
try { localStorage.removeItem('palco-lyrics-cache-v3') } catch {}
try { localStorage.removeItem('palco-lyrics-cache-v4') } catch {}

interface CacheEntry {
  plainLyrics: string
  syncedLyrics: string | null
  source: string
  /** duração (s) da gravação em que a letra foi sincronizada */
  duration?: number
}

/**
 * A letra sincronizada foi feita numa gravação do mesmo tamanho deste playback?
 * Outra versão (ao vivo, outro andamento) faz a letra correr na frente: aí mostra só o texto, com rolagem calma.
 */
export function syncFits(lyricSeconds: number | undefined, trackSeconds: number | undefined): boolean {
  if (!lyricSeconds || !trackSeconds) return true
  return Math.abs(lyricSeconds - trackSeconds) <= Math.max(6, trackSeconds * 0.035)
}

function syncedFor(synced: string | null | undefined, lyricSeconds: number | undefined, trackSeconds: number | undefined): LrcLine[] | null {
  if (!synced || !syncFits(lyricSeconds, trackSeconds)) return null
  const lines = parseLrc(synced)
  return lines.length ? lines : null
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

// ─── Escolha do músico ──────────────────────────────────────────────────────
// Quando a busca automática não acha, o músico procura e escolhe a letra certa numa lista. A escolha fica
// guardada por música (fora do cache de letras, que descarta as antigas) e vale nas próximas vezes.

const PICKS_KEY = 'palco-lyrics-picks'

function getPicks(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(PICKS_KEY) || '{}') } catch { return {} }
}

function setPick(trackId: string, id: number) {
  try { localStorage.setItem(PICKS_KEY, JSON.stringify({ ...getPicks(), [trackId]: id })) } catch {}
}

export interface LrclibHit { id: number; trackName: string; artistName: string; duration: number; synced: boolean }

/** Busca livre no LRCLIB para o músico escolher (ele confere o nome e o artista na lista) */
export async function searchLyricsCandidates(query: string): Promise<LrclibHit[]> {
  for (let k = 0; k < 3; k++) {
    try {
      const r = await fetch(`https://lrclib.net/api/search?${new URLSearchParams({ q: query })}`)
      if (r.ok) {
        const list: any[] = await r.json()
        return list
          .filter(d => !d.instrumental && (d.plainLyrics || d.syncedLyrics))
          .slice(0, 12)
          .map(d => ({ id: d.id, trackName: d.trackName, artistName: d.artistName, duration: Math.round(d.duration || 0), synced: !!d.syncedLyrics }))
      }
      if (r.status !== 503 && r.status !== 429) return []
    } catch { /* tenta de novo */ }
    await new Promise(res => setTimeout(res, 700 * (k + 1)))
  }
  throw new Error('busca indisponível')
}

export const VOICE_SOURCE = 'Transcrita da voz do playback'

/** Letra transcrita da faixa de voz do próprio playback: sempre desta música e no tempo dele */
async function voiceLyrics(url: string): Promise<CacheEntry | null> {
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const lrc = await r.text()
    const lines = parseLrc(lrc)
    if (!lines.length) return null
    return { plainLyrics: lines.map(l => l.text).join('\n'), syncedLyrics: lrc, source: VOICE_SOURCE }
  } catch { return null }
}

/** Letra pelo id do LRCLIB; o LRCLIB às vezes responde "sobrecarregado" (503/429): tenta de novo antes de desistir */
async function lrclibById(id: number): Promise<any | null> {
  for (let k = 0; k < 3; k++) {
    try {
      const r = await fetch(`https://lrclib.net/api/get/${id}`)
      if (r.ok) return await r.json()
      if (r.status !== 503 && r.status !== 429) return null
    } catch { /* rede instável: tenta de novo */ }
    await new Promise(res => setTimeout(res, 700 * (k + 1)))
  }
  return null
}

/** Guarda a letra no aparelho sem abrir a música (show sem internet). true = já está disponível */
export async function prefetchLyrics(artist: string, title: string, trackId: string, lrclibId?: number, trackSeconds?: number, voiceUrl?: string): Promise<boolean> {
  const own = useOwnLyrics.getState().items[trackId]
  if (own && (own.plain || own.lrc)) return true
  const key = cacheKeyFor(artist, cleanTitleForSearch(title))
  if (getCache()[key]) return true
  lrclibId = lrclibId ?? getPicks()[trackId]
  try {
    if (lrclibId) {
      const d = await lrclibById(lrclibId)
      if (d && (d.plainLyrics || d.syncedLyrics)) {
        setCache(key, { plainLyrics: d.plainLyrics || '', syncedLyrics: d.syncedLyrics || null, source: 'LRCLIB', duration: d.duration || undefined })
        return true
      }
    }
    if (voiceUrl) {
      const v = await voiceLyrics(voiceUrl)
      if (v) { setCache(key, v); return true }
    }
    const q = new URLSearchParams({ artist, title: cleanTitleForSearch(title) })
    if (trackSeconds) q.set('duration', String(Math.round(trackSeconds)))
    const res = await fetch(`/api/lyrics?${q}`)
    if (!res.ok) return res.status === 404
    const data = await res.json()
    setCache(key, { plainLyrics: data.plainLyrics || data.lyrics || '', syncedLyrics: data.syncedLyrics || null, source: data.source, duration: data.duration || undefined })
    return true
  } catch { return false }
}

export const useLyricsStore = create<LyricsState>((set, get) => ({
  plainLyrics: null,
  syncedLines: null,
  isLoading: false,
  error: null,
  trackId: null,
  source: null,

  fetchLyrics: async (artist: string, title: string, trackId: string, lrclibId?: number, trackSeconds?: number, voiceUrl?: string) => {
    // letra colada/sincronizada pelo músico tem prioridade
    const own = useOwnLyrics.getState().items[trackId]
    if (own && (own.plain || own.lrc)) {
      const synced = own.lrc ? parseLrc(own.lrc) : null
      set({ plainLyrics: own.plain || null, syncedLines: synced && synced.length ? synced : null, source: own.lrc ? 'Sua letra sincronizada' : 'Sua letra', trackId, isLoading: false, error: null })
      return
    }
    if (get().trackId === trackId && (get().plainLyrics || get().syncedLines)) return
    lrclibId = lrclibId ?? getPicks()[trackId]

    const cleanedTitle = cleanTitleForSearch(title)
    const key = cacheKeyFor(artist, cleanedTitle)
    const cached = getCache()[key]
    if (cached) {
      set({
        plainLyrics: cached.plainLyrics || null,
        syncedLines: syncedFor(cached.syncedLyrics, cached.duration, trackSeconds),
        source: cached.source,
        trackId,
        isLoading: false,
        error: null,
      })
      return
    }

    set({ isLoading: true, error: null, trackId, plainLyrics: null, syncedLines: null, source: null })

    // Letra exata pelo id do LRCLIB (identificada no catálogo): mais rápida e sempre a música certa
    if (lrclibId) {
      try {
        const d = await lrclibById(lrclibId)
        if (d && (d.plainLyrics || d.syncedLyrics)) {
          setCache(key, { plainLyrics: d.plainLyrics || '', syncedLyrics: d.syncedLyrics || null, source: 'LRCLIB', duration: d.duration || undefined })
          if (get().trackId !== trackId) return
          set({ plainLyrics: d.plainLyrics || null, syncedLines: syncedFor(d.syncedLyrics, d.duration, trackSeconds), source: 'LRCLIB', isLoading: false })
          return
        }
      } catch { /* cai na busca normal */ }
      if (get().trackId !== trackId) return
    }

    if (voiceUrl) {
      const v = await voiceLyrics(voiceUrl)
      if (get().trackId !== trackId) return
      if (v) {
        setCache(key, v)
        set({ plainLyrics: v.plainLyrics, syncedLines: parseLrc(v.syncedLyrics!), source: v.source, isLoading: false })
        return
      }
    }

    try {
      const params = new URLSearchParams({ artist, title: cleanedTitle })
      if (trackSeconds) params.set('duration', String(Math.round(trackSeconds)))
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
        duration: data.duration || undefined,
      })

      if (get().trackId !== trackId) return

      set({
        plainLyrics: plain || null,
        syncedLines: syncedFor(synced, data.duration, trackSeconds),
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

  reload: (artist: string, title: string, trackId: string, lrclibId?: number, trackSeconds?: number, voiceUrl?: string) => { set({ trackId: null, plainLyrics: null, syncedLines: null }); void get().fetchLyrics(artist, title, trackId, lrclibId, trackSeconds, voiceUrl) },
  pickLyrics: async (lrclibId, artist, title, trackId, trackSeconds) => {
    set({ isLoading: true, error: null, trackId, plainLyrics: null, syncedLines: null, source: null })
    const d = await lrclibById(lrclibId)
    if (get().trackId !== trackId) return
    if (!d || !(d.plainLyrics || d.syncedLyrics)) { set({ isLoading: false, error: 'not_found' }); return }
    setPick(trackId, lrclibId)
    setCache(cacheKeyFor(artist, cleanTitleForSearch(title)), { plainLyrics: d.plainLyrics || '', syncedLyrics: d.syncedLyrics || null, source: 'LRCLIB', duration: d.duration || undefined })
    set({ plainLyrics: d.plainLyrics || null, syncedLines: syncedFor(d.syncedLyrics, d.duration, trackSeconds), source: 'LRCLIB', isLoading: false })
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

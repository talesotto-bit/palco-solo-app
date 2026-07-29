import type { VercelRequest, VercelResponse } from '@vercel/node'

const VAGALUME_KEY = process.env.VAGALUME_API_KEY || ''

interface LyricsResult {
  plainLyrics: string
  syncedLyrics: string | null
  source: string
}

function cleanTitle(raw: string): string {
  let t = raw.trim()
  t = t.replace(/\s*[-–]?\s*vers[aã]o\s+\w+(\s+\w+)?$/i, '')
  t = t.replace(/\s*[-–]?\s*(dvd\s+\w+(\s+\w+)*|ao\s+vivo(\s+\w+)*|eletr[io]co|original|pagod[aã]o|cabar[eé]\s*\d*)$/i, '')
  t = t.replace(/\s+a\s+lenda\s+ws\s+safad[aã]o$/i, '')
  t = t.replace(/\s+\d{1,2}$/, '')
  t = t.replace(/\s+embaixador\s+\w+(\s+\w+)*$/i, '')
  t = t.replace(/\s*\(.*?\)\s*/g, ' ')
  t = t.replace(/\s*\[.*?\]\s*/g, ' ')
  return t.replace(/\s+/g, ' ').trim() || raw.trim()
}

function removeAccents(str: string): string {
  const map: Record<string, string> = {
    'á':'a','à':'a','ã':'a','â':'a','ä':'a',
    'é':'e','è':'e','ê':'e','ë':'e',
    'í':'i','ì':'i','î':'i','ï':'i',
    'ó':'o','ò':'o','õ':'o','ô':'o','ö':'o',
    'ú':'u','ù':'u','û':'u','ü':'u',
    'ç':'c','ñ':'n',
  }
  return str.replace(/[áàãâäéèêëíìîïóòõôöúùûüçñ]/gi, (c) => map[c.toLowerCase()] || c)
}

function toSlug(text: string): string {
  return removeAccents(text.toLowerCase())
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function buildQueries(artist: string, title: string): { artist: string; title: string }[] {
  const queries: { artist: string; title: string }[] = []
  const cleanedTitle = cleanTitle(title)
  if (artist) queries.push({ artist, title })
  if (artist && cleanedTitle !== title) queries.push({ artist, title: cleanedTitle })
  queries.push({ artist: '', title: cleanedTitle })
  return queries
}

// ─── LRCLIB (synced lyrics) ──────────────────────────────────────────────────

async function searchLrclib(artist: string, title: string): Promise<LyricsResult | null> {
  try {
    const params: Record<string, string> = { track_name: title }
    if (artist) params.artist_name = artist
    const qs = new URLSearchParams(params)

    const res = await fetch(`https://lrclib.net/api/get?${qs}`, {
      headers: { 'User-Agent': 'PowerTom/1.0 (https://powertom.com.br)' },
      signal: AbortSignal.timeout(6000),
    })
    if (res.ok) {
      const data = await res.json()
      if (data.plainLyrics || data.syncedLyrics) {
        return {
          plainLyrics: data.plainLyrics || '',
          syncedLyrics: data.syncedLyrics || null,
          source: 'LRCLIB',
        }
      }
    }

    const q = artist ? `${artist} ${title}` : title
    const searchRes = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`, {
      headers: { 'User-Agent': 'PowerTom/1.0 (https://powertom.com.br)' },
      signal: AbortSignal.timeout(6000),
    })
    if (!searchRes.ok) return null
    const results = await searchRes.json()
    if (!results.length) return null
    const best = results[0]
    if (!best.plainLyrics && !best.syncedLyrics) return null
    return {
      plainLyrics: best.plainLyrics || '',
      syncedLyrics: best.syncedLyrics || null,
      source: 'LRCLIB',
    }
  } catch {
    return null
  }
}

async function fetchFromLrclib(artist: string, title: string): Promise<LyricsResult | null> {
  const queries = buildQueries(artist, title)
  for (const q of queries) {
    const result = await searchLrclib(q.artist, q.title)
    if (result) return result
  }
  return null
}

// ─── Vagalume (web — no API key needed) ──────────────────────────────────────

function decodeHtmlEntities(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

async function vagalumeDirect(artist: string, title: string): Promise<LyricsResult | null> {
  if (!artist) return null
  try {
    const artistSlug = toSlug(artist)
    const titleSlug = toSlug(title)
    if (!artistSlug || !titleSlug) return null

    const url = `https://www.vagalume.com.br/${artistSlug}/${titleSlug}.html`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) return null
    const html = await res.text()

    const lyricsMatch = html.match(/<div[^>]*id=["']lyrics["'][^>]*>([\s\S]*?)<\/div>/i)
    if (!lyricsMatch) return null

    const lyrics = decodeHtmlEntities(lyricsMatch[1]).trim()
    if (!lyrics || lyrics.length < 20) return null

    return { plainLyrics: lyrics, syncedLyrics: null, source: 'Vagalume' }
  } catch {
    return null
  }
}

async function vagalumeSearch(artist: string, title: string): Promise<LyricsResult | null> {
  try {
    const q = artist ? `${artist} ${title}` : title
    const searchUrl = `https://www.vagalume.com.br/busca.php?q=${encodeURIComponent(q)}`
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) return null
    const html = await res.text()

    const songLinkMatch = html.match(/href="(\/[a-z0-9-]+\/[a-z0-9-]+\.html)"/i)
    if (!songLinkMatch) return null

    const songUrl = `https://www.vagalume.com.br${songLinkMatch[1]}`
    const songRes = await fetch(songUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    })

    if (!songRes.ok) return null
    const songHtml = await songRes.text()

    const lyricsMatch = songHtml.match(/<div[^>]*id=["']lyrics["'][^>]*>([\s\S]*?)<\/div>/i)
    if (!lyricsMatch) return null

    const lyrics = decodeHtmlEntities(lyricsMatch[1]).trim()
    if (!lyrics || lyrics.length < 20) return null

    return { plainLyrics: lyrics, syncedLyrics: null, source: 'Vagalume' }
  } catch {
    return null
  }
}

async function fetchFromVagalumeWeb(artist: string, title: string): Promise<LyricsResult | null> {
  const cleanedTitle = cleanTitle(title)
  const result = await vagalumeDirect(artist, cleanedTitle)
  if (result) return result
  if (cleanedTitle !== title) {
    const r2 = await vagalumeDirect(artist, title)
    if (r2) return r2
  }
  return vagalumeSearch(artist, cleanedTitle)
}

// ─── Vagalume API (if key is set) ────────────────────────────────────────────

async function searchVagalumeApi(artist: string, title: string): Promise<LyricsResult | null> {
  if (!VAGALUME_KEY || !artist) return null
  try {
    const url = new URL('https://api.vagalume.com.br/search.php')
    url.searchParams.set('art', artist)
    url.searchParams.set('mus', title)
    url.searchParams.set('apikey', VAGALUME_KEY)
    const res = await fetch(url.toString(), {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (data.type === 'notfound' || data.type === 'song_notfound' || !data.mus?.length) return null
    const text = data.mus[0].text
    if (!text?.trim()) return null
    return { plainLyrics: text, syncedLyrics: null, source: 'Vagalume' }
  } catch {
    return null
  }
}

async function fetchFromVagalumeApi(artist: string, title: string): Promise<LyricsResult | null> {
  if (!VAGALUME_KEY) return null
  const queries = buildQueries(artist, title)
  for (const q of queries) {
    if (!q.artist) continue
    const result = await searchVagalumeApi(q.artist, q.title)
    if (result) return result
  }
  return null
}

// ─── Letras.mus.br (web — no API key needed) ────────────────────────────────

async function letrasDirect(artist: string, title: string): Promise<LyricsResult | null> {
  if (!artist) return null
  try {
    const artistSlug = toSlug(artist)
    const titleSlug = toSlug(title)
    if (!artistSlug || !titleSlug) return null

    const url = `https://www.letras.mus.br/${artistSlug}/${titleSlug}/`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) return null
    const html = await res.text()

    const lyricsMatch = html.match(/<div[^>]*class="[^"]*lyric-original[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
      || html.match(/<div[^>]*class="[^"]*cnt-letra[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
    if (!lyricsMatch) return null

    const lyrics = decodeHtmlEntities(lyricsMatch[1]).trim()
    if (!lyrics || lyrics.length < 20) return null

    return { plainLyrics: lyrics, syncedLyrics: null, source: 'Letras' }
  } catch {
    return null
  }
}

async function fetchFromLetras(artist: string, title: string): Promise<LyricsResult | null> {
  const cleanedTitle = cleanTitle(title)
  const result = await letrasDirect(artist, cleanedTitle)
  if (result) return result
  if (cleanedTitle !== title) {
    return letrasDirect(artist, title)
  }
  return null
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { artist, title } = req.query
  if (!title || typeof title !== 'string') {
    return res.status(400).json({ error: 'Missing title' })
  }

  const a = (typeof artist === 'string' ? artist : '').trim()
  const t = title.trim()

  // Run LRCLIB (synced lyrics) in parallel with Brazilian sources
  const [lrcResult, vagWebResult, letrasResult] = await Promise.allSettled([
    fetchFromLrclib(a, t),
    fetchFromVagalumeWeb(a, t),
    fetchFromLetras(a, t),
  ])

  const lrc = lrcResult.status === 'fulfilled' ? lrcResult.value : null
  const vagWeb = vagWebResult.status === 'fulfilled' ? vagWebResult.value : null
  const letras = letrasResult.status === 'fulfilled' ? letrasResult.value : null

  // Prefer synced lyrics from LRCLIB
  if (lrc?.syncedLyrics) {
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800')
    return res.status(200).json({
      plainLyrics: lrc.plainLyrics,
      syncedLyrics: lrc.syncedLyrics,
      artist: a, title: t, source: lrc.source,
    })
  }

  // Prefer Brazilian sources for plain lyrics
  const plainResult = vagWeb || letras || lrc

  // Try Vagalume API as last resort if nothing found
  if (!plainResult && VAGALUME_KEY) {
    const vagApi = await fetchFromVagalumeApi(a, t)
    if (vagApi) {
      res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800')
      return res.status(200).json({
        plainLyrics: vagApi.plainLyrics,
        syncedLyrics: null,
        artist: a, title: t, source: vagApi.source,
      })
    }
  }

  if (!plainResult) {
    return res.status(404).json({ error: 'Lyrics not found' })
  }

  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800')
  return res.status(200).json({
    plainLyrics: plainResult.plainLyrics,
    syncedLyrics: plainResult.syncedLyrics,
    artist: a, title: t, source: plainResult.source,
  })
}

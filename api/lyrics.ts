import type { VercelRequest, VercelResponse } from '@vercel/node'

const VAGALUME_KEY = process.env.VAGALUME_API_KEY || ''

interface LyricsResult {
  plainLyrics: string
  syncedLyrics: string | null
  source: string
}

// Strip catalog-specific suffixes that prevent lyrics matching
function cleanTitle(raw: string): string {
  let t = raw.trim()
  // Remove "Versao Forro", "Versao Arrocha", "Versao Piseiro", etc.
  t = t.replace(/\s*[-–]?\s*vers[aã]o\s+\w+(\s+\w+)?$/i, '')
  // Remove "Dvd ...", "Ao Vivo ...", "Eletrico", "Original", "Pagodao"
  t = t.replace(/\s*[-–]?\s*(dvd\s+\w+(\s+\w+)*|ao\s+vivo(\s+\w+)*|eletr[io]co|original|pagod[aã]o|cabar[eé]\s*\d*)$/i, '')
  // Remove "A Lenda Ws Safadao" or similar artist cross-references baked into title
  t = t.replace(/\s+a\s+lenda\s+ws\s+safad[aã]o$/i, '')
  // Remove trailing numbers/codes like "02", "01"
  t = t.replace(/\s+\d{1,2}$/, '')
  // Remove "Embaixador Gl Grecia" and similar promotional suffixes
  t = t.replace(/\s+embaixador\s+\w+(\s+\w+)*$/i, '')
  return t.trim() || raw.trim()
}

// Try multiple query variants to maximize match chance
function buildQueries(artist: string, title: string): { artist: string; title: string }[] {
  const queries: { artist: string; title: string }[] = []
  const cleanedTitle = cleanTitle(title)

  // 1. Original as-is
  if (artist) queries.push({ artist, title })
  // 2. With cleaned title
  if (artist && cleanedTitle !== title) queries.push({ artist, title: cleanedTitle })
  // 3. Title-only search (empty artist) — useful when artist wasn't detected
  if (!artist) queries.push({ artist: '', title: cleanedTitle })

  return queries
}

async function searchLrclib(artist: string, title: string): Promise<LyricsResult | null> {
  try {
    const params: Record<string, string> = { track_name: title }
    if (artist) params.artist_name = artist
    const qs = new URLSearchParams(params)

    // Try exact match first
    const res = await fetch(`https://lrclib.net/api/get?${qs}`, {
      headers: { 'User-Agent': 'PalcoSolo/1.0' },
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

    // Fallback to fuzzy search
    const q = artist ? `${artist} ${title}` : title
    const searchRes = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`, {
      headers: { 'User-Agent': 'PalcoSolo/1.0' },
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

async function searchVagalume(artist: string, title: string): Promise<LyricsResult | null> {
  if (!VAGALUME_KEY) return null
  if (!artist) return null
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

async function fetchFromVagalume(artist: string, title: string): Promise<LyricsResult | null> {
  const queries = buildQueries(artist, title)
  for (const q of queries) {
    if (!q.artist) continue
    const result = await searchVagalume(q.artist, q.title)
    if (result) return result
  }
  return null
}

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

  const result = await fetchFromLrclib(a, t) || await fetchFromVagalume(a, t)

  if (!result) {
    return res.status(404).json({ error: 'Lyrics not found' })
  }

  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800')
  return res.status(200).json({
    plainLyrics: result.plainLyrics,
    syncedLyrics: result.syncedLyrics,
    artist: a,
    title: t,
    source: result.source,
  })
}

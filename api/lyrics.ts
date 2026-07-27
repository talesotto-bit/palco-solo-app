import type { VercelRequest, VercelResponse } from '@vercel/node'

const VAGALUME_KEY = process.env.VAGALUME_API_KEY || ''

async function fetchFromLrclib(artist: string, title: string): Promise<{ lyrics: string; source: string } | null> {
  try {
    const params = new URLSearchParams({ artist_name: artist, track_name: title })
    const res = await fetch(`https://lrclib.net/api/get?${params}`, {
      headers: { 'User-Agent': 'PalcoSolo/1.0' },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) {
      const searchRes = await fetch(`https://lrclib.net/api/search?${params}`, {
        headers: { 'User-Agent': 'PalcoSolo/1.0' },
        signal: AbortSignal.timeout(6000),
      })
      if (!searchRes.ok) return null
      const results = await searchRes.json()
      if (!results.length) return null
      const best = results[0]
      const text = best.plainLyrics || best.syncedLyrics
      return text ? { lyrics: text, source: 'LRCLIB' } : null
    }
    const data = await res.json()
    const text = data.plainLyrics || data.syncedLyrics
    return text ? { lyrics: text, source: 'LRCLIB' } : null
  } catch {
    return null
  }
}

async function fetchFromVagalume(artist: string, title: string): Promise<{ lyrics: string; source: string } | null> {
  if (!VAGALUME_KEY) return null
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
    return text?.trim() ? { lyrics: text, source: 'Vagalume' } : null
  } catch {
    return null
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { artist, title } = req.query
  if (!artist || !title || typeof artist !== 'string' || typeof title !== 'string') {
    return res.status(400).json({ error: 'Missing artist or title' })
  }

  const a = artist.trim()
  const t = title.trim()

  const result = await fetchFromLrclib(a, t) || await fetchFromVagalume(a, t)

  if (!result) {
    return res.status(404).json({ error: 'Lyrics not found' })
  }

  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800')
  return res.status(200).json({
    lyrics: result.lyrics,
    artist: a,
    title: t,
    source: result.source,
  })
}

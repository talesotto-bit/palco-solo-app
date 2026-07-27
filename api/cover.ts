import type { VercelRequest, VercelResponse } from '@vercel/node'

async function searchItunes(artist: string, title: string): Promise<string | null> {
  try {
    const q = `${artist} ${title}`.slice(0, 120)
    const params = new URLSearchParams({ term: q, media: 'music', entity: 'song', limit: '3' })
    const res = await fetch(`https://itunes.apple.com/search?${params}`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!data.results?.length) return null
    const art = data.results[0].artworkUrl100
    if (!art) return null
    return art.replace('100x100bb', '600x600bb')
  } catch {
    return null
  }
}

async function searchDeezer(artist: string, title: string): Promise<string | null> {
  try {
    const q = `${artist} ${title}`.slice(0, 120)
    const params = new URLSearchParams({ q, limit: '3' })
    const res = await fetch(`https://api.deezer.com/search?${params}`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!data.data?.length) return null
    return data.data[0].album?.cover_big || data.data[0].album?.cover || null
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

  const url = await searchItunes(a, t) || await searchDeezer(a, t)

  if (!url) {
    return res.status(404).json({ error: 'Cover not found' })
  }

  res.setHeader('Cache-Control', 'public, s-maxage=604800, stale-while-revalidate=2592000')
  return res.status(200).json({ url })
}

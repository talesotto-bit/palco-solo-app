import type { VercelRequest, VercelResponse } from '@vercel/node'

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

function cleanTitle(raw: string): string {
  let t = raw.trim()
  t = t.replace(/\s*[-–]?\s*vers[aã]o\s+\w+(\s+\w+)?$/i, '')
  t = t.replace(/\s*[-–]?\s*(dvd\s+\w+(\s+\w+)*|ao\s+vivo(\s+\w+)*|eletr[io]co|original|pagod[aã]o|cabar[eé]\s*\d*)$/i, '')
  t = t.replace(/\s*\(.*?\)\s*/g, ' ')
  t = t.replace(/\s*\[.*?\]\s*/g, ' ')
  return t.replace(/\s+/g, ' ').trim() || raw.trim()
}

function decodeHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

interface CifraResult {
  title: string
  artist: string
  content: string
  tuning?: string
  capo?: string
  source: string
}

// ─── CifraClub ──────────────────────────────────────────────────────────────

async function cifraClubDirect(artist: string, title: string): Promise<CifraResult | null> {
  if (!artist) return null
  try {
    const artistSlug = toSlug(artist)
    const titleSlug = toSlug(title)
    if (!artistSlug || !titleSlug) return null

    const url = `https://www.cifraclub.com.br/${artistSlug}/${titleSlug}/`
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
    return parseCifraClubHtml(html, artist, title)
  } catch {
    return null
  }
}

async function cifraClubSearch(artist: string, title: string): Promise<CifraResult | null> {
  try {
    const q = artist ? `${artist} ${title}` : title
    const searchUrl = `https://www.cifraclub.com.br/?q=${encodeURIComponent(q)}`
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

    const linkMatch = html.match(/href="(\/[a-z0-9-]+\/[a-z0-9-]+\/?)"/i)
    if (!linkMatch) return null

    const songUrl = `https://www.cifraclub.com.br${linkMatch[1]}`
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
    return parseCifraClubHtml(await songRes.text(), artist, title)
  } catch {
    return null
  }
}

function parseCifraClubHtml(html: string, fallbackArtist: string, fallbackTitle: string): CifraResult | null {
  // Extract pre content (chord notation)
  const preMatch = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i)
  if (!preMatch) return null

  let content = preMatch[1]
  // Keep <b> tags as chord markers, remove other HTML
  content = content.replace(/<b>([^<]*)<\/b>/g, '⟨$1⟩')
  content = content.replace(/<[^>]+>/g, '')
  content = decodeHtml(content)

  if (content.trim().length < 20) return null

  // Extract title
  const titleMatch = html.match(/<h1[^>]*class="[^"]*t1[^"]*"[^>]*>([\s\S]*?)<\/h1>/i)
    || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  const artistMatch = html.match(/<h2[^>]*class="[^"]*t3[^"]*"[^>]*>([\s\S]*?)<\/h2>/i)
    || html.match(/<a[^>]*class="[^"]*art[^"]*"[^>]*>([\s\S]*?)<\/a>/i)

  const parsedTitle = titleMatch ? decodeHtml(titleMatch[1].replace(/<[^>]+>/g, '')).trim() : fallbackTitle
  const parsedArtist = artistMatch ? decodeHtml(artistMatch[1].replace(/<[^>]+>/g, '')).trim() : fallbackArtist

  // Extract tuning/capo info
  const tuningMatch = html.match(/Afinação[:\s]*([\w\s#]+)/i)
  const capoMatch = html.match(/Capotraste[:\s]*(\d+)/i) || html.match(/Tom[:\s]*([A-G][#b]?m?)/i)

  return {
    title: parsedTitle,
    artist: parsedArtist,
    content: content.trim(),
    tuning: tuningMatch ? tuningMatch[1].trim() : undefined,
    capo: capoMatch ? capoMatch[1].trim() : undefined,
    source: 'CifraClub',
  }
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
  const cleanedT = cleanTitle(t)

  // Try direct URL first, then search
  let result = await cifraClubDirect(a, cleanedT)
  if (!result && cleanedT !== t) {
    result = await cifraClubDirect(a, t)
  }
  if (!result) {
    result = await cifraClubSearch(a, cleanedT)
  }

  if (!result) {
    return res.status(404).json({ error: 'Cifra not found' })
  }

  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800')
  return res.status(200).json(result)
}

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
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name] ?? m)
}

const NAMED_ENTITIES: Record<string, string> = {
  aacute: 'á', agrave: 'à', atilde: 'ã', acirc: 'â', eacute: 'é', ecirc: 'ê', iacute: 'í',
  oacute: 'ó', otilde: 'õ', ocirc: 'ô', uacute: 'ú', uuml: 'ü', ccedil: 'ç', ntilde: 'ñ',
  Aacute: 'Á', Agrave: 'À', Atilde: 'Ã', Acirc: 'Â', Eacute: 'É', Ecirc: 'Ê', Iacute: 'Í',
  Oacute: 'Ó', Otilde: 'Õ', Ocirc: 'Ô', Uacute: 'Ú', Ccedil: 'Ç', Ntilde: 'Ñ',
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

    trace.push(`cc-direto ${res.status}`)
    if (!res.ok) return null
    const html = await res.text()
    return parseCifraClubHtml(html, artist, title)
  } catch {
    return null
  }
}

async function cifraClubSearch(artist: string, title: string): Promise<CifraResult | null> {
  // sem artista o primeiro resultado pode ser outra música com o mesmo nome
  if (!artist) return null
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

    // o primeiro link da busca pode ser outra música: só o endereço com o artista e o título desta
    const links = [...html.matchAll(/href="\/([a-z0-9-]+)\/([a-z0-9-]+)\/?"/gi)]
    const link = links.find(m => nameSim(m[1].replace(/-/g, ' '), artist) >= 0.6 && nameSim(m[2].replace(/-/g, ' '), title) >= 0.8)
    if (!link) return null

    const songUrl = `https://www.cifraclub.com.br/${link[1]}/${link[2]}/`
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
  // Keep <b> tags as chord markers (hoje vêm com atributos data-chord-*), remove other HTML
  content = content.replace(/<b\b[^>]*>([^<]*)<\/b>/g, '⟨$1⟩')
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
  const tuningMatch = html.match(/>\s*Afinação\s*(?:<!--\s*-->)?\s*:\s*(?:<\/span>\s*)?<[^>]+>\s*([^<]{1,30})</i)
  // Tom: botão "--chord-tone" (layout atual, ex.: "Ebm (com forma de Em)") ou "Tom: <x>X" (layout antigo); senão, capotraste
  const capoMatch = html.match(/data-anchor="--chord-tone"[^>]*>\s*([A-G][#b]?[^<]{0,6}(?:<!--\s*-->[^<]{0,30})?)</)
    || html.match(/>\s*Tom\s*(?:<!--\s*-->)?\s*:\s*(?:<[^>]+>\s*)+([A-G][#b]?m?)\s*</)
    || html.match(/Capotraste\s+na\s+(\d+)/i)

  return {
    title: parsedTitle,
    artist: parsedArtist,
    content: content.trim(),
    tuning: tuningMatch ? tuningMatch[1].trim() : undefined,
    capo: capoMatch ? capoMatch[1].replace(/<!--\s*-->/g, '').replace(/\s+/g, ' ').replace('com forma de', 'forma de').trim() : undefined,
    source: 'CifraClub',
  }
}

// ─── Ultimate Guitar (fallback quando o Cifra Club bloqueia) ────────────────

const UG_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  'Accept': 'text/html',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
}

function norm(text: string): string {
  return removeAccents(text.toLowerCase()).replace(/&/g, ' e ').replace(/[^a-z0-9]+/g, ' ').trim()
}

/** Lê o JSON que o Ultimate Guitar embute na página (div.js-store) */
function ugStore(html: string): any | null {
  const m = html.match(/class="js-store"\s+data-content="([^"]+)"/)
  if (!m) return null
  // Decodifica o atributo numa passada só, para não desfazer escapes do JSON
  const basic: Record<string, string> = { quot: '"', amp: '&', lt: '<', gt: '>', apos: "'" }
  const json = m[1].replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (all, e: string) =>
    e[0] === '#'
      ? String.fromCharCode(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
      : basic[e] ?? all)
  try { return JSON.parse(json) } catch { return null }
}

/** Passos da última busca (só aparece com ?debug=1) */
const trace: string[] = []

async function ultimateGuitar(artist: string, title: string): Promise<CifraResult | null> {
  // "título + artista" às vezes não traz nada; só o título costuma achar
  const queries = [...new Set([`${title} ${artist}`.trim(), title.trim()])].filter(Boolean)
  for (const q of queries) {
    const r = await ultimateGuitarQuery(artist, title, q.slice(0, 100))
    if (r) return r
  }
  return null
}

async function ultimateGuitarQuery(artist: string, title: string, q: string): Promise<CifraResult | null> {
  try {
    const searchRes = await fetch(
      `https://www.ultimate-guitar.com/search.php?search_type=title&value=${encodeURIComponent(q)}`,
      { headers: UG_HEADERS, signal: AbortSignal.timeout(7000) },
    )
    trace.push(`ug-busca ${searchRes.status}`)
    if (!searchRes.ok) return null
    const results: any[] = ugStore(await searchRes.text())?.store?.page?.data?.results ?? []
    trace.push(`ug-resultados ${results.length}`)

    const nt = norm(title)
    const na = norm(artist)
    const scored = results
      .filter(r => r?.type === 'Chords' && r.tab_url && r.song_name)
      .map(r => {
        // nomes vêm com acento codificado ("Arranh&atilde;o"): decodifica antes de comparar
        const song = norm(decodeHtml(r.song_name))
        const art = norm(decodeHtml(r.artist_name || ''))
        const songScore = song === nt ? 6 : song.includes(nt) || nt.includes(song) ? 3 : 0
        if (songScore === 0) return { r, score: 0 } // nunca aceita outra música do mesmo artista
        let score = songScore
        if (na) {
          const as = art === na ? 4 : art.includes(na) || na.includes(art) ? 2 : 0
          if (as === 0) return { r, score: 0 } // mesmo título de outro artista: é outra música
          score += as
        }
        else if (nt.includes(art)) score += 2 // catálogo às vezes junta título e artista
        score += Math.min(2, (r.votes || 0) / 20) + (r.rating || 0) / 5
        return { r, score }
      })
      .filter(x => x.score >= 3)
      .sort((a, b) => b.score - a.score)
    if (!scored.length) return null

    // tenta as 3 melhores versões: uma página pode vir sem a cifra
    for (const { r: best } of scored.slice(0, 3)) {
      const tabRes = await fetch(best.tab_url, { headers: UG_HEADERS, signal: AbortSignal.timeout(7000) })
      trace.push(`ug-cifra ${tabRes.status}`)
      if (!tabRes.ok) continue
      const data = ugStore(await tabRes.text())?.store?.page?.data
      const raw: string | undefined = data?.tab_view?.wiki_tab?.content
      if (!raw) continue

      // o UG manda acentos como &ecirc;: decodifica para não aparecer "voc&ecirc;" na cifra
      const content = decodeHtml(raw
        .replace(/\[ch\]([^[]*)\[\/ch\]/g, '⟨$1⟩')
        .replace(/\[\/?tab\]/g, '')
        .replace(/\r\n/g, '\n'))
        .trim()
      if (content.length < 20) continue

      const capo = data?.tab_view?.meta?.capo
      const tonality = data?.tab?.tonality_name
      return {
        title: decodeHtml(best.song_name),
        artist: best.artist_name ? decodeHtml(best.artist_name) : artist,
        content,
        capo: tonality ? String(tonality) : capo ? String(capo) : undefined,
        source: 'Ultimate Guitar',
      }
    }
    return null
  } catch (e: any) {
    trace.push(`ug-erro ${e?.name || e}`)
    return null
  }
}


// ─── Conferência: a cifra encontrada é mesmo desta música? ───────────────────

function nameKey(s: string): string {
  return norm(decodeHtml(s || '')).replace(/\b(ao vivo|live|versao \w+|versao|part|feat|ft|participacao|acustico)\b/g, ' ').replace(/\s+/g, ' ').trim()
}

function nameSim(a: string, b: string): number {
  const x = nameKey(a), y = nameKey(b)
  if (!x || !y) return 0
  if (x === y) return 1
  const ta = new Set(x.split(' ')), tb = new Set(y.split(' '))
  let inter = 0
  ta.forEach(w => { if (tb.has(w)) inter++ })
  return Math.max(inter / (ta.size + tb.size - inter), x.includes(y) || y.includes(x) ? 0.9 : 0, (inter / Math.min(ta.size, tb.size)) * 0.95)
}

/** título bate e, quando o artista é conhecido, o artista também */
function sameSong(r: CifraResult, title: string, artist: string): boolean {
  if (nameSim(r.title, title) < 0.8) return false
  return !artist || nameSim(r.artist, artist) >= 0.5
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

  trace.length = 0
  const debug = req.query.debug === '1'
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
    result = await ultimateGuitar(a, cleanedT)
  }

  if (result && !sameSong(result, cleanedT, a) && !sameSong(result, t, a)) {
    trace.push(`descartada: ${result.title} / ${result.artist}`)
    result = null
  }

  if (debug) return res.status(result ? 200 : 404).json({ found: !!result, source: result?.source, trace })
  if (!result) {
    return res.status(404).json({ error: 'Cifra not found' })
  }

  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800')
  return res.status(200).json(result)
}

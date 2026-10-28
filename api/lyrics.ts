import type { VercelRequest, VercelResponse } from '@vercel/node'

const VAGALUME_KEY = process.env.VAGALUME_API_KEY || ''

interface LyricsResult {
  plainLyrics: string
  syncedLyrics: string | null
  source: string
  /** duração (s) da gravação em que a letra sincronizada foi feita: o app compara com o playback */
  duration?: number
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

/** A letra sincronizada foi feita numa gravação de duração parecida? (outra versão = tempos errados no playback) */
function durationFits(lrc: number | undefined, target: number | undefined): boolean {
  if (!lrc || !target) return true
  return Math.abs(lrc - target) <= Math.max(6, target * 0.035)
}


// ─── Conferência: a letra encontrada é mesmo desta música? ───────────────────

function normName(s: string): string {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/\b(ao vivo|live|versao \w+|versao|part\.?|feat\.?|ft\.?|participacao|remix|acustico)\b/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** semelhança entre dois nomes (0 a 1): palavras em comum e grafia */
function nameSim(a: string, b: string): number {
  const x = normName(a), y = normName(b)
  if (!x || !y) return 0
  if (x === y) return 1
  const ta = new Set(x.split(' ')), tb = new Set(y.split(' '))
  let inter = 0
  ta.forEach(w => { if (tb.has(w)) inter++ })
  const jac = inter / (ta.size + tb.size - inter)
  const cover = inter / Math.min(ta.size, tb.size)
  return Math.max(jac, x.includes(y) || y.includes(x) ? 0.9 : 0, cover * 0.95)
}

/** artistas: duplas com "e"/"&", participações, grafias diferentes */
function artistSim(a: string, b: string): number {
  return nameSim(a.replace(/&/g, ' e '), b.replace(/&/g, ' e '))
}

/** título e artista batem? (sem artista informado, só o título) */
function sameSong(foundTitle: string, foundArtist: string, title: string, artist: string): boolean {
  if (nameSim(foundTitle, title) < 0.8) return false
  return !artist || artistSim(foundArtist, artist) >= 0.5
}

async function lrclibGet(params: Record<string, string>): Promise<any | null> {
  try {
    const res = await fetch(`https://lrclib.net/api/get?${new URLSearchParams(params)}`, {
      headers: { 'User-Agent': 'PowerTom/1.0 (https://powertom.com.br)' },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.plainLyrics || data.syncedLyrics ? data : null
  } catch {
    return null
  }
}

const fromLrclib = (d: any, synced: boolean): LyricsResult => ({
  plainLyrics: d.plainLyrics || '',
  syncedLyrics: synced ? d.syncedLyrics || null : null,
  source: 'LRCLIB',
  duration: d.duration || undefined,
})

async function searchLrclib(artist: string, title: string, duration?: number): Promise<LyricsResult | null> {
  try {
    const params: Record<string, string> = { track_name: title }
    if (artist) params.artist_name = artist

    // 1) pedido simples (rápido, com cache no LRCLIB). Se a gravação tem a duração do playback, pronto.
    const got = await lrclibGet(params)
    const data = got && sameSong(got.trackName, got.artistName, title, artist) ? got : null
    // sem artista, só a gravação com a duração do playback (até 3 s) garante que é esta música
    const fits = artist ? durationFits(data?.duration, duration) : !!duration && Math.abs((data?.duration || 0) - duration) <= 3
    if (data && fits) return fromLrclib(data, true)
    // com artista: a mesma música em outra versão → tenta a versão certa, senão só o texto.
    // sem artista: o texto de outra gravação não é garantido; segue para a busca pela duração.
    if (data && artist && duration) {
      // 2) é outra versão: tenta a gravação desse tamanho (consulta pesada no LRCLIB, pode recusar quando ocupado)
      const exact = await lrclibGet({ ...params, duration: String(Math.round(duration)) })
      if (exact && durationFits(exact.duration, duration)) return fromLrclib(exact, true)
      // sem a versão certa: só o texto (tempos de outra gravação fariam a letra correr na frente)
      return fromLrclib(data, false)
    }

    const q = artist ? `${artist} ${title}` : title
    const searchRes = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`, {
      headers: { 'User-Agent': 'PowerTom/1.0 (https://powertom.com.br)' },
      signal: AbortSignal.timeout(6000),
    })
    if (!searchRes.ok) return null
    const results = await searchRes.json()
    // só resultados desta música (título e artista batem); sem artista, a gravação precisa ter a duração do playback
    const same = (results as any[]).filter(r => (r.plainLyrics || r.syncedLyrics) && !r.instrumental && sameSong(r.trackName, r.artistName, title, artist))
      .filter(r => artist || (duration && Math.abs((r.duration || 0) - duration) <= 3))
    if (!same.length) return null
    // várias versões da mesma música: fica com a de duração mais perto do playback
    const best = duration
      ? same.sort((x: any, y: any) => Math.abs((x.duration || 0) - duration) - Math.abs((y.duration || 0) - duration))[0]
      : same[0]
    return {
      plainLyrics: best.plainLyrics || '',
      // versão de outro tamanho: só o texto (tempos de outra gravação fariam a letra correr na frente)
      syncedLyrics: durationFits(best.duration, duration) ? best.syncedLyrics || null : null,
      source: 'LRCLIB',
      duration: best.duration || undefined,
    }
  } catch {
    return null
  }
}

async function fetchFromLrclib(artist: string, title: string, duration?: number): Promise<LyricsResult | null> {
  // com artista conhecido, nunca repete a busca só pelo título (traria a música de outro cantor)
  const queries = buildQueries(artist, title).filter(q => !artist || q.artist)
  for (const q of queries) {
    const result = await searchLrclib(q.artist, q.title, duration)
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
  // sem artista não dá para saber se o resultado é desta música
  if (!artist) return null
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

    // o primeiro link da busca pode ser outra música: só aceita o endereço com o artista e o título desta
    const links = [...html.matchAll(/href="\/([a-z0-9-]+)\/([a-z0-9-]+)\.html"/gi)]
    const link = links.find(m => artistSim(m[1].replace(/-/g, ' '), artist) >= 0.6 && nameSim(m[2].replace(/-/g, ' '), title) >= 0.8)
    if (!link) return null

    const songUrl = `https://www.vagalume.com.br/${link[1]}/${link[2]}.html`
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
    if (data.type !== 'exact' && !sameSong(data.mus[0].name || '', data.art?.name || '', title, artist)) return null
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
  const dur = Number(req.query.duration) || undefined
  if (!title || typeof title !== 'string') {
    return res.status(400).json({ error: 'Missing title' })
  }

  const a = (typeof artist === 'string' ? artist : '').trim()
  const t = title.trim()

  // Todas as fontes ao mesmo tempo: a resposta sai na velocidade da mais lenta, não da soma
  const [lrcResult, vagApiResult, vagWebResult, letrasResult] = await Promise.allSettled([
    fetchFromLrclib(a, t, dur),
    fetchFromVagalumeApi(a, t),
    fetchFromVagalumeWeb(a, t),
    fetchFromLetras(a, t),
  ])
  const ok = <T,>(r: PromiseSettledResult<T | null>) => (r.status === 'fulfilled' ? r.value : null)
  const lrc = ok(lrcResult), vagApi = ok(vagApiResult), vagWeb = ok(vagWebResult), letras = ok(letrasResult)

  // letra não muda: guarda 30 dias no cache da Vercel; "não achei" só 6 h (fontes novas entram logo)
  const FOUND = 'public, s-maxage=2592000, stale-while-revalidate=2592000'

  // letra sincronizada do LRCLIB primeiro
  if (lrc?.syncedLyrics) {
    res.setHeader('Cache-Control', FOUND)
    return res.status(200).json({
      plainLyrics: lrc.plainLyrics,
      syncedLyrics: lrc.syncedLyrics,
      artist: a, title: t, source: lrc.source, duration: lrc.duration,
    })
  }

  // texto corrido: fontes brasileiras primeiro (API oficial da Vagalume, depois as páginas)
  const plainResult = vagApi || vagWeb || letras || lrc
  if (!plainResult) {
    res.setHeader('Cache-Control', 'public, s-maxage=21600')
    return res.status(404).json({ error: 'Lyrics not found' })
  }

  res.setHeader('Cache-Control', FOUND)
  return res.status(200).json({
    plainLyrics: plainResult.plainLyrics,
    syncedLyrics: plainResult.syncedLyrics,
    artist: a, title: t, source: plainResult.source,
  })
}

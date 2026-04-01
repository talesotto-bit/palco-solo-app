import { create } from 'zustand'
import type { Track, Stem } from '@/types/track'
import { cleanSongName, parseFolderName, detectInstrument, stemLabel, toTitleCase } from '@/lib/stemDetection'
import { INSTRUMENT_LABELS } from '@/types/track'

interface CatalogSong {
  name: string
  slug: string
  genre: string
  genreSlug: string
  stems: {
    name: string
    slug: string
    key: string
    url: string
    format: string
    size: number
  }[]
  stemCount: number
}

interface CatalogState {
  tracks: Track[]
  genres: { id: string; label: string; count: number }[]
  isLoading: boolean
  error: string | null
  loadCatalog: () => Promise<void>
}

// ─── Genre labels ──────────────────────────────────────────────────────

function genreSlugToLabel(slug: string): string {
  const map: Record<string, string> = {
    'atualizacoes': 'Lançamentos',
    'forro': 'Forró',
    'pagode': 'Pagode',
    'sertanejo': 'Sertanejo',
    'gospel': 'Gospel',
    'rock-pop-mpb': 'Rock / Pop / MPB',
    'rock-nacional': 'Rock Nacional',
    'mpb': 'MPB',
    'rock-pop-inter': 'Rock / Pop Internacional',
    'brega': 'Brega',
    'axe-carnaval': 'Axé / Carnaval',
    'axe': 'Axé',
    'piseiro': 'Piseiro',
    'arrocha': 'Arrocha',
    'aberturas': 'Aberturas',
    'playbacks': 'Playbacks',
    'shows-multipistas': 'Shows Multipistas',
    'shows-playbacks': 'Shows Playbacks',
  }
  return map[slug] || toTitleCase(slug.replace(/-/g, ' '))
}

// ─── Sub-genre classification for "atualizacoes" ─────────────────────

const SERTANEJO_ARTISTS = new Set([
  'gusttavo lima','bruno e marrone','henrique e juliano','marilia mendonca',
  'jorge e mateus','ze felipe','ze neto e cristiano','maiara e maraisa',
  'luan santana','leonardo','simone e simaria','naiara azevedo','ana castela',
  'murilo huff','felipe araujo','matheus e kauan','hugo e guilherme',
  'israel e rodolffo','gustavo mioto','diego e victor hugo','zeze di camargo',
  'chitaozinho e xororo','eduardo costa','michel telo','lucas lucco',
  'fernando e sorocaba','marcos e belutti','joao bosco e vinicius',
  'cristiano araujo','george henrique e rodrigo','diego e arnaldo',
  'lauana prado','simone mendes','guilherme e benuto','luan pereira',
  'clayton e romario','israel e rodolfo','bruno e barreto',
  'rio negro e solimoes','zeze e luciano','joao bosco e gabriel',
  'felipe e rodrigo','leo e raphael','brenno e matheus',
  'antony e gabriel','victor meira',
])

const PISEIRO_ARTISTS = new Set([
  'baroes da pisadinha','joao gomes','nattan','vitor fernandes',
  'tarcisio do acordeon','biu do piseiro','alanzim coreano','japazin',
  'ze vaqueiro','mari fernandez','raquel dos teclados',
  'marcynho sensacao','aldair playboy','pedro sampaio',
])

const FORRO_ARTISTS = new Set([
  'wesley safadao','xand aviao','jonas esticado','saia rodada','cavaleiros do forro',
  'solange almeida','iguinho e lulinha','eric land','forro real',
  'avioes do forro','limao com mel','mastruz com leite','calcinha preta',
  'forro do muido','forro sacode','la furia','os baroes da pisadinha',
  'flavio jose','rai saia rodada','natanzinho lima','rogeirinho',
  'flavinho','felipe amorim',
  'henry freitas','rey vaqueiro','claudio ney e juliana','claudio ney',
  'matheus fernandes','lipe lucena','avine vinny','mano walter',
  'dj ivis','kadu martins','thiago aquino','junior vianna',
  'luan estilizado','luka bass','nuzio medeiros','tierry',
  'gabriel diniz','luiza sonza','michele andrade','priscila senna',
])

const ARROCHA_ARTISTS = new Set([
  'nadson','nadson ferinha','pablo','devinho novaes','soro silva',
  'silvanno salles','tayrone','pablo do arrocha',
])

const AXE_ARTISTS = new Set([
  'ivete sangalo','harmonia do samba','leo santana','chiclete com banana',
  'banda eva','bell marques','claudia leitte','parangole','olodum',
  'asa de aguia','psirico','daniela mercury',
])

const PAGODE_ARTISTS = new Set([
  'ferrugem','thiaguinho','sorriso maroto','turma do pagode','pericles',
  'grupo revelacao','raca negra','dilsinho','menos e mais','exaltasamba',
  'grupo chocolate',
])

function classifyAtualizacoes(name: string, artist: string): string {
  const lower = name.toLowerCase()
  const artistLower = artist.toLowerCase().trim()

  // Check explicit genre keywords in name
  if (lower.includes('piseiro') || lower.includes('pisadinha')) return 'piseiro'
  if (lower.includes('arrocha')) return 'arrocha'
  if (lower.includes('axe') || lower.includes('swingueira')) return 'axe'
  if (lower.includes('pagodao')) return 'pagode'

  // Check artist sets
  for (const a of PISEIRO_ARTISTS) if (artistLower.includes(a) || lower.includes(a)) return 'piseiro'
  for (const a of ARROCHA_ARTISTS) if (artistLower.includes(a) || lower.includes(a)) return 'arrocha'
  for (const a of AXE_ARTISTS) if (artistLower.includes(a) || lower.includes(a)) return 'axe'
  for (const a of PAGODE_ARTISTS) if (artistLower.includes(a) || lower.includes(a)) return 'pagode'
  for (const a of SERTANEJO_ARTISTS) if (artistLower.includes(a) || lower.includes(a)) return 'sertanejo'
  for (const a of FORRO_ARTISTS) if (artistLower.includes(a) || lower.includes(a)) return 'forro'

  // Keyword-based genre detection in song name
  if (/versao forro|forro\b|eletrico|vaqueiro|vaquejada|cabare/.test(lower)) return 'forro'
  if (/pagode\b/.test(lower)) return 'pagode'

  // Remaining unclassified tracks in atualizacoes are mostly sertanejo
  return 'sertanejo'
}

// ─── Sub-genre classification for rock-pop-mpb ────────────────────────

const MPB_ARTISTS = new Set([
  'djavan','gilberto gil','caetano veloso','chico buarque','tim maia','jorge ben',
  'jorge ben jor','maria bethânia','gal costa','milton nascimento','elis regina',
  'marisa monte','ivan lins','gonzaguinha','alceu valença','zé ramalho',
  'geraldo azevedo','elba ramalho','fagner','belchior','ney matogrosso',
  'maria gadú','ana carolina','nando reis','arnaldo antunes','tribalistas',
  'roberto carlos','erasmo carlos','vanessa da mata','seu jorge','lenine',
])

const ROCK_BR_ARTISTS = new Set([
  'legião urbana','legiao urbana','barão vermelho','barao vermelho','titãs','titas',
  'paralamas do sucesso','paralamas','skank','jota quest','capital inicial',
  'raul seixas','rita lee','cássia eller','cassia eller','charlie brown jr',
  'detonautas','pitty','nx zero','fresno','engenheiros do hawaii','ira!','ira',
  'ultraje a rigor','raimundos','mamonas assassinas','o rappa','natiruts',
  'cidade negra','kid abelha','blitz','lulu santos','lobão','cazuza',
])

const ROCK_POP_INTER_ARTISTS = new Set([
  'michael jackson','guns n roses','led zeppelin','the beatles','beatles',
  'coldplay','bon jovi','nirvana','acdc','ac dc',
  'red hot chilli peppers','red hot chili peppers','aerosmith',
  'pink floyd','dire straits','toto','journey','eagles',
  'elton john','stevie wonder','elvis presley',
  'maroon 5','bruno mars','ed sheeran','beyonce','lady gaga',
  'eric clapton','scorpions','metallica','queen','u2',
  'linkin park','foo fighters','oasis','pearl jam','green day',
  'abba','bee gees','phil collins',
])

const BREGA_ARTISTS = new Set([
  'reginaldo rossi','amado batista','odair josé','sidney magal','nelson ned',
  'waldick soriano','fernando mendes','josé augusto','agnaldo timóteo',
  'wando','paulo sérgio','benito di paula','luiz ayrão',
])

function classifyRockPopMpb(artist: string, songName: string): string {
  const a = artist.toLowerCase().trim()
  const lower = songName.toLowerCase()
  // Exact set matches
  if (ROCK_POP_INTER_ARTISTS.has(a)) return 'rock-pop-inter'
  if (MPB_ARTISTS.has(a)) return 'mpb'
  if (ROCK_BR_ARTISTS.has(a)) return 'rock-nacional'
  if (BREGA_ARTISTS.has(a)) return 'brega'
  // Partial artist name matches (only if artist is not empty)
  if (a.length > 0) {
    for (const name of ROCK_POP_INTER_ARTISTS) if (a.includes(name) || name.includes(a)) return 'rock-pop-inter'
    for (const name of MPB_ARTISTS) if (a.includes(name) || name.includes(a)) return 'mpb'
    for (const name of ROCK_BR_ARTISTS) if (a.includes(name) || name.includes(a)) return 'rock-nacional'
    for (const name of BREGA_ARTISTS) if (a.includes(name) || name.includes(a)) return 'brega'
  }
  // Check the raw song name for artist keywords
  for (const name of ROCK_POP_INTER_ARTISTS) if (lower.includes(name)) return 'rock-pop-inter'
  for (const name of ROCK_BR_ARTISTS) if (lower.includes(name)) return 'rock-nacional'
  for (const name of BREGA_ARTISTS) if (lower.includes(name)) return 'brega'
  // Default: unrecognized tracks in rock-pop-mpb are mostly Brazilian
  return 'mpb'
}

// ─── Cover art gradient generator ──────────────────────────────────────

const GRADIENT_PAIRS = [
  ['#1a1a2e', '#4a1942'],
  ['#0f3460', '#16213e'],
  ['#1b262c', '#0f4c75'],
  ['#2d132c', '#801336'],
  ['#1a1a2e', '#e94560'],
  ['#0a3d62', '#3c6382'],
  ['#1e3799', '#0c2461'],
  ['#6a0572', '#ab83a1'],
  ['#1b4332', '#2d6a4f'],
  ['#3d0066', '#7b2ff7'],
  ['#1c1c3d', '#4834d4'],
  ['#2c003e', '#512b58'],
]

function hashCode(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

function generateCover(title: string, artist: string, index: number): string {
  const hash = hashCode(title + artist)
  const [c1, c2] = GRADIENT_PAIRS[hash % GRADIENT_PAIRS.length]
  const initial = (title || '?').charAt(0).toUpperCase()

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${c1}"/>
        <stop offset="100%" stop-color="${c2}"/>
      </linearGradient>
    </defs>
    <rect fill="url(#g)" width="200" height="200"/>
    <text x="100" y="105" text-anchor="middle" dominant-baseline="central" fill="rgba(255,255,255,0.12)" font-size="140" font-weight="900" font-family="sans-serif">${initial}</text>
  </svg>`

  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

// ─── Clean stem name (remove song prefix from stem names) ──────────────

function cleanStemName(stemName: string, songName: string): string {
  let name = stemName
    .replace(/\.(mp3|wav|ogg|flac)$/i, '')
    .trim()

  // Some stems include the song name as prefix: "SONG NAME-STEM.MP3"
  const songClean = cleanSongName(songName).toLowerCase()
  const nameLower = name.toLowerCase()
  if (nameLower.startsWith(songClean)) {
    name = name.slice(songClean.length).replace(/^[-\s]+/, '').trim()
  }
  // Also check slug-like prefix
  const slugPrefix = songClean.replace(/\s+/g, '-')
  if (nameLower.startsWith(slugPrefix)) {
    name = name.slice(slugPrefix.length).replace(/^[-\s]+/, '').trim()
  }

  return name || stemName.replace(/\.(mp3|wav|ogg|flac)$/i, '')
}

// ─── Convert catalog song to Track ─────────────────────────────────────

function catalogToTrack(song: CatalogSong, index: number): Track {
  const { artist, title } = parseFolderName(song.name)

  // Extract BPM from raw name if present
  const bpmMatch = song.name.match(/(\d+(?:\.\d+)?)\s*BPM/i)
  const bpm = bpmMatch ? Math.round(parseFloat(bpmMatch[1])) : 0

  // Extract key from raw name if present
  const keyMatch = song.name.match(/[-\s]([A-G][b#]?)(?:\s*$|-\d)/)
  const keyNote = keyMatch ? keyMatch[1] : ''

  // Process stems with instrument detection and numbering
  const instrumentCounts = new Map<string, number>()

  const stems: Stem[] = song.stems.map((s, i) => {
    const cleaned = cleanStemName(s.name, song.name)
    const instrument = detectInstrument(cleaned)
    const label = instrument !== 'main' ? INSTRUMENT_LABELS[instrument] : toTitleCase(cleaned)

    // Number duplicate instruments: Guitarra 1, Guitarra 2
    const count = (instrumentCounts.get(instrument) || 0) + 1
    instrumentCounts.set(instrument, count)

    return {
      id: s.slug || `stem-${i}`,
      label,
      audioUrl: s.url,
      isPrimary: i === 0,
    } satisfies Stem
  })

  // Post-process: add numbers to duplicate instrument labels
  const finalStems = stems.map(s => {
    const instrument = detectInstrument(s.label.toLowerCase())
    const total = instrumentCounts.get(instrument) || 1
    if (total > 1 && instrument !== 'main') {
      // Count which number this is
      let n = 0
      for (const st of stems) {
        if (detectInstrument(st.label.toLowerCase()) === instrument) {
          n++
          if (st === s) {
            return { ...s, label: `${INSTRUMENT_LABELS[instrument]} ${n}` }
          }
        }
      }
    }
    return s
  })

  // Reclassify broad genres into sub-genres
  let effectiveGenreSlug = song.genreSlug
  if (song.genreSlug === 'rock-pop-mpb') {
    effectiveGenreSlug = classifyRockPopMpb(artist, song.name)
  } else if (song.genreSlug === 'atualizacoes') {
    effectiveGenreSlug = classifyAtualizacoes(song.name, artist)
  }

  return {
    id: `r2-${song.genreSlug}-${song.slug}`,
    title,
    artist: artist || genreSlugToLabel(effectiveGenreSlug),
    genre: effectiveGenreSlug as any,
    genreLabel: genreSlugToLabel(effectiveGenreSlug),
    bpm,
    keyNote,
    keyScale: 'major',
    durationSeconds: 0,
    coverUrl: generateCover(title, artist, index),
    previewUrl: finalStems[0]?.audioUrl || '',
    hasStems: song.stemCount > 1,
    stems: finalStems,
    hasLyrics: false,
    tags: [effectiveGenreSlug],
  }
}

// ─── Store ─────────────────────────────────────────────────────────────

export const useCatalogStore = create<CatalogState>((set) => ({
  tracks: [],
  genres: [],
  isLoading: false,
  error: null,

  loadCatalog: async () => {
    set({ isLoading: true, error: null })
    try {
      let catalog: CatalogSong[] = []

      try {
        const res = await fetch('/catalog.json')
        if (res.ok) catalog = await res.json()
      } catch { /* empty catalog is ok */ }

      if (catalog.length === 0) {
        set({ isLoading: false, tracks: [], genres: [] })
        return
      }

      const tracks = catalog.map((song, i) => catalogToTrack(song, i))

      const genreMap = new Map<string, number>()
      for (const track of tracks) {
        const gId = track.tags[0] || 'other'
        genreMap.set(gId, (genreMap.get(gId) || 0) + 1)
      }
      const genres = Array.from(genreMap.entries()).map(([id, count]) => ({
        id,
        label: genreSlugToLabel(id),
        count,
      })).sort((a, b) => b.count - a.count)

      set({ tracks, genres, isLoading: false })
    } catch (err: any) {
      set({ error: err.message, isLoading: false })
    }
  },
}))

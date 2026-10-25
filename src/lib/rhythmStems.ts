/**
 * Pistas de ritmo (bateria, percussão, click, contagem): não mudam de tom junto com a música.
 * Mudar o tom de um instrumento sem nota definida não ajuda nada e deixa o som "metálico".
 */
import type { Stem } from '@/types/track'

const RHYTHM = new RegExp('\\b(' + [
  // bateria
  'drums?', 'bateria', 'batera', 'bat', 'bt', 'kit', 'kick', 'kik', 'kk', 'bumbo', 'bumbu', 'bombo',
  'snare', 'sn', 'snb', 'snt', 'sd', 'caixa', 'cx', 'aro', 'tons', 'toms', 'tom \\d', 'floor', 'virada', 'viradas',
  'hi ?hats?', 'hh', 'hat', 'chimbal', 'cimbal', 'simbal', 'pratos?', 'cymbals?', 'crash', 'ride', 'splash',
  'overs?', 'ovrs', 'overheads?', 'oh', 'room', 'claps?', 'palmas?', 'snaps?', 'beat ?box', 'olodum',
  // percussão
  'perc\\w*', 'conga\\w*', 'bongo\\w*', 'timba\\w*', 'surdo\\w*', 'repiq\\w*', 'ripiq\\w*', 'tamborim\\w*', 'tambor\\w*',
  'pandeir\\w*', 'pandero\\w*', 'zabumb\\w*', 'ganza\\w*', 'chocalho\\w*', 'shak\\w*', 'shek\\w*', 'caxixi', 'caxeta',
  'cuica\\w*', 'agogo', 'triang\\w*', 'triag\\w*', 'reco', 'rebolo', 'tanta\\w*', 'bacur\\w*', 'cajon', 'cowbell',
  'apito', 'atabaque', 'tumba\\w*', 'djembe', 'alfaia', 'xequere', 'tabla', 'rototom', 'rontonton', 'malacacheta',
  'cabasa', 'guiro', 'clave', 'woodblock', 'block', 'meia lua',
  // loops de batida
  'loop (?:bt|bat\\w*|beat|drums?|perc\\w*|funk|xote|groove)', 'beat loop',
  // apoio
  'click', 'clik', 'clique', 'metronomo', 'metro', 'contagem', 'count', 'cue',
  // falas de comando ("refrão!", "para!"): voz falada, sem nota
  'regencia', 'rege encia', 'comando', 'fala',
].join('|') + ')\\b')

/** Pista com o nome exato "tom" é o tambor da bateria (o "tom" da música vem acompanhado: "tom original") */
const ONLY_TOM = /^toms?( \d+)*$/

/** Instrumentos de percussão com nota definida: acompanham o tom */
const PITCHED = /\b(steel|marimba|vibra\w*|xilofone|xylophone|glocken\w*|timpani|tímpano|sino|bells?)\b/

function words(s: string): string[] {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').replace(/\b(mp3|wav|flac|ogg|m4a)\b/g, ' ')
    .replace(/(\d+)/g, ' $1 ').trim().split(/\s+/).filter(Boolean)
}

/**
 * Ids das pistas de ritmo de uma música. Muitas músicas repetem o nome dela em cada pista
 * ("guia 8 bebe confesso", "pandeiro 50 tons"): esse trecho é ignorado para não confundir com instrumento.
 */
export function rhythmStemIds(stems: Pick<Stem, 'id' | 'label'>[]): Set<string> {
  const ids = withoutSharedWords(stems.map(s => words(s.id)))
  const labels = withoutSharedWords(stems.map(s => words(s.label)))
  const out = new Set<string>()
  stems.forEach((s, i) => {
    const names = [ids[i], labels[i]]
    if (names.some(n => PITCHED.test(n))) return
    if (names.some(n => RHYTHM.test(n) || ONLY_TOM.test(n))) out.add(s.id)
  })
  return out
}

/** Tira o começo e o fim que se repetem na maioria das pistas (nome da música, artista) */
function withoutSharedWords(names: string[][]): string[] {
  const pre = sharedEdge(names, false), suf = sharedEdge(names, true)
  return names.map(w => {
    let a = 0, b = w.length
    if (pre.length && w.length > pre.length && pre.every((x, k) => w[k] === x)) a = pre.length
    if (suf.length && b - a > suf.length && suf.every((x, k) => w[b - suf.length + k] === x)) b -= suf.length
    return w.slice(a, b).join(' ')
  })
}

/** Sequência de 2+ palavras no começo (ou no fim) de pelo menos 60% das pistas */
function sharedEdge(names: string[][], fromEnd: boolean): string[] {
  let edge: string[] = []
  const need = Math.max(3, names.length * 0.6)
  for (let k = 1; k <= 24; k++) {
    const counts = new Map<string, number>()
    for (const w of names) {
      if (w.length <= k) continue
      const key = (fromEnd ? w.slice(-k) : w.slice(0, k)).join(' ')
      counts.set(key, (counts.get(key) || 0) + 1)
    }
    let best = '', n = 0
    counts.forEach((v, key) => { if (v > n) { best = key; n = v } })
    if (n < need) break
    edge = best.split(' ')
  }
  return edge.length >= 2 ? edge : []
}

/** A pista acompanha o tom? O músico pode escolher no mixer; sem escolha, ritmo fica fora */
export function followsPitch(stemId: string, rhythm: Set<string>, choice?: boolean): boolean {
  return choice ?? !rhythm.has(stemId)
}

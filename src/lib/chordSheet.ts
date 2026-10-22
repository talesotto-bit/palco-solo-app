/**
 * Leitura de cifras: reconhece as linhas de acordes (no formato do servidor, com ⟨C⟩, ou em texto
 * colado de qualquer site) e junta cada linha de acordes com a linha de letra de baixo.
 * Assim o acorde fica em cima da sílaba certa mesmo quando a linha quebra na tela do celular.
 */

export interface ChordAt { col: number; chord: string }

export type SheetLine =
  | { type: 'pair'; chords: ChordAt[]; lyric: string }
  | { type: 'chords'; chords: ChordAt[] }
  | { type: 'section'; text: string }
  | { type: 'text'; text: string }
  | { type: 'blank' }

// Acorde: tônica + qualidade/extensões (m, 7, 7M, sus4, add9, (9), º, +, -) + baixo opcional
const CHORD_TOKEN = /^\(?[A-G](?:#|b)?(?:m(?!a)|M|maj|min|dim|aug|sus|add|º|°|\+|-|\d|\(|\)|#|b|,|\.)*(?:\/[A-G](?:#|b)?)?\)?$/
const REPEAT_TOKEN = /^(\(?x?\d+x?\)?|\||-|–|\/)$/i

export function isChordToken(tok: string): boolean {
  return CHORD_TOKEN.test(tok)
}

/** Linha só de acordes (aceita marcações como "x2", "|", "-") */
function chordLineTokens(line: string): ChordAt[] | null {
  const parts = [...line.matchAll(/\S+/g)]
  if (!parts.length) return null
  let chords = 0, other = 0
  const found: ChordAt[] = []
  for (const m of parts) {
    const tok = m[0]
    if (isChordToken(tok)) { chords++; found.push({ col: m.index!, chord: tok }) }
    else if (!REPEAT_TOKEN.test(tok)) other++
  }
  // "Intro: C G Am F" também conta como linha de acordes
  const label = /^(intro|introdução|solo|riff|final|ponte|interlúdio|base|tab)\s*:?$/i
  if (other === 1 && label.test(parts[0][0])) other = 0
  return chords > 0 && other === 0 ? found : null
}

function sectionText(line: string): string | null {
  const t = line.trim()
  const m = t.match(/^\[(.+)\]$/) || t.match(/^(refrão|refrao|verso|estrofe|pré-refrão|pre-refrao|ponte|intro|introdução|solo|final|bridge|chorus|verse)\s*\d*\s*:?$/i)
  return m ? (m[1] || t).replace(/:$/, '') : null
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  aacute: 'á', agrave: 'à', atilde: 'ã', acirc: 'â', eacute: 'é', ecirc: 'ê', iacute: 'í', oacute: 'ó', otilde: 'õ',
  ocirc: 'ô', uacute: 'ú', uuml: 'ü', ccedil: 'ç', ntilde: 'ñ', Aacute: 'Á', Agrave: 'À', Atilde: 'Ã', Acirc: 'Â',
  Eacute: 'É', Ecirc: 'Ê', Iacute: 'Í', Oacute: 'Ó', Otilde: 'Õ', Ocirc: 'Ô', Uacute: 'Ú', Ccedil: 'Ç', Ntilde: 'Ñ',
}

/** Acentos que algumas fontes mandam como código (&atilde;, &#231;) */
export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => ENTITIES[name] ?? m)
}

/** Converte texto com marcações ⟨C⟩ (vindo do servidor) em texto puro com os acordes no lugar */
function unmark(text: string): string {
  return decodeEntities(text.replace(/⟨([^⟩]*)⟩/g, '$1'))
}

export function parseSheet(raw: string): SheetLine[] {
  const text = unmark(raw.replace(/\r\n?/g, '\n').replace(/\t/g, '    '))
  const lines = text.split('\n')
  const out: SheetLine[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\s+$/, '')
    if (!line.trim()) { if (out.length && out[out.length - 1].type !== 'blank') out.push({ type: 'blank' }); continue }
    const sec = sectionText(line)
    if (sec) { out.push({ type: 'section', text: sec }); continue }
    // "[Intro] C G/B Am7": rótulo e acordes na mesma linha
    const labeled = line.match(/^(\s*\[([^\]]+)\]\s*)(.+)$/)
    if (labeled) {
      const rest = chordLineTokens(' '.repeat(labeled[1].length) + labeled[3])
      if (rest) {
        out.push({ type: 'section', text: labeled[2] })
        out.push({ type: 'chords', chords: rest.map(c => ({ ...c, col: c.col - labeled[1].length })) })
        continue
      }
    }
    const chords = chordLineTokens(line)
    if (chords) {
      const nextRaw = lines[i + 1]?.replace(/\s+$/, '') ?? ''
      if (nextRaw.trim() && !chordLineTokens(nextRaw) && !sectionText(nextRaw)) {
        out.push({ type: 'pair', chords, lyric: nextRaw })
        i++
      } else {
        out.push({ type: 'chords', chords })
      }
      continue
    }
    out.push({ type: 'text', text: line })
  }
  while (out.length && out[out.length - 1].type === 'blank') out.pop()
  return out
}

/** Quebra a letra em pedaços, cada um começando onde há um acorde */
export function pairSegments(chords: ChordAt[], lyric: string): { chord?: string; text: string }[] {
  const segs: { chord?: string; text: string }[] = []
  const sorted = [...chords].sort((a, b) => a.col - b.col)
  const firstCol = sorted[0]?.col ?? 0
  if (firstCol > 0) segs.push({ text: lyric.slice(0, firstCol) })
  sorted.forEach((c, k) => {
    const end = k + 1 < sorted.length ? sorted[k + 1].col : Math.max(lyric.length, c.col)
    segs.push({ chord: c.chord, text: lyric.slice(c.col, end) })
  })
  return segs
}

/** Quantos acordes a cifra tem (para saber se o texto colado é mesmo uma cifra) */
export function countChords(lines: SheetLine[]): number {
  return lines.reduce((n, l) => n + (l.type === 'pair' || l.type === 'chords' ? l.chords.length : 0), 0)
}

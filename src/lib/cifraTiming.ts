/**
 * Tempo de cada linha da cifra, para a rolagem acompanhar a música.
 *
 * Com letra sincronizada: cada linha cantada da cifra é casada com a linha da letra que diz as mesmas
 * palavras (em ordem, então refrão repetido e trecho que a cifra omite não bagunçam). Linhas só de acordes,
 * títulos de parte e introdução ficam entre as vizinhas casadas.
 * Sem letra sincronizada: o trecho cantado é dividido pelas linhas, com linha de letra pesando mais.
 */
import type { SheetLine } from './chordSheet'
import type { LrcLine } from '@/store/lyricsStore'

function words(text: string): string[] {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 2)
}

/** texto cantado da linha da cifra ('' para acordes, título de parte, linha em branco) */
export function sheetLineText(l: SheetLine): string {
  return l.type === 'pair' ? l.lyric : l.type === 'text' ? l.text : ''
}

function similarity(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0
  const sb = new Set(b)
  let inter = 0
  for (const w of new Set(a)) if (sb.has(w)) inter++
  return (2 * inter) / (new Set(a).size + sb.size)
}

/** casa linhas da cifra com linhas da letra, em ordem, somando a semelhança dos pares (alinhamento) */
function align(sheet: string[][], lrc: string[][]): Map<number, number> {
  const n = sheet.length, m = lrc.length
  const MIN = 0.4
  const score: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let k = m - 1; k >= 0; k--) {
      const s = sheet[i].length >= 2 ? similarity(sheet[i], lrc[k]) : 0
      score[i][k] = Math.max(score[i + 1][k], score[i][k + 1], s >= MIN ? s + score[i + 1][k + 1] : 0)
    }
  }
  const out = new Map<number, number>()
  let i = 0, k = 0
  while (i < n && k < m) {
    const s = sheet[i].length >= 2 ? similarity(sheet[i], lrc[k]) : 0
    if (s >= MIN && Math.abs(score[i][k] - (s + score[i + 1][k + 1])) < 1e-9) { out.set(i, k); i++; k++ }
    else if (score[i + 1][k] >= score[i][k + 1]) i++
    else k++
  }
  return out
}

function weight(l: SheetLine): number {
  return l.type === 'pair' ? 1 : l.type === 'text' ? 0.9 : l.type === 'chords' ? 0.5 : l.type === 'section' ? 0.15 : 0.1
}

export interface CifraTiming {
  /** instante (s) em que cada linha da cifra começa */
  times: number[]
  /** true quando veio da letra sincronizada (aí dá para destacar a linha atual) */
  synced: boolean
}

/**
 * @param lines linhas da cifra
 * @param lrc letra sincronizada já com o ajuste de sincronia aplicado (ou null)
 * @param span [início, fim] do trecho cantado, usado sem letra sincronizada
 * @param end fim do áudio
 */
export function cifraTiming(lines: SheetLine[], lrc: LrcLine[] | null, span: [number, number], end: number): CifraTiming {
  const n = lines.length
  const times = new Array<number>(n).fill(0)
  if (!n) return { times, synced: false }

  // tempo distribuído pelo peso das linhas entre dois pontos conhecidos
  const fill = (from: number, to: number, t0: number, t1: number) => {
    let total = 0
    for (let i = from; i < to; i++) total += weight(lines[i])
    let acc = 0
    for (let i = from; i < to; i++) { times[i] = t0 + (total ? acc / total : 0) * (t1 - t0); acc += weight(lines[i]) }
  }

  const matches = lrc && lrc.length >= 4 ? align(lines.map(l => words(sheetLineText(l))), lrc.map(l => words(l.text))) : new Map<number, number>()
  const sungLines = lines.filter(l => sheetLineText(l).trim()).length
  // poucas linhas casadas: a cifra não segue a letra (ou é só de acordes); melhor a divisão por peso
  if (matches.size < Math.max(3, sungLines * 0.25)) {
    const [s, e] = span
    const firstSung = lines.findIndex(l => l.type === 'pair' || l.type === 'text')
    const lead = Math.max(0, firstSung)
    fill(0, lead, 0, s)
    fill(lead, n, s, e)
    return { times, synced: false }
  }

  const anchors = [...matches.entries()].map(([i, k]) => [i, lrc![k].time] as const)
  // até a primeira linha casada: introdução, do começo até ela
  fill(0, anchors[0][0], 0, anchors[0][1])
  for (let a = 0; a < anchors.length; a++) {
    const [i, t] = anchors[a]
    const next = anchors[a + 1]
    if (next) fill(i, next[0], t, next[1])
    else fill(i, n, t, Math.max(t + 4, end))
  }
  return { times, synced: true }
}

/** posição (linha + fração) no instante t: a rolagem desliza de uma linha para a outra */
export function positionAt(times: number[], t: number): number {
  if (!times.length) return 0
  if (t <= times[0]) return 0
  let lo = 0, hi = times.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (times[mid] <= t) lo = mid; else hi = mid - 1
  }
  const next = times[lo + 1]
  if (next === undefined || next <= times[lo]) return lo
  return lo + Math.min(1, (t - times[lo]) / (next - times[lo]))
}

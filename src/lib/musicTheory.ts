/**
 * Utilidades musicais: exibição do tom em "tons" (como o músico fala)
 * e transposição de acordes para as cifras acompanharem o ajuste de tom.
 *
 * Unidade interna do app: semitom (1 semitom = ½ tom).
 */

// Grafia usual nas cifras brasileiras: C#, Eb, F#, Ab/G#m, Bb
const MAJOR_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
const MINOR_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B']
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

const NOTE_INDEX: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, Fb: 4, 'E#': 5, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11, 'B#': 0,
}

/** Formata semitons em tons: 1 → "+½ tom", 4 → "+2 tons", -3 → "-1½ tom" */
export function formatTons(semitones: number): string {
  const st = Math.round(semitones)
  if (st === 0) return '0'
  const sign = st > 0 ? '+' : '-'
  const abs = Math.abs(st)
  const whole = Math.floor(abs / 2)
  const half = abs % 2 === 1
  const num = whole === 0 ? '½' : half ? `${whole}½` : `${whole}`
  const unit = abs >= 4 ? 'tons' : 'tom'
  return `${sign}${num} ${unit}`
}

function transposeNote(note: string, semitones: number, preferFlats: boolean, minor = false): string {
  const idx = NOTE_INDEX[note]
  if (idx === undefined) return note
  const next = (((idx + semitones) % 12) + 12) % 12
  return (preferFlats ? FLATS : minor ? MINOR_NAMES : MAJOR_NAMES)[next]
}

const CHORD_RE = /^([A-G](?:#|b)?)([^/\s]*)(?:\/([A-G](?:#|b)?))?$/

/**
 * Transpõe um acorde (ex.: "F#m7/C#", "Bb9", "G(add9)").
 * Texto que não é acorde é devolvido sem mudança.
 */
export function transposeChord(chord: string, semitones: number): string {
  const st = Math.round(semitones)
  if (st === 0) return chord
  const m = chord.trim().match(CHORD_RE)
  if (!m) return chord
  const [, root, quality, bass] = m
  const preferFlats = root.includes('b') || (bass?.includes('b') ?? false)
  const minor = /^m(?!aj)/.test(quality)
  const newRoot = transposeNote(root, st, preferFlats, minor)
  // Baixo segue a grafia da tônica: B/D# (e não B/Eb), Bb/D, F/A
  const sharpContext = newRoot.includes('#') || ['B', 'E', 'A', 'D'].includes(newRoot)
  const newBass = bass ? `/${sharpContext && !preferFlats
    ? ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][(((NOTE_INDEX[bass] + st) % 12) + 12) % 12]
    : transposeNote(bass, st, preferFlats)}` : ''
  return `${newRoot}${quality}${newBass}`
}

/** Transpõe o tom da música (ex.: "Am", "F#") */
export function transposeKey(key: string, semitones: number): string {
  return transposeChord(key, semitones)
}

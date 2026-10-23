/** Detecção de altura (afinador): autocorrelação com interpolação, boa para violão e voz */

export const NOTE_PT = ['Dó', 'Dó#', 'Ré', 'Ré#', 'Mi', 'Fá', 'Fá#', 'Sol', 'Sol#', 'Lá', 'Lá#', 'Si']
export const NOTE_EN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/** Retorna a frequência (Hz) ou -1 se não há som suficiente */
export function detectPitch(input: Float32Array, sampleRate: number): number {
  let size = input.length
  let rms = 0
  for (let i = 0; i < size; i++) rms += input[i] * input[i]
  rms = Math.sqrt(rms / size)
  if (rms < 0.008) return -1

  // corta as pontas em silêncio para a correlação ficar limpa
  let r1 = 0, r2 = size - 1
  const thres = 0.2 * Math.max(...input.subarray(0, Math.min(size, 4096)).map(Math.abs))
  for (let i = 0; i < size / 2; i++) if (Math.abs(input[i]) < thres) { r1 = i; break }
  for (let i = 1; i < size / 2; i++) if (Math.abs(input[size - i]) < thres) { r2 = size - i; break }
  const buf = input.subarray(r1, r2)
  size = buf.length
  if (size < 64) return -1

  const c = new Float32Array(size)
  for (let lag = 0; lag < size; lag++) {
    let sum = 0
    for (let j = 0; j < size - lag; j++) sum += buf[j] * buf[j + lag]
    c[lag] = sum
  }
  let d = 0
  while (d < size - 1 && c[d] > c[d + 1]) d++
  let maxval = -1, maxpos = -1
  for (let i = d; i < size; i++) if (c[i] > maxval) { maxval = c[i]; maxpos = i }
  if (maxpos <= 0 || maxpos >= size - 1) return -1
  let t0 = maxpos
  const x1 = c[t0 - 1], x2 = c[t0], x3 = c[t0 + 1]
  const a = (x1 + x3 - 2 * x2) / 2, b = (x3 - x1) / 2
  if (a) t0 = t0 - b / (2 * a)
  const f = sampleRate / t0
  return f > 50 && f < 1500 ? f : -1
}

/** Nota mais próxima: índice MIDI, nome e quantos cents fora */
export function noteFromFreq(freq: number, a4 = 440) {
  const midi = 69 + 12 * Math.log2(freq / a4)
  const n = Math.round(midi)
  const cents = Math.round((midi - n) * 100)
  return { midi: n, name: NOTE_PT[((n % 12) + 12) % 12], letter: NOTE_EN[((n % 12) + 12) % 12], octave: Math.floor(n / 12) - 1, cents }
}

export const GUITAR_STRINGS = [
  { name: 'Mi', letter: 'E2', midi: 40, n: 6 },
  { name: 'Lá', letter: 'A2', midi: 45, n: 5 },
  { name: 'Ré', letter: 'D3', midi: 50, n: 4 },
  { name: 'Sol', letter: 'G3', midi: 55, n: 3 },
  { name: 'Si', letter: 'B3', midi: 59, n: 2 },
  { name: 'Mi', letter: 'E4', midi: 64, n: 1 },
]

export function midiToFreq(m: number, a4 = 440) { return a4 * Math.pow(2, (m - 69) / 12) }

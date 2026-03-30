export type Genre =
  | 'sertanejo'
  | 'gospel'
  | 'pagode'
  | 'samba'
  | 'forro'
  | 'mpb'
  | 'pop'
  | 'rock'
  | 'arrocha'
  | 'piseiro'
  | 'internacional'
  | 'catolica'
  | 'axe'
  | 'seresta'
  | 'gaucha'
  | 'romantico'
  | 'modao'

export type InstrumentId =
  | 'main'       // mix estéreo completo
  | 'drums'      // bateria
  | 'percussion' // percussão
  | 'bass'       // baixo
  | 'guitar'     // guitarra elétrica
  | 'keys'       // teclado / piano
  | 'synth'      // sintetizador / pads / fx
  | 'voice'      // voz guia
  | 'choir'      // backing vocal
  | 'brass'      // metais / sopros
  | 'strings'    // cordas
  | 'acoustic'   // violão acústico
  | 'click'      // click track / metrônomo

export const INSTRUMENT_LABELS: Record<InstrumentId, string> = {
  main: 'Mix Completo',
  drums: 'Bateria',
  percussion: 'Percussão',
  bass: 'Baixo',
  guitar: 'Guitarra',
  keys: 'Teclado',
  synth: 'Sintetizador',
  voice: 'Voz Guia',
  choir: 'Backing Vocal',
  brass: 'Metais',
  strings: 'Cordas',
  acoustic: 'Violão',
  click: 'Click',
}

export const INSTRUMENT_ICONS: Record<InstrumentId, string> = {
  main: '🎵',
  drums: '🥁',
  percussion: '🪘',
  bass: '🎸',
  guitar: '🎸',
  keys: '🎹',
  synth: '🎛️',
  voice: '🎤',
  choir: '🎙️',
  brass: '🎺',
  strings: '🎻',
  acoustic: '🪕',
  click: '🔔',
}

export interface Stem {
  id: InstrumentId | string  // string permite ids gerados dinamicamente para pistas locais
  label: string
  audioUrl: string
  isPrimary: boolean // true = mix estéreo principal
}

export interface Track {
  id: string
  title: string
  artist: string
  genre: Genre
  genreLabel: string
  bpm: number
  keyNote: string       // ex: 'C', 'D#', 'Gb'
  keyScale: 'major' | 'minor'
  durationSeconds: number
  coverUrl: string
  previewUrl: string    // 30s preview
  hasStems: boolean     // se tem stems individuais
  stems: Stem[]         // inclui o mix principal como stem[0]
  hasLyrics: boolean
  lyricsUrl?: string
  tags: string[]
  isNew?: boolean
  isFeatured?: boolean
}

export interface GenreInfo {
  id: Genre
  label: string
  emoji: string
  color: string
}

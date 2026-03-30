/**
 * stemDetection — detecta instrumento e metadados a partir do nome do arquivo
 */

import type { InstrumentId } from '@/types/track'
import { INSTRUMENT_LABELS } from '@/types/track'

// ─── Title Case ──────────────────────────────────────────────────────────

const LOWERCASE_WORDS = new Set([
  'de', 'do', 'da', 'dos', 'das', 'e', 'a', 'o', 'as', 'os', 'em', 'no', 'na',
  'nos', 'nas', 'um', 'uma', 'com', 'por', 'para', 'pra', 'pro',
  'the', 'of', 'and', 'in', 'on', 'at', 'to', 'for', 'is', 'it',
])

export function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(/\s+/)
    .map((word, i) => {
      if (i === 0 || !LOWERCASE_WORDS.has(word)) {
        return word.charAt(0).toUpperCase() + word.slice(1)
      }
      return word
    })
    .join(' ')
}

// ─── Clean Song Name ────────────────────────────────────────────────────

export function cleanSongName(raw: string): string {
  let name = raw.trim()

  // Remove file extensions
  name = name.replace(/\.(zip|mp3|wav|ogg|flac|m4a|aac|wma)$/i, '')

  // Remove trailing (1), (2), etc.
  name = name.replace(/\s*\(\d+\)\s*$/, '')

  // Remove trailing BPM: -69.00BPM, -120BPM, etc.
  name = name.replace(/[-\s]*\d+(\.\d+)?\s*BPM\s*$/i, '')

  // Remove trailing single-letter key signatures: -C, -Bb, -G#, etc.
  name = name.replace(/[-\s]+[A-G][b#]?\s*$/, '')

  // Remove STEMS, MULTITRACK, MULTITRACKS suffixes
  name = name.replace(/[-\s]*(STEMS|MULTITRACK|MULTITRACKS)\s*$/i, '')

  // Deduplicate: "FOO-FOO" or "FOO - FOO" -> "FOO"
  const parts = name.split(/\s*[-–—]\s*/)
  if (parts.length >= 2 && parts[0].trim().toLowerCase() === parts[1].trim().toLowerCase()) {
    name = parts[0].trim()
    if (parts.length > 2) name += ' - ' + parts.slice(2).join(' - ')
  }

  // Clean up extra dashes/spaces at end
  name = name.replace(/[-–—\s]+$/, '').trim()

  return name || raw.trim()
}

// ─── Parse Artist / Title ───────────────────────────────────────────────

export function parseFolderName(folderName: string): { artist: string; title: string } {
  const name = cleanSongName(folderName)

  // Pattern: "ARTIST - TITLE"
  const dashMatch = name.match(/^(.+?)\s*[-–—]\s*(.+)$/)
  if (dashMatch) {
    const [, partA, partB] = dashMatch
    const a = partA.trim()
    const b = partB.trim()

    // If partB looks like an artist (short, 1-3 words) and partA is longer, it may be reversed
    const aWords = a.split(/\s+/).length
    const bWords = b.split(/\s+/).length

    // "TITLE - ARTIST" pattern (common in atualizacoes): second part shorter
    if (bWords <= 3 && aWords > 3 && /^(DJ|MC|MR|DR)\s/i.test(b)) {
      return { artist: toTitleCase(b), title: toTitleCase(a) }
    }

    return { artist: toTitleCase(a), title: toTitleCase(b) }
  }

  return { artist: '', title: toTitleCase(name) }
}

// ─── Instrument Detection ───────────────────────────────────────────────

export function detectInstrument(filename: string): InstrumentId {
  const name = filename.toLowerCase()
    .replace(/\.(mp3|wav|ogg|flac)$/i, '')
    .replace(/[_\-\.]/g, ' ')
    .trim()

  // Click / metronome — detect first to avoid false matches
  if (/\bclick\b|click track|\bmetronom|\bcontagem\b/.test(name)) return 'click'

  // Drums
  if (/\bdrum|\bbater|\bzabumb|\bpandeiro|\bkick\b|\bsnare\b|\bbumbo\b|\bcaixa\b|\btons\b|\bchimbal/.test(name)) return 'drums'

  // Percussion
  if (/\bperc|\bpercus|\bconga|\bshaker|\btriangul|\bmeia lua|\btambor|\bagogo/.test(name)) return 'percussion'

  // Bass
  if (/\bbass\b|\bbaixo\b|\bsynth bass/.test(name)) return 'bass'

  // Acoustic guitar
  if (/\bviolao\b|\bviolão\b|\bac\b|\bag\b|\bacoustic|\bacust|\bclassic/.test(name)) return 'acoustic'

  // Electric guitar
  if (/\bguitar|\beg\b|\beg \d|\bgtr|\bguitarra|\bgt\b|\bgt\s/.test(name)) return 'guitar'

  // Keys / Piano
  if (/\bkeys?\b|\bpiano|\bteclad|\brhodes|\borgan|\borgao|\borgão|\bep\b|\baccordion|\bsanfon|\bacordeon|\bcravo/.test(name)) return 'keys'

  // Synth / Pads / FX / Loops
  if (/\bsynth\b|\bpad\b|\bpads\b|\bfx\b|\bloop\b|\belectronic|\beletron/.test(name)) return 'synth'

  // Lead voice
  if (/\bvoz\b|\bvocal|\bvoice|\bcanto|\bguia\b|\bguide\b|\bvox\b|\blead v/.test(name)) return 'voice'

  // Backing vocals
  if (/\bbgv|\bback|\bbacking|\bchoir|\bcoro\b|\bcoral|\bharmony|\bbg voc/.test(name)) return 'choir'

  // Brass / Winds
  if (/\bbrass|\bmetal|\bhorn|\btrompe|\bsax|\btuba|\btrombon|\bsopro|\bflauta/.test(name)) return 'brass'

  // Strings
  if (/\bstring|\bcord|\bviolin|\bviola\b|\bcello|\borquestr/.test(name)) return 'strings'

  return 'main'
}

// ─── Stem Label ─────────────────────────────────────────────────────────

export function stemLabel(filename: string, instrument: InstrumentId): string {
  if (instrument !== 'main') return INSTRUMENT_LABELS[instrument]
  // Clean the raw name for display
  let label = filename
    .replace(/\.(mp3|wav|ogg|flac)$/i, '')
    .replace(/^\d+[\s\-\.]+/, '')
    .trim()
  return toTitleCase(label) || 'Pista'
}

export { INSTRUMENT_LABELS }

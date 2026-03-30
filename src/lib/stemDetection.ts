/**
 * stemDetection — detecta instrumento e metadados a partir do nome do arquivo
 */

import type { InstrumentId } from '@/types/track'
import { INSTRUMENT_LABELS, INSTRUMENT_ICONS } from '@/types/track'

/** Detecta qual instrumento um arquivo representa pelo nome */
export function detectInstrument(filename: string): InstrumentId {
  const name = filename.toLowerCase().replace(/[_\-\s\.]/g, ' ')

  if (/bater|drum|percus|zabumb|pandeiro|agogo/.test(name)) return 'drums'
  if (/\bbaixo\b|bass/.test(name)) return 'bass'
  if (/guitar|violo(?!.*(acust|classi))|lead guit/.test(name)) return 'guitar'
  if (/violao|violão|acoust|acust|classica|classi/.test(name)) return 'acoustic'
  if (/teclad|keyb|piano|sintet|synth|organ|hammond/.test(name)) return 'keys'
  if (/\bvoz\b|vocal|voice|canto|lead voc|lead v/.test(name)) return 'voice'
  if (/back|choir|coro|coral|backing|bg voc|harmony/.test(name)) return 'choir'
  if (/metal|brass|horn|trompe|sax|tuba|trombon|sopro/.test(name)) return 'brass'
  if (/cord|string|violin|viola|cello|orquestra/.test(name)) return 'strings'

  return 'main'
}

/** Gera label para o stem a partir do nome do arquivo e instrumento detectado */
export function stemLabel(filename: string, instrument: InstrumentId): string {
  if (instrument !== 'main') return INSTRUMENT_LABELS[instrument]
  // Se não detectou, usa o nome do arquivo limpo
  return filename.replace(/\.[^/.]+$/, '').replace(/^\d+[\s\-\.]+/, '').trim() || 'Pista'
}

/** Extrai artista e título de um nome de pasta/arquivo */
export function parseFolderName(folderName: string): { artist: string; title: string } {
  // Remove extensão se houver
  const name = folderName.replace(/\.[^/.]+$/, '').trim()

  // Padrões: "Artista - Título", "Artista – Título", "Artista _ Título"
  const dashIdx = name.search(/\s[-–—_]\s/)
  if (dashIdx > 0) {
    return {
      artist: name.slice(0, dashIdx).trim(),
      title: name.slice(dashIdx).replace(/^\s*[-–—_]\s*/, '').trim(),
    }
  }

  // Se não tem separador, usa o nome completo como título
  return { artist: 'Desconhecido', title: name }
}

export { INSTRUMENT_LABELS, INSTRUMENT_ICONS }

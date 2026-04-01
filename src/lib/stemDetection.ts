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

// ─── Known artists for extraction from catalog names ────────────────────
// Catalog names follow "TITLE ARTIST" pattern (no dash separator)
// Sorted by length desc so longer names match first

const KNOWN_ARTISTS: string[] = [
  // Sertanejo
  'GUSTTAVO LIMA','BRUNO E MARRONE','HENRIQUE E JULIANO','MARILIA MENDONCA',
  'JORGE E MATEUS','ZE NETO E CRISTIANO','MAIARA E MARAISA','LUAN SANTANA',
  'SIMONE E SIMARIA','NAIARA AZEVEDO','ANA CASTELA','MURILO HUFF',
  'FELIPE ARAUJO','MATHEUS E KAUAN','HUGO E GUILHERME','ISRAEL E RODOLFFO',
  'GUSTAVO MIOTO','DIEGO E VICTOR HUGO','EDUARDO COSTA','MICHEL TELO',
  'LUCAS LUCCO','FERNANDO E SOROCABA','MARCOS E BELUTTI','JOAO BOSCO E VINICIUS',
  'CRISTIANO ARAUJO','GEORGE HENRIQUE E RODRIGO','ZE FELIPE','LEONARDO',
  'ZEZE DI CAMARGO','CHITAOZINHO E XORORO',
  'LAUANA PRADO','SIMONE MENDES','GUILHERME E BENUTO','LUAN PEREIRA',
  'CLAYTON E ROMARIO','ISRAEL E RODOLFO','BRUNO E BARRETO',
  'RIO NEGRO E SOLIMOES','ZEZE E LUCIANO','JOAO BOSCO E GABRIEL',
  'FELIPE E RODRIGO','LEO E RAPHAEL','BRENNO E MATHEUS',
  'ANTONY E GABRIEL','VICTOR MEIRA',
  // Piseiro
  'BAROES DA PISADINHA','JOAO GOMES','VITOR FERNANDES','TARCISIO DO ACORDEON',
  'BIU DO PISEIRO','ALANZIM COREANO','JAPAZIN','ZE VAQUEIRO','MARI FERNANDEZ','NATTAN',
  'MARCYNHO SENSACAO','ALDAIR PLAYBOY','PEDRO SAMPAIO',
  // Forró
  'WESLEY SAFADAO','XAND AVIAO','JONAS ESTICADO','CAVALEIROS DO FORRO',
  'SOLANGE ALMEIDA','IGUINHO E LULINHA','ERIC LAND','AVIOES DO FORRO',
  'LIMAO COM MEL','MASTRUZ COM LEITE','CALCINHA PRETA','RAI SAIA RODADA',
  'NATANZINHO LIMA','SAIA RODADA','FORRO REAL','FLAVIO JOSE','FLAVINHO',
  'FELIPE AMORIM','ROGEIRINHO',
  'HENRY FREITAS','REY VAQUEIRO','CLAUDIO NEY E JULIANA','CLAUDIO NEY',
  'MATHEUS FERNANDES','LIPE LUCENA','AVINE VINNY','MANO WALTER',
  'DJ IVIS','KADU MARTINS','THIAGO AQUINO','JUNIOR VIANNA',
  'LUAN ESTILIZADO','LUKA BASS','NUZIO MEDEIROS','TIERRY',
  'GABRIEL DINIZ','LUIZA SONZA','MICHELE ANDRADE','PRISCILA SENNA',
  // Arrocha
  'NADSON FERINHA','PABLO','DEVINHO NOVAES','SORO SILVA','SILVANNO SALLES','TAYRONE','NADSON',
  // Axé
  'IVETE SANGALO','HARMONIA DO SAMBA','LEO SANTANA','CHICLETE COM BANANA',
  'BANDA EVA','BELL MARQUES','CLAUDIA LEITTE','PARANGOLE','DANIELA MERCURY',
  'ASA DE AGUIA','PSIRICO',
  // Pagode
  'FERRUGEM','THIAGUINHO','SORRISO MAROTO','TURMA DO PAGODE','PERICLES',
  'GRUPO REVELACAO','RACA NEGRA','DILSINHO','MENOS E MAIS','EXALTASAMBA','GRUPO CHOCOLATE',
  // Gospel
  'FERNANDINHO','ALINE BARROS','ANDERSON FREIRE','GABRIELA ROCHA',
  'PRETO NO BRANCO','MINISTERIO LOUVOR LIVRE','HILLSONG',
  // MPB / Rock BR
  'LEGIAO URBANA','TIM MAIA','ROBERTO CARLOS','SKANK','BARAO VERMELHO',
  'ENGENHEIROS DO HAWAII','CAPITAL INICIAL','RAUL SEIXAS','JOTA QUEST',
  'DJAVAN','GILBERTO GIL','CAETANO VELOSO','CHICO BUARQUE','JORGE BEN JOR',
  'MARISA MONTE','ALCEU VALENCA','ZE RAMALHO','BELCHIOR',
  'CHARLIE BROWN JR','PITTY','NATIRUTS','CIDADE NEGRA','KID ABELHA',
  'LULU SANTOS','RITA LEE','CASSIA ELLER','PARALAMAS DO SUCESSO',
  'RAIMUNDOS','MAMONAS ASSASSINAS','O RAPPA','TITÃS',
  // Rock / Pop Internacional
  'MICHAEL JACKSON','GUNS N ROSES','LED ZEPPELIN','THE BEATLES',
  'COLDPLAY','BON JOVI','NIRVANA','ACDC','AC DC',
  'RED HOT CHILLI PEPPERS','RED HOT CHILI PEPPERS','AEROSMITH',
  'PINK FLOYD','DIRE STRAITS','TOTO','JOURNEY','EAGLES',
  'ELTON JOHN','STEVIE WONDER','ELVIS PRESLEY',
  'MAROON 5','BRUNO MARS','ED SHEERAN','BEYONCE','LADY GAGA',
  'ERIC CLAPTON','SCORPIONS','METALLICA','QUEEN','U2',
  'LINKIN PARK','FOO FIGHTERS','OASIS','PEARL JAM','GREEN DAY',
  'ABBA','BEE GEES','PHIL COLLINS',
  // Brega / Seresta
  'REGINALDO ROSSI','AMADO BATISTA','JOSE AUGUSTO','SIDNEY MAGAL','WANDO',
  'NELSON NED','WALDICK SORIANO','FERNANDO MENDES','AGNALDO TIMOTEO',
  'PAULO SERGIO','BENITO DI PAULA',
].sort((a, b) => b.length - a.length)

// ─── Parse Artist / Title ───────────────────────────────────────────────

export function parseFolderName(folderName: string): { artist: string; title: string } {
  const name = cleanSongName(folderName)

  // Pattern 1: "ARTIST - TITLE" or "TITLE - ARTIST"
  const dashMatch = name.match(/^(.+?)\s*[-–—]\s*(.+)$/)
  if (dashMatch) {
    const [, partA, partB] = dashMatch
    const a = partA.trim()
    const b = partB.trim()

    const aWords = a.split(/\s+/).length
    const bWords = b.split(/\s+/).length

    if (bWords <= 3 && aWords > 3 && /^(DJ|MC|MR|DR)\s/i.test(b)) {
      return { artist: toTitleCase(b), title: toTitleCase(a) }
    }

    return { artist: toTitleCase(a), title: toTitleCase(b) }
  }

  // Pattern 2: Extract known artist from name
  // Catalog names follow "TITLE ARTIST" (e.g. "30 CADEADOS GUSTTAVO LIMA")
  const upper = name.toUpperCase()
  for (const artist of KNOWN_ARTISTS) {
    const idx = upper.lastIndexOf(artist)
    if (idx > 0) {
      const titlePart = name.slice(0, idx).replace(/[-–—\s]+$/, '').trim()
      if (titlePart.length > 0) {
        return { artist: toTitleCase(artist), title: toTitleCase(titlePart) }
      }
    }
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

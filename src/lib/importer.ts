/**
 * Importar músicas do próprio músico: VS multipista (várias pistas ou um .zip) ou uma música inteira.
 * Os arquivos ficam guardados no aparelho (IndexedDB) e a música entra na biblioteca como qualquer outra.
 */
import { unzip } from 'fflate'
import { AudioCache, CACHE_PREFIX, cacheKey } from '@/lib/audioCache'
import { detectInstrument, stemLabel, toTitleCase } from '@/lib/stemDetection'
import type { Track, Stem, InstrumentId } from '@/types/track'

const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|oga|flac|opus|aif|aiff|wma|caf)$/i

export interface DraftStem {
  key: string          // id único no rascunho
  name: string         // nome do arquivo
  label: string        // nome exibido (editável)
  instrument: InstrumentId
  blob: Blob
  size: number
}

export interface ImportDraft {
  id: string
  title: string
  artist: string
  keyNote: string
  bpm: string
  stems: DraftStem[]
  /** música inteira: oferece "tirar a voz" (beta) */
  single: boolean
}

const ORDER: Record<string, number> = { drums: 1, percussion: 2, bass: 3, guitar: 4, acoustic: 5, keys: 6, synth: 7, brass: 8, strings: 9, choir: 10, voice: 11, click: 12, main: 13 }

export function isAudioName(name: string) { return AUDIO_EXT.test(name) && !name.split('/').pop()!.startsWith('._') }

function baseName(path: string) { return path.split('/').pop() || path }
function noExt(name: string) { return name.replace(/\.[^/.]+$/, '') }

/** Título a partir do nome da pasta/zip/arquivo: "HENRIQUE E JULIANO - ARRANHAO (VS)" → artista e música */
export function guessTitle(raw: string): { title: string; artist: string } {
  let s = noExt(raw).replace(/[_]+/g, ' ').replace(/\s*[\[(]?(vs|multitrack|multipista|playback|stems?|pistas)[\])]?\s*/gi, ' ').replace(/\s{2,}/g, ' ').trim()
  const m = s.match(/^(.+?)\s+[-–—]\s+(.+)$/)
  if (m) return { artist: toTitleCase(m[1].trim()), title: toTitleCase(m[2].trim()) }
  return { artist: '', title: toTitleCase(s) || 'Minha música' }
}

/** Prefixo comum dos arquivos ("ARRANHAO - Bateria.wav", "ARRANHAO - Baixo.wav" → "ARRANHAO") */
function commonPrefix(names: string[]): string {
  if (names.length < 2) return ''
  let p = names[0]
  for (const n of names) { while (!n.startsWith(p)) p = p.slice(0, -1) }
  return p.replace(/[\s\-_.]+$/, '')
}

let seq = 0
const uid = () => `${Date.now().toString(36)}${(seq++).toString(36)}`

function toDraft(groupName: string, files: { name: string; blob: Blob }[]): ImportDraft {
  const names = files.map(f => noExt(baseName(f.name)))
  const prefix = commonPrefix(names)
  const stems: DraftStem[] = files.map((f, i) => {
    let label = noExt(baseName(f.name))
    if (prefix.length >= 3 && label.length > prefix.length) label = label.slice(prefix.length).replace(/^[\s\-_.]+/, '')
    const instrument = detectInstrument(label)
    return { key: `s${i}`, name: baseName(f.name), label: files.length === 1 ? 'Música' : stemLabel(label, instrument), instrument, blob: f.blob, size: f.blob.size }
  }).sort((a, b) => (ORDER[a.instrument] ?? 13) - (ORDER[b.instrument] ?? 13) || a.label.localeCompare(b.label))
  // nomes repetidos ganham número: Guitarra 1, Guitarra 2
  const count: Record<string, number> = {}
  for (const s of stems) count[s.label] = (count[s.label] || 0) + 1
  const seen: Record<string, number> = {}
  for (const s of stems) if (count[s.label] > 1) { seen[s.label] = (seen[s.label] || 0) + 1; s.label = `${s.label} ${seen[s.label]}` }
  const g = guessTitle(groupName || prefix || files[0]?.name || '')
  return { id: uid(), title: g.title, artist: g.artist, keyNote: '', bpm: '', stems, single: files.length === 1 }
}

function unzipAsync(data: Uint8Array): Promise<Record<string, Uint8Array>> {
  return new Promise((res, rej) => unzip(data, { filter: f => isAudioName(f.name) }, (err, out) => (err ? rej(err) : res(out))))
}

/**
 * Lê o que o músico escolheu e monta os rascunhos:
 * - vários arquivos de áudio → um VS multipista;
 * - um arquivo de áudio → uma música inteira;
 * - .zip → um VS por pasta dentro do zip (ou o zip inteiro, se as pistas estiverem soltas).
 */
export async function readSelection(files: File[], mode: 'multi' | 'single'): Promise<ImportDraft[]> {
  const drafts: ImportDraft[] = []
  const loose: File[] = []
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) {
      const entries = await unzipAsync(new Uint8Array(await f.arrayBuffer()))
      const groups = new Map<string, { name: string; blob: Blob }[]>()
      for (const [path, data] of Object.entries(entries)) {
        if (!data.length) continue
        const parts = path.split('/').filter(Boolean)
        const folder = parts.length > 1 ? parts[parts.length - 2] : noExt(f.name)
        const list = groups.get(folder) || []
        list.push({ name: path, blob: new Blob([data as BlobPart], { type: mimeOf(path) }) })
        groups.set(folder, list)
      }
      // zip com uma pasta só (ex.: "Musica/…"): usa o nome do zip se for mais informativo
      for (const [folder, list] of groups) drafts.push(toDraft(groups.size === 1 && folder.length < 3 ? noExt(f.name) : folder, list))
    } else if (isAudioName(f.name)) {
      loose.push(f)
    }
  }
  if (loose.length) {
    if (mode === 'single') for (const f of loose) drafts.push(toDraft(f.name, [{ name: f.name, blob: f }]))
    else drafts.push(toDraft(commonPrefix(loose.map(f => noExt(f.name))) || '', loose.map(f => ({ name: f.name, blob: f }))))
  }
  return drafts
}

function mimeOf(name: string) {
  const ext = name.split('.').pop()!.toLowerCase()
  return ({ mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', flac: 'audio/flac', opus: 'audio/ogg' } as Record<string, string>)[ext] || 'application/octet-stream'
}

/** Confere se o aparelho consegue tocar cada arquivo (antes de guardar) */
export async function checkPlayable(blob: Blob): Promise<number | null> {
  try {
    const Ctx = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext
    const ctx = new Ctx(1, 1, 44100)
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer())
    return buf.duration
  } catch { return null }
}

/** Guarda os arquivos no aparelho e devolve a música pronta para a biblioteca */
export async function saveDraft(d: ImportDraft, onProgress?: (done: number, total: number) => void): Promise<Track> {
  const trackId = `local-${uid()}`
  const stems: Stem[] = []
  let i = 0
  for (const s of d.stems) {
    const stemId = `${s.label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'pista'}-${i}`
    const key = cacheKey(trackId, stemId)
    await AudioCache.storeBlob(key, s.blob)
    stems.push({ id: stemId, label: s.label, audioUrl: `${CACHE_PREFIX}${key}`, isPrimary: i === 0 })
    i++
    onProgress?.(i, d.stems.length)
  }
  // música inteira: versão "sem voz" (beta) calculada no aparelho, começa desligada
  if (d.single && stems[0]) stems.push({ id: 'sem-voz', label: 'Sem voz (beta)', audioUrl: stems[0].audioUrl, isPrimary: false, derive: 'karaoke' } as Stem)
  const bpm = Number(d.bpm) || 0
  return {
    id: trackId, title: d.title.trim() || 'Minha música', artist: d.artist.trim(), genre: 'importado', genreLabel: 'Minhas músicas',
    bpm, keyNote: d.keyNote.trim(), keyScale: 'major', durationSeconds: 0, coverUrl: '', previewUrl: stems[0]?.audioUrl || '',
    hasStems: stems.length > 1, stems, hasLyrics: false, tags: ['importado', d.single ? 'faixa' : 'multipista'], isNew: true,
  }
}

/** Espaço livre no aparelho (para avisar antes de importar algo grande) */
export async function storageInfo(): Promise<{ usage: number; quota: number } | null> {
  try { const e = await navigator.storage?.estimate?.(); return e ? { usage: e.usage || 0, quota: e.quota || 0 } : null } catch { return null }
}

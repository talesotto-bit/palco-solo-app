/**
 * Separação de pistas por IA.
 *
 * Fluxo: envia o arquivo ao Vercel Blob → /api/separate inicia a IA →
 * acompanha até terminar → baixa as pistas e guarda no aparelho (IndexedDB),
 * criando uma faixa na biblioteca do usuário.
 */

import { upload } from '@vercel/blob/client'
import { AudioCache, CACHE_PREFIX, cacheKey } from './audioCache'
import type { Track, Stem } from '@/types/track'

export type SeparationStatus = 'idle' | 'uploading' | 'starting' | 'processing' | 'saving' | 'done' | 'error'

type Progress = (status: SeparationStatus, message: string, pct?: number) => void

/** Separações por aparelho por dia (controla o custo da IA) */
export const DAILY_LIMIT = 3
const USAGE_KEY = 'separations-usage-v1'
const POLL_MS = 4000
const TIMEOUT_MS = 12 * 60 * 1000
const TYPICAL_MS = 3 * 60 * 1000

/** Pistas do modelo Demucs 6s → instrumento do app, na ordem do mixer */
const STEM_MAP: { key: string; id: string; label: string }[] = [
  { key: 'vocals', id: 'voice', label: 'Voz' },
  { key: 'drums', id: 'drums', label: 'Bateria' },
  { key: 'bass', id: 'bass', label: 'Baixo' },
  { key: 'guitar', id: 'guitar', label: 'Guitarra / Violão' },
  { key: 'piano', id: 'keys', label: 'Teclado' },
  { key: 'other', id: 'synth', label: 'Outros' },
]

function today(): string {
  return new Date().toLocaleDateString('sv-SE') // AAAA-MM-DD no fuso local
}

function readUsage(): { date: string; count: number } {
  try {
    const raw = JSON.parse(localStorage.getItem(USAGE_KEY) || 'null')
    if (raw?.date === today()) return raw
  } catch {}
  return { date: today(), count: 0 }
}

export function getDailyUsage(): { used: number; limit: number; allowed: boolean } {
  const { count } = readUsage()
  return { used: count, limit: DAILY_LIMIT, allowed: count < DAILY_LIMIT }
}

function recordUsage() {
  const u = readUsage()
  try { localStorage.setItem(USAGE_KEY, JSON.stringify({ date: u.date, count: u.count + 1 })) } catch {}
}

async function apiJson(res: Response) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.error) throw new Error(data.error || `Erro ${res.status}`)
  return data
}

function songTitle(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim() || 'Música separada'
}

export async function separateToLibrary(file: File, onProgress: Progress): Promise<Track> {
  if (!getDailyUsage().allowed) {
    throw new Error(`Você já usou as ${DAILY_LIMIT} separações de hoje. Amanhã libera de novo.`)
  }

  // 1. Envio
  onProgress('uploading', 'Enviando arquivo...', 0)
  const safeName = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_')
  const blob = await upload(`separacoes/${safeName}`, file, {
    access: 'public',
    handleUploadUrl: '/api/blob-upload',
    contentType: file.type || 'audio/mpeg',
    multipart: file.size > 8 * 1024 * 1024,
    onUploadProgress: ({ percentage }) => onProgress('uploading', 'Enviando arquivo...', Math.round(percentage)),
  })

  // 2. Início
  onProgress('starting', 'Iniciando a separação por IA...')
  const { id } = await apiJson(await fetch('/api/separate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audioUrl: blob.url }),
  }))
  recordUsage()

  // 3. Acompanhamento
  const started = Date.now()
  let output: Record<string, string | null> | undefined
  while (Date.now() - started < TIMEOUT_MS) {
    await new Promise(r => setTimeout(r, POLL_MS))
    const data = await apiJson(await fetch(`/api/separate?id=${encodeURIComponent(id)}`))
    if (data.status === 'succeeded') { output = data.output; break }
    if (data.status === 'failed' || data.status === 'canceled') {
      throw new Error('A IA não conseguiu separar este arquivo. Tente outro formato (MP3 ou WAV).')
    }
    const pct = Math.min(95, Math.round(((Date.now() - started) / TYPICAL_MS) * 100))
    onProgress('processing', 'A IA está separando as pistas. Leva de 2 a 5 minutos.', pct)
  }
  if (!output) throw new Error('A separação demorou mais que o normal. Tente de novo em alguns minutos.')

  // 4. Guarda as pistas no aparelho
  const trackId = `sep-${Date.now()}`
  const available = STEM_MAP.filter(s => typeof output![s.key] === 'string')
  const stems: Stem[] = []
  for (let i = 0; i < available.length; i++) {
    const s = available[i]
    onProgress('saving', `Salvando as pistas no seu aparelho (${i + 1}/${available.length})...`, Math.round((i / available.length) * 100))
    const res = await fetch(output[s.key] as string)
    if (!res.ok) throw new Error('Falha ao baixar as pistas. Tente de novo.')
    const audio = new File([await res.blob()], `${s.id}.mp3`, { type: 'audio/mpeg' })
    const key = cacheKey(trackId, s.id)
    await AudioCache.store(key, audio)
    stems.push({ id: s.id, label: s.label, audioUrl: `${CACHE_PREFIX}${key}`, isPrimary: false })
  }

  const title = songTitle(file.name)
  onProgress('done', 'Pronto!', 100)
  return {
    id: trackId,
    title,
    artist: 'Separada por IA',
    genre: 'sertanejo',
    genreLabel: 'Separadas por IA',
    bpm: 0,
    keyNote: '?',
    keyScale: 'major',
    durationSeconds: 0,
    coverUrl: `https://placehold.co/400x400/0f172a/1351AA?text=${encodeURIComponent(title.charAt(0).toUpperCase())}`,
    previewUrl: stems[0]?.audioUrl ?? '',
    hasStems: stems.length > 1,
    stems,
    hasLyrics: false,
    tags: ['ia', 'separado', 'multipista'],
    isNew: true,
  }
}

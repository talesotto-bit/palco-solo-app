/**
 * Client-side API for stem separation via Supabase Edge Function
 */

import { supabase } from './supabase'

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/separate-stems`

export type SeparationStatus = 'idle' | 'uploading' | 'starting' | 'processing' | 'saving' | 'done' | 'error'

export interface SeparationResult {
  name: string
  slug: string
  genre: string
  genreSlug: string
  stems: Array<{
    name: string
    slug: string
    key: string
    url: string
    format: string
    size: number
  }>
  stemCount: number
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session?.access_token || ''}`,
    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  }
}

/**
 * Check if user can use separation today
 */
export async function checkDailyLimit(): Promise<{ allowed: boolean; nextAvailable?: string }> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${FUNCTION_URL}?action=limit`, { headers })
  return res.json()
}

/**
 * Step 1: Upload file to Supabase Storage and start separation
 */
export async function startSeparation(
  file: File,
  onProgress: (status: SeparationStatus, message: string) => void,
): Promise<{ predictionId: string; fileName: string }> {
  // Upload to Supabase Storage
  onProgress('uploading', 'Enviando arquivo...')
  const filePath = `separations/${Date.now()}-${file.name}`

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('uploads')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
    })

  if (uploadError) throw new Error(`Erro no upload: ${uploadError.message}`)

  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from('uploads')
    .getPublicUrl(filePath)

  // Start separation
  onProgress('starting', 'Iniciando separação por IA...')
  const headers = await getAuthHeaders()
  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      audioUrl: publicUrl,
      fileName: file.name.replace(/\.[^.]+$/, ''),
    }),
  })

  const data = await res.json()
  if (data.error) throw new Error(data.error)

  return { predictionId: data.predictionId, fileName: data.fileName }
}

/**
 * Step 2: Poll for separation status
 */
export async function checkSeparationStatus(
  predictionId: string,
): Promise<{ status: string; output?: Record<string, string>; error?: string }> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${FUNCTION_URL}?id=${predictionId}`, { headers })
  return res.json()
}

/**
 * Step 3: Save stems to R2 and get permanent URLs
 */
export async function saveStems(
  predictionId: string,
  songName: string,
  genre?: string,
): Promise<SeparationResult> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${FUNCTION_URL}?action=save`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ predictionId, songName, genre }),
  })

  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return data
}

/**
 * Full pipeline: upload → separate → save → return track
 */
export async function separateAndSave(
  file: File,
  genre: string | undefined,
  onProgress: (status: SeparationStatus, message: string, pct?: number) => void,
): Promise<SeparationResult> {
  // Step 1: Upload & start
  const { predictionId, fileName } = await startSeparation(file, onProgress)

  // Step 2: Poll until done
  onProgress('processing', 'IA separando as pistas... isso pode levar 2-5 minutos', 0)
  let attempts = 0
  const maxAttempts = 120 // 10 minutes max (5s intervals)

  while (attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, 5000))
    attempts++

    const result = await checkSeparationStatus(predictionId)
    const pct = Math.min(95, Math.round((attempts / 60) * 100))

    if (result.status === 'succeeded') {
      break
    } else if (result.status === 'failed') {
      throw new Error(result.error || 'Falha na separação')
    } else {
      onProgress('processing', 'IA separando as pistas...', pct)
    }
  }

  if (attempts >= maxAttempts) {
    throw new Error('Timeout — a separação demorou mais que o esperado')
  }

  // Step 3: Save to R2
  onProgress('saving', 'Salvando pistas no servidor...', 95)
  const result = await saveStems(predictionId, fileName, genre)

  onProgress('done', `Pronto! ${result.stemCount} pistas separadas`, 100)
  return result
}

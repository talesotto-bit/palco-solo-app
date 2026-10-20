/**
 * Separação de pistas por IA (Demucs 6 pistas no Replicate).
 *
 *   POST /api/separate  { audioUrl }  → { id }
 *   GET  /api/separate?id=…           → { status, output, error }
 *
 * O áudio de entrada vem do Vercel Blob (ver /api/blob-upload) e é apagado
 * quando a separação termina. As pistas prontas são baixadas pelo navegador
 * e guardadas no aparelho do cliente.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { del } from '@vercel/blob'

const DEMUCS_VERSION = '25a173108cff36ef9f80f854c162d01df9e6528be175794b81158fa03836d953'
const REPLICATE_API = 'https://api.replicate.com/v1/predictions'
const BLOB_HOST_SUFFIX = '.public.blob.vercel-storage.com'

function isOurBlob(url: unknown): url is string {
  if (typeof url !== 'string') return false
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && u.hostname.endsWith(BLOB_HOST_SUFFIX) && u.pathname.startsWith('/separacoes/')
  } catch {
    return false
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = process.env.REPLICATE_API_TOKEN
  if (!token) {
    return res.status(503).json({ error: 'Separação indisponível no momento: chave da IA não configurada.' })
  }
  const auth = { Authorization: `Bearer ${token}` }

  try {
    if (req.method === 'POST') {
      const { audioUrl } = (req.body ?? {}) as { audioUrl?: string }
      // Só aceita arquivos enviados pelo próprio app, para ninguém usar a IA com URLs de fora
      if (!isOurBlob(audioUrl)) return res.status(400).json({ error: 'Arquivo de áudio inválido.' })

      const r = await fetch(REPLICATE_API, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: DEMUCS_VERSION,
          input: {
            audio: audioUrl,
            model_name: 'htdemucs_6s', // voz, bateria, baixo, guitarra/violão, teclado, outros
            output_format: 'mp3',
            mp3_bitrate: 320,
            clip_mode: 'rescale',
          },
        }),
      })
      const prediction = await r.json()
      if (!r.ok || prediction.error) {
        return res.status(502).json({ error: prediction.detail || prediction.error || 'Falha ao iniciar a separação.' })
      }
      return res.status(200).json({ id: prediction.id, status: prediction.status })
    }

    if (req.method === 'GET') {
      const id = req.query.id
      if (typeof id !== 'string' || !/^[a-z0-9]+$/i.test(id)) {
        return res.status(400).json({ error: 'id inválido' })
      }
      const r = await fetch(`${REPLICATE_API}/${id}`, { headers: auth })
      const prediction = await r.json()
      if (!r.ok) return res.status(502).json({ error: prediction.detail || 'Falha ao consultar a separação.' })

      const done = ['succeeded', 'failed', 'canceled'].includes(prediction.status)
      if (done && isOurBlob(prediction.input?.audio)) {
        await del(prediction.input.audio).catch(() => {})
      }
      return res.status(200).json({
        status: prediction.status,
        output: prediction.status === 'succeeded' ? prediction.output : undefined,
        error: prediction.error || undefined,
      })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message })
  }
}

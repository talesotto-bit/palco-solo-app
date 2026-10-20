/**
 * Autoriza o envio direto do navegador para o Vercel Blob (arquivos grandes
 * não passam pelo limite de 4,5 MB das funções). Usado pelo separador de pistas.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'

const MAX_BYTES = 50 * 1024 * 1024

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ error: 'Armazenamento de upload não configurado.' })
  }

  try {
    const result = await handleUpload({
      body: req.body as HandleUploadBody,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith('separacoes/')) throw new Error('Caminho inválido')
        return {
          allowedContentTypes: ['audio/*'],
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: true,
        }
      },
      // O arquivo é apagado pelo /api/separate quando a separação termina
      onUploadCompleted: async () => {},
    })
    return res.status(200).json(result)
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message })
  }
}

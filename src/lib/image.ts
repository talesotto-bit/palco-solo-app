/** Reduz uma foto para capa (quadrada, ~10 KB) e devolve como data URL — cabe nos dados salvos do aparelho */
export async function toCoverDataUrl(file: Blob, size = 240): Promise<string | null> {
  try {
    const bmp = await createImageBitmap(file)
    const side = Math.min(bmp.width, bmp.height)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size)
    bmp.close?.()
    return canvas.toDataURL('image/jpeg', 0.75)
  } catch { return null }
}

/** Capa escolhida pelo músico (foto) — não deve ser trocada pela capa da internet */
export function isCustomCover(url?: string) { return !!url && url.startsWith('data:image/jpeg') }

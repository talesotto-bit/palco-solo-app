/**
 * Artes do QR de pedidos geradas no aparelho (canvas): story do Instagram e cartaz para imprimir.
 */
import qrcode from 'qrcode-generator'
import type { RequestTheme } from '@/components/pedidos/themes'

export type ArtKind = 'story' | 'cartaz'

const SIZES: Record<ArtKind, [number, number]> = { story: [1080, 1920], cartaz: [1240, 1754] }

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, start: number, weight = 900) {
  let size = start
  do { ctx.font = `${weight} ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`; size -= 4 } while (ctx.measureText(text).width > maxW && size > 20)
}

export async function renderArt(kind: ArtKind, opts: { link: string; artist: string; theme: RequestTheme; hasPix: boolean }): Promise<Blob> {
  const [W, H] = SIZES[kind]
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const ctx = c.getContext('2d')!
  const { theme: th } = opts

  // fundo
  ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H)
  const glow = (x: number, y: number, r: number, color: string, a: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, color + Math.round(a * 255).toString(16).padStart(2, '0')); g.addColorStop(1, color + '00')
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
  }
  glow(W * 0.15, H * 0.12, W * 0.9, th.accent, 0.55)
  glow(W * 0.95, H * 0.45, W * 0.8, th.accent2, 0.45)
  glow(W * 0.3, H * 1.0, W * 0.9, th.accent, 0.35)

  const pad = W * 0.08
  ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff'
  // selo ao vivo
  const top = kind === 'story' ? H * 0.1 : H * 0.07
  ctx.font = `800 ${W * 0.032}px system-ui, sans-serif`
  const live = '●  AO VIVO HOJE'
  const lw = ctx.measureText(live).width + W * 0.06
  roundRect(ctx, (W - lw) / 2, top - W * 0.045, lw, W * 0.07, W * 0.035); ctx.fillStyle = 'rgba(239,68,68,0.9)'; ctx.fill()
  ctx.fillStyle = '#fff'; ctx.fillText(live, W / 2, top + W * 0.004)

  // títulos
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.font = `800 ${W * 0.05}px system-ui, sans-serif`
  ctx.fillText('PEÇA SUA MÚSICA', W / 2, top + W * 0.12)
  ctx.fillStyle = '#fff'
  fitText(ctx, opts.artist, W - pad * 2, W * 0.13)
  ctx.fillText(opts.artist, W / 2, top + W * 0.26)

  // QR em cartão branco
  const qr = qrcode(0, 'L'); qr.addData(opts.link); qr.make()
  const n = qr.getModuleCount()
  const card = kind === 'story' ? W * 0.72 : W * 0.56
  const cx = (W - card) / 2, cy = kind === 'story' ? H * 0.33 : H * 0.27
  ctx.save(); ctx.shadowColor = th.accent; ctx.shadowBlur = W * 0.08
  roundRect(ctx, cx, cy, card, card, W * 0.05); ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore()
  const inner = card * 0.88, cell = inner / n, ox = cx + (card - inner) / 2, oy = cy + (card - inner) / 2
  ctx.fillStyle = '#000'
  for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) if (qr.isDark(r, col)) ctx.fillRect(ox + col * cell, oy + r * cell, Math.ceil(cell), Math.ceil(cell))

  // instruções
  let y = cy + card + W * 0.12
  ctx.fillStyle = '#fff'; ctx.font = `900 ${W * 0.06}px system-ui, sans-serif`
  ctx.fillText('Aponte a câmera 📷', W / 2, y)
  y += W * 0.075
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = `700 ${W * 0.042}px system-ui, sans-serif`
  ctx.fillText('Escolha a música e mande seu pedido', W / 2, y)
  if (opts.hasPix) {
    y += W * 0.11
    const pill = 'Gorjeta via Pix 💸'
    ctx.font = `900 ${W * 0.048}px system-ui, sans-serif`
    const pw = ctx.measureText(pill).width + W * 0.1
    const grad = ctx.createLinearGradient((W - pw) / 2, 0, (W + pw) / 2, 0); grad.addColorStop(0, th.accent); grad.addColorStop(1, th.accent2)
    roundRect(ctx, (W - pw) / 2, y - W * 0.065, pw, W * 0.1, W * 0.05); ctx.fillStyle = grad; ctx.fill()
    ctx.fillStyle = th.ink; ctx.fillText(pill, W / 2, y + W * 0.005)
  }
  ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.font = `600 ${W * 0.026}px system-ui, sans-serif`
  ctx.fillText('feito com o app Power Tom', W / 2, H - (kind === 'story' ? W * 0.06 : W * 0.03))

  return new Promise(res => c.toBlob(b => res(b!), 'image/png'))
}

/** Compartilha (celular) ou baixa (computador) a arte */
export async function shareOrDownload(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: 'image/png' })
  // celular: abre o compartilhar (Instagram, WhatsApp, Fotos); computador: baixa o arquivo
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  if (mobile) {
    try {
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file] }); return }
    } catch (e: any) { if (e?.name === 'AbortError') return }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click()
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url) }, 500)
}

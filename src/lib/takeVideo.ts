/**
 * Vídeo vertical (Stories/Reels/Status) da gravação: capa da música, nome, ondas que pulsam com o som,
 * barra de tempo e a marca "Gravado no Power Tom". Feito no aparelho, em tempo real (canvas + MediaRecorder).
 */
import { audioEngine } from '@/audio/AudioEngine'

const W = 720, H = 1280, FPS = 30
export const VIDEO_MAX_SECONDS = 60

export function videoSupported(): boolean {
  return typeof MediaRecorder !== 'undefined' && !!pickMime() && typeof HTMLCanvasElement.prototype.captureStream === 'function'
}

function pickMime(): string | null {
  const opts = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
  return opts.find(m => { try { return MediaRecorder.isTypeSupported(m) } catch { return false } }) || null
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise(res => {
    if (!src) return res(null)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => res(img)
    img.onerror = () => res(null)
    img.src = src
  })
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/), lines: string[] = []
  let line = ''
  for (const w of words) {
    const t = line ? `${line} ${w}` : w
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w } else line = t
  }
  if (line) lines.push(line)
  return lines.slice(0, 2)
}

/** Energia do som por quadro do vídeo (as barras pulsam com a música de verdade) */
function envelope(buf: AudioBuffer, frames: number): Float32Array {
  const d = buf.getChannelData(0), per = Math.floor(buf.sampleRate / FPS), env = new Float32Array(frames)
  let max = 0
  for (let f = 0; f < frames; f++) {
    let sq = 0, n = 0
    for (let i = f * per; i < Math.min(d.length, (f + 1) * per); i += 16) { sq += d[i] * d[i]; n++ }
    env[f] = n ? Math.sqrt(sq / n) : 0
    if (env[f] > max) max = env[f]
  }
  if (max > 0) for (let f = 0; f < frames; f++) env[f] /= max
  return env
}

export async function renderTakeVideo(audio: AudioBuffer, meta: { title: string; artist: string; coverUrl?: string; who?: string },
  onProgress?: (p: number) => void, signal?: { cancelled: boolean }): Promise<Blob | null> {
  const ctx = audioEngine.audioContext
  const mime = pickMime()
  if (!ctx || !mime) return null
  const secs = Math.min(VIDEO_MAX_SECONDS, audio.duration)
  const frames = Math.ceil(secs * FPS)
  const env = envelope(audio, frames)
  const cover = await loadImage(meta.coverUrl && !meta.coverUrl.startsWith('data:') ? meta.coverUrl : meta.coverUrl || '')

  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const g = canvas.getContext('2d')!
  const stream = canvas.captureStream(FPS)
  const dest = ctx.createMediaStreamDestination()
  const src = ctx.createBufferSource()
  src.buffer = audio
  src.connect(dest)
  dest.stream.getAudioTracks().forEach(t => stream.addTrack(t))
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 3_000_000, audioBitsPerSecond: 160_000 })
  const parts: Blob[] = []
  rec.ondataavailable = e => { if (e.data.size) parts.push(e.data) }
  const done = new Promise<void>(r => { rec.onstop = () => r() })

  const bars = 48
  const draw = (t: number) => {
    const f = Math.min(frames - 1, Math.floor(t * FPS)), e = env[f] || 0
    // fundo: capa desfocada + escurecido
    g.fillStyle = '#0b0b0b'; g.fillRect(0, 0, W, H)
    if (cover) {
      g.save(); g.filter = 'blur(40px) brightness(0.45)'
      g.drawImage(cover, -200, -200, W + 400, H + 400); g.restore()
    }
    const grad = g.createLinearGradient(0, 0, 0, H)
    grad.addColorStop(0, 'rgba(0,0,0,0.1)'); grad.addColorStop(1, 'rgba(0,0,0,0.75)')
    g.fillStyle = grad; g.fillRect(0, 0, W, H)
    // capa pulsando
    const size = 470 * (1 + e * 0.04), cx = W / 2, cy = 470
    g.save(); g.shadowColor = 'rgba(34,197,94,0.55)'; g.shadowBlur = 30 + e * 60
    g.beginPath(); g.roundRect(cx - size / 2, cy - size / 2, size, size, 28); g.closePath()
    if (cover) { g.clip(); g.drawImage(cover, cx - size / 2, cy - size / 2, size, size) } else { g.fillStyle = '#1f2937'; g.fill() }
    g.restore()
    // título e artista
    g.textAlign = 'center'; g.fillStyle = '#fff'; g.font = '800 54px system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    wrap(g, meta.title, W - 100).forEach((l, i) => g.fillText(l, cx, 800 + i * 62))
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.font = '500 34px system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    g.fillText(meta.who ? `${meta.who} · versão de ${meta.artist}` : meta.artist, cx, 920)
    // ondas
    const bw = (W - 140) / bars
    for (let i = 0; i < bars; i++) {
      const k = env[Math.max(0, f - Math.abs(i - bars / 2))] || 0
      const h = 10 + k * 120 * (0.6 + 0.4 * Math.sin(i * 1.7 + t * 6) ** 2)
      g.fillStyle = i / bars < t / secs ? '#22c55e' : 'rgba(255,255,255,0.35)'
      g.beginPath(); g.roundRect(70 + i * bw + 2, 1060 - h / 2, bw - 4, h, 4); g.fill()
    }
    // marca
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.font = '700 30px system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    g.fillText('🎙️ Gravado no Power Tom', cx, 1190)
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.font = '500 24px system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    g.fillText('powertom.com.br', cx, 1228)
  }

  draw(0)
  rec.start(1000)
  const start = ctx.currentTime + 0.1
  src.start(start, 0, secs)
  await new Promise<void>(resolve => {
    const tick = () => {
      const t = ctx.currentTime - start
      if (signal?.cancelled || t >= secs) { resolve(); return }
      draw(Math.max(0, t)); onProgress?.(Math.max(0, t) / secs)
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  try { src.stop() } catch {}
  rec.stop()
  await done
  src.disconnect()
  stream.getTracks().forEach(t => t.stop())
  if (signal?.cancelled) return null
  return new Blob(parts, { type: mime.split(';')[0] })
}

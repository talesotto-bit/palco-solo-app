/**
 * Pacote Multipistas: baixa as pistas separadas da música em um .zip
 * (para usar na mesa digital, no notebook, no Ableton ou em outro app de playback).
 */
import { zip } from 'fflate'
import { audioCandidates } from '@/lib/audioHost'
import type { Track } from '@/types/track'

const clean = (s: string) => s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim()

async function fetchStem(url: string): Promise<Uint8Array> {
  let last: unknown
  for (const [i, u] of [...audioCandidates(url), ...audioCandidates(url)].entries()) {
    try {
      const r = await fetch(u)
      if (r.ok) return new Uint8Array(await r.arrayBuffer())
      last = new Error(`HTTP ${r.status}`)
    } catch (e) { last = e }
    await new Promise(r => setTimeout(r, 500 * (i + 1)))
  }
  throw last
}

/** Baixa todas as pistas e entrega um .zip ("Artista - Música/01 - Bateria.mp3"). Devolve quantas pistas foram. */
export async function downloadStemsZip(track: Track, onProgress?: (done: number, total: number) => void): Promise<number> {
  const stems = track.stems.filter(s => !s.derive && /^https?:\/\//.test(s.audioUrl))
  if (!stems.length) throw new Error('sem pistas')
  const folder = clean(`${track.artist ? track.artist + ' - ' : ''}${track.title}`) || 'Musica'
  const files: Record<string, [Uint8Array, { level: 0 }]> = {}
  const used = new Set<string>()
  let done = 0
  // 3 por vez: rápido sem engasgar o celular
  const queue = stems.map((s, i) => ({ s, i }))
  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const ext = (job.s.audioUrl.split('?')[0].match(/\.(mp3|wav|m4a|ogg|flac)$/i)?.[1] || 'mp3').toLowerCase()
      let name = `${String(job.i + 1).padStart(2, '0')} - ${clean(job.s.label) || 'Pista'}`
      while (used.has(name)) name += ' (2)'
      used.add(name)
      files[`${folder}/${name}.${ext}`] = [await fetchStem(job.s.audioUrl), { level: 0 }] // MP3 já é comprimido
      onProgress?.(++done, stems.length)
    }
  }
  await Promise.all([worker(), worker(), worker()])
  const data = await new Promise<Uint8Array>((res, rej) => zip(files, (err, out) => (err ? rej(err) : res(out))))
  const blob = new Blob([data as BlobPart], { type: 'application/zip' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${folder} (VS Power Tom).zip`
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 60000)
  return stems.length
}

/**
 * Link do setlist para a banda: nome do show, músicas, tom (já com o ajuste do cantor), BPM e observações.
 * Os dados vão compactados no próprio link (nada fica em servidor).
 */
import { transposeKey, formatTons } from '@/lib/musicTheory'
import type { Show } from '@/store/showsStore'
import type { Track } from '@/types/track'
import type { TrackSettings } from '@/store/trackSettingsStore'

export interface SharedShowData {
  v: 1
  n: string
  d?: string
  l?: string
  /** [música, artista, tom, bpm, observação] */
  s: [string, string, string?, number?, string?][]
}

function b64url(bytes: Uint8Array) {
  let bin = ''; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function fromB64url(s: string) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))
  const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out
}
async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream) {
  return new Uint8Array(await new Response(new Blob([data as BlobPart]).stream().pipeThrough(stream)).arrayBuffer())
}

/** Tom que a banda deve tocar: tom original + ajuste salvo do cantor */
export function keyFor(t: Track | undefined, st: TrackSettings | undefined): string | undefined {
  const shift = Math.round(st?.pitch || 0)
  if (t?.keyNote) return shift ? transposeKey(t.keyNote, shift) : t.keyNote
  return shift ? `playback ${formatTons(shift)}` : undefined
}

export function buildSharedShow(show: Show, byId: Map<string, Track>, settings: Record<string, TrackSettings>): SharedShowData {
  return {
    v: 1, n: show.name, d: show.date, l: show.venue,
    s: show.songs.map(s => {
      const t = byId.get(s.trackId)
      return [t?.title || s.title, t?.artist || s.artist, keyFor(t, settings[s.trackId]), t?.bpm || undefined, s.note]
    }),
  }
}

export async function encodeShow(data: SharedShowData): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(data))
  if (typeof CompressionStream !== 'undefined') { try { return 'z' + b64url(await pipe(json, new CompressionStream('deflate-raw'))) } catch {} }
  return 'j' + b64url(json)
}

export async function decodeShow(hash: string): Promise<SharedShowData | null> {
  try {
    let bytes = fromB64url(hash.slice(1))
    if (hash[0] === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'))
    else if (hash[0] !== 'j') return null
    const d = JSON.parse(new TextDecoder().decode(bytes))
    return d?.v === 1 && Array.isArray(d.s) ? d : null
  } catch { return null }
}

/** Texto do setlist para colar no WhatsApp */
export function showAsText(d: SharedShowData): string {
  const head = [`🎤 *${d.n}*`, [d.d && new Date(d.d + 'T12:00').toLocaleDateString('pt-BR'), d.l].filter(Boolean).join(' · ')].filter(Boolean)
  const lines = d.s.map(([t, a, k, b, n], i) => `${i + 1}. ${t}${a ? ` — ${a}` : ''}${k ? ` · Tom: ${k}` : ''}${b ? ` · ${b} BPM` : ''}${n ? `\n   📝 ${n}` : ''}`)
  return [...head, '', ...lines].join('\n')
}

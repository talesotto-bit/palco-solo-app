/**
 * Lê nome, artista e capa gravados dentro do MP3 (ID3v2).
 * Arquivos que chegam pelo WhatsApp vêm como "AUD-2024…", mas o nome da música costuma estar nas tags.
 */
export interface AudioTags { title?: string; artist?: string; picture?: Blob }

function syncsafe(b: Uint8Array, o: number) { return ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f) }
function u32(b: Uint8Array, o: number) { return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0 }

function decodeText(enc: number, data: Uint8Array): string {
  const label = enc === 1 ? 'utf-16' : enc === 2 ? 'utf-16be' : enc === 3 ? 'utf-8' : 'latin1'
  try { return new TextDecoder(label).decode(data).replace(/\0+$/g, '').replace(/\0/g, ' / ').trim() } catch { return '' }
}

/** Fim de um texto terminado em zero (1 byte em latin1/utf-8, 2 bytes em utf-16) */
function textEnd(b: Uint8Array, from: number, enc: number): number {
  if (enc === 1 || enc === 2) { for (let i = from; i + 1 < b.length; i += 2) if (b[i] === 0 && b[i + 1] === 0) return i; return b.length }
  for (let i = from; i < b.length; i++) if (b[i] === 0) return i
  return b.length
}

export async function readAudioTags(file: Blob): Promise<AudioTags> {
  try {
    const head = new Uint8Array(await file.slice(0, 10).arrayBuffer())
    if (head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return {} // "ID3"
    const ver = head[3]
    if (ver < 2 || ver > 4) return {}
    const size = syncsafe(head, 6)
    const b = new Uint8Array(await file.slice(10, 10 + Math.min(size, 8_000_000)).arrayBuffer())
    const out: AudioTags = {}
    let o = 0
    if (head[5] & 0x40 && ver >= 3) o += ver === 4 ? syncsafe(b, 0) : u32(b, 0) + 4 // cabeçalho estendido
    const idLen = ver === 2 ? 3 : 4
    while (o + idLen * 2 + 2 < b.length) {
      const id = String.fromCharCode(...b.subarray(o, o + idLen))
      if (!/^[A-Z0-9]+$/.test(id)) break
      const len = ver === 2 ? (b[o + 3] << 16) | (b[o + 4] << 8) | b[o + 5] : ver === 4 ? syncsafe(b, o + 4) : u32(b, o + 4)
      const start = o + (ver === 2 ? 6 : 10)
      if (len <= 0 || start + len > b.length) break
      const data = b.subarray(start, start + len)
      if (id === 'TIT2' || id === 'TT2') out.title = decodeText(data[0], data.subarray(1))
      else if (id === 'TPE1' || id === 'TP1') out.artist = decodeText(data[0], data.subarray(1))
      else if ((id === 'APIC' || id === 'PIC') && !out.picture) {
        const enc = data[0]
        let p = 1, mime = 'image/jpeg'
        if (id === 'APIC') { const e = textEnd(data, p, 0); mime = decodeText(0, data.subarray(p, e)) || mime; p = e + 1 } else p += 3
        p += 1 // tipo da imagem
        p = textEnd(data, p, enc) + (enc === 1 || enc === 2 ? 2 : 1) // descrição
        if (p < data.length) out.picture = new Blob([data.slice(p) as BlobPart], { type: mime.includes('/') ? mime : 'image/' + mime.toLowerCase() })
      }
      o = start + len
    }
    return out
  } catch { return {} }
}

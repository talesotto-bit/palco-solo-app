/**
 * MP3 encoder — converts AudioBuffer to 192kbps stereo MP3 via lamejs
 */

// @ts-expect-error lamejs has no type declarations
import lamejs from 'lamejs'

const KBPS = 192
const CHUNK = 1152 // MP3 frame size — must match LAME's internal frame size

export function encodeMp3(buffer: AudioBuffer): Blob {
  const sampleRate = buffer.sampleRate
  const length = buffer.length
  const channels = Math.min(buffer.numberOfChannels, 2)

  const encoder = new lamejs.Mp3Encoder(channels, sampleRate, KBPS)
  const mp3Chunks: Uint8Array[] = []

  // Convert float [-1,1] → Int16 [-32768,32767]
  const srcL = buffer.getChannelData(0)
  const srcR = channels > 1 ? buffer.getChannelData(1) : srcL

  const left = new Int16Array(length)
  const right = new Int16Array(length)
  for (let i = 0; i < length; i++) {
    const sL = Math.max(-1, Math.min(1, srcL[i]))
    const sR = Math.max(-1, Math.min(1, srcR[i]))
    left[i] = sL < 0 ? sL * 0x8000 : sL * 0x7FFF
    right[i] = sR < 0 ? sR * 0x8000 : sR * 0x7FFF
  }

  // Encode in chunks
  for (let offset = 0; offset < length; offset += CHUNK) {
    const end = Math.min(offset + CHUNK, length)
    const chunkL = left.subarray(offset, end)
    const chunkR = right.subarray(offset, end)

    // lamejs returns Int8Array or regular array depending on version
    const mp3buf = channels > 1
      ? encoder.encodeBuffer(chunkL, chunkR)
      : encoder.encodeBuffer(chunkL)

    if (mp3buf && mp3buf.length > 0) {
      // Normalize to Uint8Array regardless of what lamejs returns
      const u8 = new Uint8Array(mp3buf.length)
      for (let i = 0; i < mp3buf.length; i++) u8[i] = mp3buf[i] & 0xff
      mp3Chunks.push(u8)
    }
  }

  // Flush remaining
  const tail = encoder.flush()
  if (tail && tail.length > 0) {
    const u8 = new Uint8Array(tail.length)
    for (let i = 0; i < tail.length; i++) u8[i] = tail[i] & 0xff
    mp3Chunks.push(u8)
  }

  // Merge all chunks into a single Uint8Array for maximum compatibility
  let totalLength = 0
  for (const c of mp3Chunks) totalLength += c.length

  const merged = new Uint8Array(totalLength)
  let pos = 0
  for (const c of mp3Chunks) {
    merged.set(c, pos)
    pos += c.length
  }

  return new Blob([merged], { type: 'audio/mpeg' })
}

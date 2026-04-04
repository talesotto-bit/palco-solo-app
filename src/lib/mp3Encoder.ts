/**
 * MP3 encoder — converts AudioBuffer to 192kbps stereo MP3 via lamejs
 *
 * Encodes in chunks to avoid blocking the main thread for too long.
 */

// @ts-expect-error lamejs has no type declarations
import lamejs from 'lamejs'

const KBPS = 192
const CHUNK = 1152 // MP3 frame size

export function encodeMp3(buffer: AudioBuffer): Blob {
  const sampleRate = buffer.sampleRate
  const length = buffer.length
  const channels = Math.min(buffer.numberOfChannels, 2)

  const encoder = new lamejs.Mp3Encoder(channels, sampleRate, KBPS)
  const mp3Parts: BlobPart[] = []

  // Convert float [-1,1] → Int16 [-32768,32767]
  const srcL = buffer.getChannelData(0)
  const srcR = channels > 1 ? buffer.getChannelData(1) : srcL

  const left = new Int16Array(length)
  const right = new Int16Array(length)
  for (let i = 0; i < length; i++) {
    left[i] = Math.max(-32768, Math.min(32767, Math.round(srcL[i] * 32767)))
    right[i] = Math.max(-32768, Math.min(32767, Math.round(srcR[i] * 32767)))
  }

  // Encode in chunks
  for (let offset = 0; offset < length; offset += CHUNK) {
    const end = Math.min(offset + CHUNK, length)
    const chunkL = left.subarray(offset, end)
    const chunkR = right.subarray(offset, end)

    const mp3buf: Int8Array = channels > 1
      ? encoder.encodeBuffer(chunkL, chunkR)
      : encoder.encodeBuffer(chunkL)

    if (mp3buf.length > 0) {
      const copy = new Uint8Array(mp3buf.length)
      for (let i = 0; i < mp3buf.length; i++) copy[i] = mp3buf[i] & 0xff
      mp3Parts.push(copy.buffer as ArrayBuffer)
    }
  }

  // Flush remaining
  const tail: Int8Array = encoder.flush()
  if (tail.length > 0) {
    const copy = new Uint8Array(tail.length)
    for (let i = 0; i < tail.length; i++) copy[i] = tail[i] & 0xff
    mp3Parts.push(copy.buffer as ArrayBuffer)
  }

  return new Blob(mp3Parts, { type: 'audio/mpeg' })
}

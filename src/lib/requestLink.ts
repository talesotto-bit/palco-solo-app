/**
 * Link de pedidos do músico. Os dados (nome, Pix, WhatsApp e repertório) vão compactados no próprio
 * endereço, depois do "#": nada fica guardado em servidor e o link funciona para sempre.
 */

export interface RequestPage {
  v: 1
  n: string        // nome artístico
  w?: string       // WhatsApp (só dígitos, com 55)
  k?: string       // chave Pix (normalizada)
  pn?: string      // nome de quem recebe o Pix
  c?: string       // cidade (exigida pelo Pix)
  m?: string       // recado do músico para o público
  s: string[]      // repertório: "Música|Artista"
  t?: number       // tema de cor
  ig?: string      // Instagram do músico (sem @)
}

function toB64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const res = new Response(new Blob([data as BlobPart]).stream().pipeThrough(stream))
  return new Uint8Array(await res.arrayBuffer())
}

export async function encodeRequestPage(page: RequestPage): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(page))
  if (typeof CompressionStream !== 'undefined') {
    try { return 'z' + toB64Url(await pipe(json, new CompressionStream('deflate-raw'))) } catch {}
  }
  return 'j' + toB64Url(json)
}

export async function decodeRequestPage(hash: string): Promise<RequestPage | null> {
  try {
    const kind = hash[0], body = hash.slice(1)
    let bytes = fromB64Url(body)
    if (kind === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'))
    else if (kind !== 'j') return null
    const page = JSON.parse(new TextDecoder().decode(bytes))
    return page && page.v === 1 && Array.isArray(page.s) ? page : null
  } catch {
    return null
  }
}

export function requestUrl(encoded: string): string {
  return `${location.origin}/p#${encoded}`
}

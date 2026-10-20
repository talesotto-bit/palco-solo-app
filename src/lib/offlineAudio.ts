/**
 * offlineAudio — guarda no aparelho o áudio das músicas já abertas, para
 * tocarem sem internet (show sem sinal). Usa a Cache Storage do navegador,
 * com limite de espaço: quando passa do limite, apaga as menos usadas.
 */

const CACHE_NAME = 'audio-v1'
const INDEX_KEY = 'offline-audio-index-v1'
const MAX_BYTES = 1024 * 1024 * 1024 // 1 GB

type Index = Record<string, { size: number; t: number }>

function supported(): boolean {
  return typeof caches !== 'undefined'
}

function cacheable(url: string): boolean {
  return /^https?:\/\//.test(url)
}

function readIndex(): Index {
  try { return JSON.parse(localStorage.getItem(INDEX_KEY) || '{}') } catch { return {} }
}

function writeIndex(idx: Index) {
  try { localStorage.setItem(INDEX_KEY, JSON.stringify(idx)) } catch {}
}

let persistRequested = false
function requestPersistence() {
  if (persistRequested) return
  persistRequested = true
  try { navigator.storage?.persist?.() } catch {}
}

export async function getOfflineAudio(url: string): Promise<ArrayBuffer | null> {
  if (!supported() || !cacheable(url)) return null
  try {
    const cache = await caches.open(CACHE_NAME)
    const hit = await cache.match(url)
    if (!hit) return null
    const idx = readIndex()
    if (idx[url]) { idx[url].t = Date.now(); writeIndex(idx) }
    return await hit.arrayBuffer()
  } catch {
    return null
  }
}

export async function putOfflineAudio(url: string, data: ArrayBuffer): Promise<void> {
  if (!supported() || !cacheable(url)) return
  try {
    requestPersistence()
    const cache = await caches.open(CACHE_NAME)
    await cache.put(url, new Response(data, { headers: { 'Content-Type': 'audio/mpeg' } }))
    const idx = readIndex()
    idx[url] = { size: data.byteLength, t: Date.now() }

    // Apaga as menos usadas até caber no limite
    let total = Object.values(idx).reduce((sum, e) => sum + e.size, 0)
    const oldest = Object.entries(idx).sort((a, b) => a[1].t - b[1].t)
    for (const [key, entry] of oldest) {
      if (total <= MAX_BYTES) break
      if (key === url) continue
      await cache.delete(key)
      delete idx[key]
      total -= entry.size
    }
    writeIndex(idx)
  } catch {
    // Sem espaço ou modo privado: segue tocando online
  }
}

/** true se todas as pistas desta lista de URLs já estão salvas no aparelho */
export function isAvailableOffline(urls: string[]): boolean {
  const idx = readIndex()
  const remote = urls.filter(cacheable)
  return remote.length > 0 && remote.every(u => !!idx[u])
}

/**
 * audioCache — armazena arquivos de áudio no IndexedDB do navegador
 *
 * Permite que faixas importadas pelo usuário sobrevivam ao recarregar a página.
 * Blob URLs criados por URL.createObjectURL() são temporários e morrem ao fechar.
 * Aqui guardamos o ArrayBuffer real e recriamos o blob URL quando necessário.
 *
 * Chave de cache: `${trackId}/${stemId}` → ArrayBuffer
 */

const DB_NAME = 'palco-solo-audio-cache'
const DB_VERSION = 1
const STORE = 'files'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Track active blob URLs so we can revoke them to free memory */
const activeBlobUrls = new Map<string, string>()

export const AudioCache = {
  /** Guarda um File no IndexedDB e retorna a chave */
  async store(key: string, file: File): Promise<void> {
    try {
      const db = await openDB()
      const buffer = await file.arrayBuffer()
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        tx.objectStore(STORE).put({ buffer, type: file.type || 'audio/mpeg' }, key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    } catch (err) {
      console.warn('[AudioCache] store failed (quota/IDB error):', err)
    }
  },

  /** Recupera um blob URL temporário para uma chave armazenada */
  async getUrl(key: string): Promise<string | null> {
    // Return existing blob URL if still active (avoids leak)
    const existing = activeBlobUrls.get(key)
    if (existing) return existing

    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(key)
      req.onsuccess = () => {
        if (!req.result) { resolve(null); return }
        const { buffer, type } = req.result
        const blob = new Blob([buffer], { type })
        const url = URL.createObjectURL(blob)
        activeBlobUrls.set(key, url)
        resolve(url)
      }
      req.onerror = () => resolve(null)
    })
  },

  /** Revoke all active blob URLs to free memory */
  revokeAll(): void {
    activeBlobUrls.forEach(url => URL.revokeObjectURL(url))
    activeBlobUrls.clear()
  },

  /** Resolve múltiplas chaves de uma vez */
  async resolveMany(keys: string[]): Promise<Record<string, string>> {
    const results = await Promise.allSettled(
      keys.map(async k => [k, await this.getUrl(k)] as const)
    )
    const entries = results
      .filter((r): r is PromiseFulfilledResult<readonly [string, string | null]> => r.status === 'fulfilled')
      .map(r => r.value)
      .filter(([, url]) => url !== null)
    return Object.fromEntries(entries) as Record<string, string>
  },

  /** Remove um arquivo do cache */
  async remove(key: string): Promise<void> {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(key)
      tx.oncomplete = () => resolve()
    })
  },

  /** Remove todos os arquivos de uma faixa */
  async removeTrack(trackId: string): Promise<void> {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      const req = store.openCursor()
      req.onsuccess = () => {
        const cursor = req.result
        if (!cursor) return
        if (String(cursor.key).startsWith(trackId + '/')) {
          cursor.delete()
        }
        cursor.continue()
      }
      tx.oncomplete = () => resolve()
    })
  },

  /** Limpa todo o cache */
  async clearAll(): Promise<void> {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).clear()
      tx.oncomplete = () => resolve()
    })
  },
}

/** Prefixo que identifica uma URL de cache (não é blob real ainda) */
export const CACHE_PREFIX = 'cache://'

export function cacheKey(trackId: string, stemId: string) {
  return `${trackId}/${stemId}`
}

export function isCacheUrl(url: string) {
  return url.startsWith(CACHE_PREFIX)
}

export function urlToKey(url: string) {
  return url.slice(CACHE_PREFIX.length)
}

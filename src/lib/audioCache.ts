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

export const AudioCache = {
  /** Guarda um File no IndexedDB e retorna a chave */
  async store(key: string, file: File): Promise<void> {
    const db = await openDB()
    const buffer = await file.arrayBuffer()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put({ buffer, type: file.type || 'audio/mpeg' }, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  },

  /** Recupera um blob URL temporário para uma chave armazenada */
  async getUrl(key: string): Promise<string | null> {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(key)
      req.onsuccess = () => {
        if (!req.result) { resolve(null); return }
        const { buffer, type } = req.result
        const blob = new Blob([buffer], { type })
        resolve(URL.createObjectURL(blob))
      }
      req.onerror = () => resolve(null)
    })
  },

  /** Resolve múltiplas chaves de uma vez */
  async resolveMany(keys: string[]): Promise<Record<string, string>> {
    const entries = await Promise.all(
      keys.map(async k => [k, await this.getUrl(k)] as const)
    )
    return Object.fromEntries(entries.filter(([, url]) => url !== null)) as Record<string, string>
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

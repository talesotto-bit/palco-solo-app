/**
 * Cifras guardadas no aparelho:
 * - a cifra que o músico colou/editou para cada música (tem prioridade sobre a da internet);
 * - cópia das cifras encontradas na internet (para o show sem sinal);
 * - ajuste do tom da cifra para casar com o playback.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface CifraData {
  title: string
  artist: string
  content: string
  tuning?: string
  capo?: string
  source: string
}

interface CachedCifra extends CifraData { t: number }

const MAX_CACHE = 400

interface CifraState {
  own: Record<string, { text: string; t: number }>
  cache: Record<string, CachedCifra | { notFound: true; t: number }>
  offset: Record<string, number>
  setOwn: (trackId: string, text: string) => void
  removeOwn: (trackId: string) => void
  setCached: (trackId: string, data: CifraData | null) => void
  setOffset: (trackId: string, semitones: number) => void
}

export const useCifraStore = create<CifraState>()(
  persist(
    (set) => ({
      own: {},
      cache: {},
      offset: {},
      setOwn: (id, text) => set(s => ({ own: { ...s.own, [id]: { text, t: Date.now() } } })),
      removeOwn: (id) => set(s => { const own = { ...s.own }; delete own[id]; return { own } }),
      setCached: (id, data) => set(s => {
        const cache = { ...s.cache, [id]: data ? { ...data, t: Date.now() } : { notFound: true as const, t: Date.now() } }
        const keys = Object.keys(cache)
        if (keys.length > MAX_CACHE) {
          keys.sort((a, b) => cache[a].t - cache[b].t).slice(0, keys.length - MAX_CACHE).forEach(k => delete cache[k])
        }
        return { cache }
      }),
      // guarda entre -5 e +6 semitons (subir 7 = descer 5)
      setOffset: (id, semitones) => set(s => {
        let n = ((Math.round(semitones) % 12) + 12) % 12
        if (n > 6) n -= 12
        return { offset: { ...s.offset, [id]: n } }
      }),
    }),
    { name: 'cifras-v1' }
  )
)

/** Guarda a cifra no aparelho sem abrir a música (show sem internet). true = resolvida */
export async function prefetchCifra(trackId: string, artist: string, title: string): Promise<boolean> {
  if (useCifraStore.getState().own[trackId] || cachedCifra(trackId) !== undefined) return true
  try {
    const params = new URLSearchParams({ title })
    if (artist) params.set('artist', artist)
    const res = await fetch(`/api/cifra?${params}`)
    if (res.status === 404) { useCifraStore.getState().setCached(trackId, null); return true }
    if (!res.ok) return false
    useCifraStore.getState().setCached(trackId, await res.json())
    return true
  } catch { return false }
}

/** "não encontrada" fica guardado só por 1 dia (a cifra pode aparecer depois) */
export function cachedCifra(trackId: string): CifraData | null | undefined {
  const c = useCifraStore.getState().cache[trackId]
  if (!c) return undefined
  if ('notFound' in c) return Date.now() - c.t < 86400000 ? null : undefined
  return c
}

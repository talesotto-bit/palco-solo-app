/**
 * Letras que o músico colou ou sincronizou (têm prioridade sobre as da internet e ficam no aparelho).
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface OwnLyrics { plain: string; lrc?: string; t: number }

interface OwnLyricsState {
  items: Record<string, OwnLyrics>
  setPlain: (trackId: string, plain: string) => void
  setLrc: (trackId: string, lrc: string) => void
  remove: (trackId: string) => void
}

export const useOwnLyrics = create<OwnLyricsState>()(
  persist(
    (set) => ({
      items: {},
      setPlain: (id, plain) => set(s => ({ items: { ...s.items, [id]: { plain, lrc: undefined, t: Date.now() } } })),
      setLrc: (id, lrc) => set(s => ({ items: { ...s.items, [id]: { plain: s.items[id]?.plain || '', lrc, t: Date.now() } } })),
      remove: (id) => set(s => { const items = { ...s.items }; delete items[id]; return { items } }),
    }),
    { name: 'own-lyrics-v1' }
  )
)

/** Monta um LRC a partir das linhas e dos tempos marcados */
export function toLrc(lines: string[], times: number[]): string {
  const fmt = (t: number) => {
    const m = Math.floor(t / 60), s = t - m * 60
    return `[${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}]`
  }
  return lines.map((l, i) => (times[i] !== undefined ? `${fmt(times[i])} ${l}` : '')).filter(Boolean).join('\n')
}

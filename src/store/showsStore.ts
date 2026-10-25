/**
 * Shows (setlists) do músico: vários shows salvos no aparelho, cada um com suas músicas em ordem,
 * observações por música, data e local. O Modo Palco toca o show ativo.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Track } from '@/types/track'

export interface ShowSong {
  trackId: string
  title: string
  artist: string
  coverUrl: string
  note?: string
  /** trecho (medley): começa e/ou termina nestes segundos da música */
  start?: number
  end?: number
}

export interface Show {
  id: string
  name: string
  date?: string
  venue?: string
  songs: ShowSong[]
  createdAt: number
  updatedAt: number
  fromTemplate?: string
}

interface ShowsState {
  shows: Show[]
  activeShowId: string | null
  createShow: (name: string, songs?: ShowSong[], fromTemplate?: string) => string
  updateShow: (id: string, patch: Partial<Pick<Show, 'name' | 'date' | 'venue'>>) => void
  duplicateShow: (id: string) => string | null
  deleteShow: (id: string) => void
  setActive: (id: string | null) => void
  addSongs: (id: string, tracks: Track[]) => number
  removeSong: (id: string, index: number) => void
  moveSong: (id: string, from: number, to: number) => void
  setNote: (id: string, index: number, note: string) => void
  setRange: (id: string, index: number, range: { start?: number; end?: number }) => void
}

export function songFromTrack(t: Track): ShowSong {
  const cover = t.coverUrl && !t.coverUrl.startsWith('data:') ? t.coverUrl : ''
  return { trackId: t.id, title: t.title, artist: t.artist, coverUrl: cover }
}

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

/** Traz para cá o setlist das versões anteriores do app */
function migrateOld(): Show[] {
  const out: Show[] = []
  try {
    const old = JSON.parse(localStorage.getItem('palco-show') || '[]')
    if (Array.isArray(old) && old.length) {
      out.push({ id: uid(), name: 'Meu show', createdAt: Date.now(), updatedAt: Date.now(),
        songs: old.map((s: any) => ({ trackId: s.id, title: s.title, artist: s.artist, coverUrl: s.coverUrl?.startsWith('data:') ? '' : s.coverUrl || '' })) })
    }
  } catch {}
  try {
    const st = JSON.parse(localStorage.getItem('palco-setlist') || 'null')?.state
    if (st?.items?.length) {
      out.push({ id: uid(), name: st.name || 'Setlist', createdAt: Date.now(), updatedAt: Date.now(),
        songs: st.items.map((s: any) => ({ trackId: s.trackId, title: s.title, artist: s.artist, coverUrl: s.coverUrl?.startsWith('data:') ? '' : s.coverUrl || '', note: s.notes || undefined })) })
    }
  } catch {}
  return out
}

export const useShowsStore = create<ShowsState>()(
  persist(
    (set, get) => ({
      shows: migrateOld(),
      activeShowId: null,

      createShow: (name, songs = [], fromTemplate) => {
        const id = uid()
        const show: Show = { id, name: name.trim() || 'Novo show', songs, createdAt: Date.now(), updatedAt: Date.now(), fromTemplate }
        set(s => ({ shows: [show, ...s.shows], activeShowId: id }))
        return id
      },

      updateShow: (id, patch) => set(s => ({
        shows: s.shows.map(sh => sh.id === id ? { ...sh, ...patch, updatedAt: Date.now() } : sh),
      })),

      duplicateShow: (id) => {
        const src = get().shows.find(s => s.id === id)
        if (!src) return null
        const nid = uid()
        set(s => ({ shows: [{ ...src, id: nid, name: `${src.name} (cópia)`, createdAt: Date.now(), updatedAt: Date.now() }, ...s.shows] }))
        return nid
      },

      deleteShow: (id) => set(s => ({
        shows: s.shows.filter(sh => sh.id !== id),
        activeShowId: s.activeShowId === id ? null : s.activeShowId,
      })),

      setActive: (id) => set({ activeShowId: id }),

      addSongs: (id, tracks) => {
        let added = 0
        set(s => ({
          shows: s.shows.map(sh => {
            if (sh.id !== id) return sh
            const have = new Set(sh.songs.map(x => x.trackId))
            const fresh = tracks.filter(t => !have.has(t.id)).map(songFromTrack)
            added = fresh.length
            return { ...sh, songs: [...sh.songs, ...fresh], updatedAt: Date.now() }
          }),
        }))
        return added
      },

      removeSong: (id, index) => set(s => ({
        shows: s.shows.map(sh => sh.id === id ? { ...sh, songs: sh.songs.filter((_, i) => i !== index), updatedAt: Date.now() } : sh),
      })),

      moveSong: (id, from, to) => set(s => ({
        shows: s.shows.map(sh => {
          if (sh.id !== id || from === to || to < 0 || to >= sh.songs.length) return sh
          const songs = [...sh.songs]
          const [m] = songs.splice(from, 1)
          songs.splice(to, 0, m)
          return { ...sh, songs, updatedAt: Date.now() }
        }),
      })),

      setNote: (id, index, note) => set(s => ({
        shows: s.shows.map(sh => sh.id === id
          ? { ...sh, songs: sh.songs.map((x, i) => i === index ? { ...x, note: note || undefined } : x), updatedAt: Date.now() }
          : sh),
      })),
      setRange: (id, index, range) => set(s => ({
        shows: s.shows.map(sh => sh.id === id
          ? { ...sh, songs: sh.songs.map((x, i) => i === index ? { ...x, start: range.start || undefined, end: range.end || undefined } : x), updatedAt: Date.now() }
          : sh),
      })),
    }),
    { name: 'shows-v1' }
  )
)

/**
 * localTracksStore — biblioteca persistente do usuário
 *
 * Metadados das faixas ficam no localStorage (via Zustand persist).
 * Os arquivos de áudio ficam no IndexedDB (via AudioCache).
 * As audioUrls armazenadas usam o prefixo "cache://" e são resolvidas
 * para blob URLs reais no momento de reprodução.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { AudioCache, CACHE_PREFIX, urlToKey, isCacheUrl } from '@/lib/audioCache'
import type { Track } from '@/types/track'

interface LocalTracksStore {
  tracks: Track[]
  addTracks: (tracks: Track[]) => void
  removeTrack: (id: string) => Promise<void>
  clearAll: () => Promise<void>
  /** Resolve cache:// URLs de uma faixa para blob URLs reais antes de tocar */
  resolveTrackUrls: (track: Track) => Promise<Track>
}

export const useLocalTracksStore = create<LocalTracksStore>()(
  persist(
    (set, get) => ({
      tracks: [],

      addTracks: (newTracks) =>
        set(s => {
          const existingIds = new Set(s.tracks.map(t => t.id))
          const toAdd = newTracks.filter(t => !existingIds.has(t.id))
          return { tracks: [...s.tracks, ...toAdd] }
        }),

      removeTrack: async (id) => {
        await AudioCache.removeTrack(id)
        set(s => ({ tracks: s.tracks.filter(t => t.id !== id) }))
      },

      clearAll: async () => {
        await AudioCache.clearAll()
        set({ tracks: [] })
      },

      resolveTrackUrls: async (track) => {
        // Coleta todas as cache:// keys dos stems
        const cacheKeys = track.stems
          .filter(s => isCacheUrl(s.audioUrl))
          .map(s => urlToKey(s.audioUrl))

        if (cacheKeys.length === 0) return track

        const resolved = await AudioCache.resolveMany(cacheKeys)

        return {
          ...track,
          stems: track.stems.map(stem => ({
            ...stem,
            audioUrl: isCacheUrl(stem.audioUrl)
              ? (resolved[urlToKey(stem.audioUrl)] ?? stem.audioUrl)
              : stem.audioUrl,
          })),
        }
      },
    }),
    {
      name: 'palco-solo-library',
      // Não persiste funções — só os dados
      partialize: (s) => ({ tracks: s.tracks }),
    }
  )
)

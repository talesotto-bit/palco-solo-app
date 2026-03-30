import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface FavoritesState {
  ids: string[]
  isFavorite: (trackId: string) => boolean
  toggle: (trackId: string) => void
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      ids: [],
      isFavorite: (trackId: string) => get().ids.includes(trackId),
      toggle: (trackId: string) => {
        const ids = get().ids
        if (ids.includes(trackId)) {
          set({ ids: ids.filter(id => id !== trackId) })
        } else {
          set({ ids: [...ids, trackId] })
        }
      },
    }),
    { name: 'palco-favorites' }
  )
)

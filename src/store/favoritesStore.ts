import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface FavoritesState {
  ids: string[]
  _set: Set<string>
  isFavorite: (trackId: string) => boolean
  toggle: (trackId: string) => void
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      ids: [],
      _set: new Set<string>(),
      isFavorite: (trackId: string) => get()._set.has(trackId),
      toggle: (trackId: string) => {
        const { ids, _set } = get()
        if (_set.has(trackId)) {
          const newSet = new Set(_set)
          newSet.delete(trackId)
          set({ ids: ids.filter(id => id !== trackId), _set: newSet })
        } else {
          const newSet = new Set(_set)
          newSet.add(trackId)
          set({ ids: [...ids, trackId], _set: newSet })
        }
      },
    }),
    {
      name: 'palco-favorites',
      onRehydrateStorage: () => (state) => {
        if (state) state._set = new Set(state.ids)
      },
      partialize: (state) => ({ ids: state.ids }),
    }
  )
)

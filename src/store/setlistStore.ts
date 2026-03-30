import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface SetlistItem {
  trackId: string
  title: string
  artist: string
  coverUrl: string
  notes: string
}

interface SetlistState {
  name: string
  items: SetlistItem[]
  currentIndex: number

  setName: (name: string) => void
  add: (item: Omit<SetlistItem, 'notes'>) => void
  remove: (index: number) => void
  moveUp: (index: number) => void
  moveDown: (index: number) => void
  setNotes: (index: number, notes: string) => void
  setCurrent: (index: number) => void
  goNext: () => boolean
  goPrev: () => boolean
  clear: () => void
}

export const useSetlistStore = create<SetlistState>()(
  persist(
    (set, get) => ({
      name: 'Meu Show',
      items: [],
      currentIndex: 0,

      setName: (name) => set({ name }),

      add: (item) => {
        set(s => ({
          items: [...s.items, { ...item, notes: '' }],
        }))
      },

      remove: (index) => {
        set(s => {
          const items = s.items.filter((_, i) => i !== index)
          let currentIndex = s.currentIndex
          if (currentIndex >= items.length) currentIndex = Math.max(0, items.length - 1)
          else if (index < currentIndex) currentIndex--
          return { items, currentIndex }
        })
      },

      moveUp: (index) => {
        if (index <= 0) return
        set(s => {
          const items = [...s.items]
          ;[items[index - 1], items[index]] = [items[index], items[index - 1]]
          let currentIndex = s.currentIndex
          if (currentIndex === index) currentIndex--
          else if (currentIndex === index - 1) currentIndex++
          return { items, currentIndex }
        })
      },

      moveDown: (index) => {
        const { items } = get()
        if (index >= items.length - 1) return
        set(s => {
          const items = [...s.items]
          ;[items[index], items[index + 1]] = [items[index + 1], items[index]]
          let currentIndex = s.currentIndex
          if (currentIndex === index) currentIndex++
          else if (currentIndex === index + 1) currentIndex--
          return { items, currentIndex }
        })
      },

      setNotes: (index, notes) => {
        set(s => {
          const items = [...s.items]
          if (items[index]) items[index] = { ...items[index], notes }
          return { items }
        })
      },

      setCurrent: (index) => set({ currentIndex: index }),

      goNext: () => {
        const { currentIndex, items } = get()
        if (currentIndex < items.length - 1) {
          set({ currentIndex: currentIndex + 1 })
          return true
        }
        return false
      },

      goPrev: () => {
        const { currentIndex } = get()
        if (currentIndex > 0) {
          set({ currentIndex: currentIndex - 1 })
          return true
        }
        return false
      },

      clear: () => set({ items: [], currentIndex: 0, name: 'Meu Show' }),
    }),
    { name: 'palco-setlist' }
  )
)

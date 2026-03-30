import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

export function useSetlists() {
  const user = useAuthStore(s => s.user)

  return useQuery({
    queryKey: ['setlists', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('setlists')
        .select('*, setlist_items(count)')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!user,
  })
}

export function useSetlistItems(setlistId: string | undefined) {
  return useQuery({
    queryKey: ['setlist-items', setlistId],
    queryFn: async () => {
      if (!setlistId) return []
      const { data, error } = await supabase
        .from('setlist_items')
        .select('*, tracks(*)')
        .eq('setlist_id', setlistId)
        .order('position')
      if (error) throw error
      return data ?? []
    },
    enabled: !!setlistId,
  })
}

export function useCreateSetlist() {
  const queryClient = useQueryClient()
  const user = useAuthStore(s => s.user)

  return useMutation({
    mutationFn: async (name: string) => {
      if (!user) throw new Error('Não autenticado')
      const { data, error } = await supabase
        .from('setlists')
        .insert({ user_id: user.id, name })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['setlists'] })
    },
  })
}

export function useAddToSetlist() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ setlistId, trackId, position }: {
      setlistId: string
      trackId: string
      position: number
    }) => {
      const { error } = await supabase
        .from('setlist_items')
        .insert({ setlist_id: setlistId, track_id: trackId, position })
      if (error) throw error
    },
    onSuccess: (_, { setlistId }) => {
      queryClient.invalidateQueries({ queryKey: ['setlist-items', setlistId] })
    },
  })
}

export function useRemoveFromSetlist() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ itemId, setlistId }: { itemId: string; setlistId: string }) => {
      const { error } = await supabase
        .from('setlist_items')
        .delete()
        .eq('id', itemId)
      if (error) throw error
      return setlistId
    },
    onSuccess: (setlistId) => {
      queryClient.invalidateQueries({ queryKey: ['setlist-items', setlistId] })
    },
  })
}

export function useFavorites() {
  const user = useAuthStore(s => s.user)

  return useQuery({
    queryKey: ['favorites', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('favorites')
        .select('track_id, tracks(*)')
        .eq('user_id', user.id)
      if (error) throw error
      return data ?? []
    },
    enabled: !!user,
  })
}

export function useToggleFavorite() {
  const queryClient = useQueryClient()
  const user = useAuthStore(s => s.user)

  return useMutation({
    mutationFn: async ({ trackId, isFavorite }: { trackId: string; isFavorite: boolean }) => {
      if (!user) throw new Error('Não autenticado')
      if (isFavorite) {
        await supabase.from('favorites').delete().eq('user_id', user.id).eq('track_id', trackId)
      } else {
        await supabase.from('favorites').insert({ user_id: user.id, track_id: trackId })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] })
    },
  })
}

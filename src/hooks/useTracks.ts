import { useQuery, useInfiniteQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

const PAGE_SIZE = 50

interface TrackFilters {
  genre?: string
  search?: string
  stemsOnly?: boolean
}

export function useTracks(filters: TrackFilters = {}) {
  return useInfiniteQuery({
    queryKey: ['tracks', filters],
    queryFn: async ({ pageParam = 0 }) => {
      let query = supabase
        .from('tracks')
        .select('*')
        .eq('is_active', true)
        .order('name')
        .range(pageParam * PAGE_SIZE, (pageParam + 1) * PAGE_SIZE - 1)

      if (filters.genre) {
        query = query.eq('genre_id', filters.genre)
      }
      if (filters.stemsOnly) {
        query = query.eq('has_stems', true).gt('stem_count', 1)
      }
      if (filters.search) {
        query = query.textSearch('search_vector', filters.search, {
          type: 'websearch',
          config: 'portuguese',
        })
      }

      const { data, error } = await query
      if (error) throw error
      return data ?? []
    },
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.length === PAGE_SIZE ? allPages.length : undefined
    },
    initialPageParam: 0,
  })
}

export function useTrack(trackId: string | undefined) {
  return useQuery({
    queryKey: ['track', trackId],
    queryFn: async () => {
      if (!trackId) return null
      const { data, error } = await supabase
        .from('tracks')
        .select('*')
        .eq('id', trackId)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!trackId,
  })
}

export function useTrackStems(trackId: string | undefined) {
  return useQuery({
    queryKey: ['stems', trackId],
    queryFn: async () => {
      if (!trackId) return []
      const { data, error } = await supabase
        .from('stems')
        .select('*')
        .eq('track_id', trackId)
        .order('sort_order')
      if (error) throw error
      return data ?? []
    },
    enabled: !!trackId,
  })
}

export function useGenres() {
  return useQuery({
    queryKey: ['genres'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('genres')
        .select('*')
        .order('name')
      if (error) throw error
      return data ?? []
    },
    staleTime: 1000 * 60 * 30, // 30 min
  })
}

export function useTrackWithStems(trackId: string | undefined) {
  const track = useTrack(trackId)
  const stems = useTrackStems(trackId)

  return {
    track: track.data,
    stems: stems.data ?? [],
    isLoading: track.isLoading || stems.isLoading,
    error: track.error || stems.error,
  }
}

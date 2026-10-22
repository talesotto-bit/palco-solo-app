import { useEffect, useMemo } from 'react'
import { useCatalogStore } from '@/store/catalogStore'
import { useLocalTracksStore } from '@/store/localTracksStore'
import type { Track } from '@/types/track'

/** Todas as músicas (importadas + catálogo) e um mapa por id. Carrega o catálogo se precisar. */
export function useAllTracks() {
  const catalog = useCatalogStore(s => s.tracks)
  const loading = useCatalogStore(s => s.isLoading)
  const loadCatalog = useCatalogStore(s => s.loadCatalog)
  const local = useLocalTracksStore(s => s.tracks)

  useEffect(() => { if (!catalog.length && !loading) void loadCatalog() }, [catalog.length, loading, loadCatalog])

  const all = useMemo(() => [...local, ...catalog], [local, catalog])
  const byId = useMemo(() => {
    const m = new Map<string, Track>()
    for (const t of all) m.set(t.id, t)
    return m
  }, [all])
  return { all, byId, loading: loading || (!catalog.length && !local.length) }
}

/** Blocos/medleys do catálogo (sequências prontas de várias músicas) */
export function isMedley(t: Track): boolean {
  return t.tags?.includes('bloco') || /^(bloco|medley|especial|pot ?pourri)\b/i.test(t.title)
}

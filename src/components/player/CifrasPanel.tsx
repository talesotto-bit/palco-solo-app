import { useEffect, useState, useRef, useCallback } from 'react'
import { Loader2, Search, RotateCcw, Music } from 'lucide-react'
import { usePlayerStore } from '@/store/playerStore'

interface CifraData {
  title: string
  artist: string
  content: string
  tuning?: string
  capo?: string
  source: string
}

const FONT_SIZES = [12, 14, 16, 18, 20]

export function CifrasPanel() {
  const track = usePlayerStore(s => s.track)
  const [cifra, setCifra] = useState<CifraData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<'not_found' | 'fetch_error' | null>(null)
  const [fontIdx, setFontIdx] = useState(1)
  const [manualQuery, setManualQuery] = useState('')
  const [loadedTrackId, setLoadedTrackId] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const fetchCifra = useCallback(async (artist: string, title: string, trackId: string) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setIsLoading(true)
    setError(null)
    setCifra(null)

    try {
      const params = new URLSearchParams({ title })
      if (artist) params.set('artist', artist)
      const res = await fetch(`/api/cifra?${params}`, { signal: ctrl.signal })

      if (ctrl.signal.aborted) return

      if (res.status === 404) {
        setError('not_found')
        setLoadedTrackId(trackId)
        return
      }
      if (!res.ok) {
        setError('fetch_error')
        setLoadedTrackId(trackId)
        return
      }

      const data: CifraData = await res.json()
      setCifra(data)
      setLoadedTrackId(trackId)
    } catch (err: any) {
      if (err?.name === 'AbortError') return
      setError('fetch_error')
      setLoadedTrackId(trackId)
    } finally {
      if (!ctrl.signal.aborted) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!track) return
    if (loadedTrackId === track.id) return
    fetchCifra(track.artist, track.title, track.id)
  }, [track?.id, loadedTrackId, fetchCifra])

  useEffect(() => () => { abortRef.current?.abort() }, [])

  const fontSize = FONT_SIZES[fontIdx]

  if (!track) return null

  return (
    <div className="flex flex-col min-h-[300px] lg:h-full rounded-lg bg-white/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <p className="text-sm font-bold text-white">Cifra</p>
        {cifra && (
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-medium text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full mr-2">
              {cifra.source}
            </span>
            <button
              onClick={() => setFontIdx(i => Math.max(0, i - 1))}
              disabled={fontIdx === 0}
              className="h-7 w-7 rounded flex items-center justify-center text-xs font-bold text-[#b3b3b3] bg-white/5 hover:bg-white/10 disabled:opacity-30 transition-colors"
            >
              A-
            </button>
            <button
              onClick={() => setFontIdx(i => Math.min(FONT_SIZES.length - 1, i + 1))}
              disabled={fontIdx === FONT_SIZES.length - 1}
              className="h-7 w-7 rounded flex items-center justify-center text-sm font-bold text-[#b3b3b3] bg-white/5 hover:bg-white/10 disabled:opacity-30 transition-colors"
            >
              A+
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-4" style={{ WebkitOverflowScrolling: 'touch' }}>
        {isLoading && (
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
            <p className="text-sm text-[#b3b3b3]">Buscando cifra...</p>
          </div>
        )}

        {error === 'not_found' && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Music className="h-8 w-8 text-[#535353]" />
            <p className="text-sm text-[#808080] text-center">
              Cifra não encontrada
            </p>
            <p className="text-xs text-[#808080] text-center">
              Busque pelo artista e título
            </p>
            <form
              className="w-full max-w-xs"
              onSubmit={(e) => {
                e.preventDefault()
                if (manualQuery.trim()) {
                  const parts = manualQuery.split(/\s*[-–]\s*/)
                  const a = parts.length > 1 ? parts[0].trim() : track.artist
                  const t = parts.length > 1 ? parts[1].trim() : manualQuery.trim()
                  fetchCifra(a, t, track.id + '_manual')
                }
              }}
            >
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#808080]" />
                <input
                  type="text"
                  value={manualQuery}
                  onChange={(e) => setManualQuery(e.target.value)}
                  placeholder="Ex: Jorge e Mateus - Enquanto Houver"
                  className="w-full h-9 rounded-lg bg-[#2a2a2a] pl-9 pr-3 text-xs text-white placeholder:text-[#606060] border-0 outline-none focus:ring-1 focus:ring-white/20 transition"
                />
              </div>
              <button
                type="submit"
                disabled={!manualQuery.trim()}
                className="mt-2 w-full h-8 rounded-full text-xs font-semibold bg-amber-400 text-black hover:bg-amber-300 disabled:opacity-30 disabled:cursor-default transition-colors"
              >
                Buscar cifra
              </button>
            </form>
          </div>
        )}

        {error === 'fetch_error' && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm font-medium text-white">Erro ao buscar cifra</p>
            <button
              onClick={() => fetchCifra(track.artist, track.title, track.id)}
              className="mt-1 h-8 rounded-full px-5 text-xs font-bold bg-white/10 text-white hover:bg-white/20 transition-colors"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {cifra && (
          <div className="py-2">
            {/* Track info */}
            <div className="mb-4">
              <p className="text-sm font-bold text-white">{cifra.title}</p>
              <p className="text-xs text-[#808080]">{cifra.artist}</p>
              {(cifra.tuning || cifra.capo) && (
                <div className="flex gap-3 mt-2">
                  {cifra.tuning && (
                    <span className="text-[10px] text-[#b3b3b3] bg-white/5 px-2 py-0.5 rounded">
                      Afinação: {cifra.tuning}
                    </span>
                  )}
                  {cifra.capo && (
                    <span className="text-[10px] text-[#b3b3b3] bg-white/5 px-2 py-0.5 rounded">
                      Tom: {cifra.capo}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Chord content */}
            <pre
              className="whitespace-pre-wrap leading-relaxed font-mono overflow-x-auto"
              style={{ fontSize: `${fontSize}px` }}
            >
              {cifra.content.split(/⟨([^⟩]*)⟩/).map((part, i) =>
                i % 2 === 1
                  ? <span key={i} className="font-bold text-amber-400">{part}</span>
                  : <span key={i} className="text-[#e0e0e0]">{part}</span>
              )}
            </pre>
          </div>
        )}

        {cifra && (
          <div className="flex justify-center py-4">
            <button
              onClick={() => {
                setManualQuery('')
                setCifra(null)
                setError('not_found')
                setLoadedTrackId(track.id + '_reset')
              }}
              className="flex items-center gap-2 text-sm font-medium text-[#b3b3b3] hover:text-white bg-white/5 hover:bg-white/10 px-4 py-2.5 rounded-lg transition-colors"
            >
              <RotateCcw className="h-4 w-4" />
              Buscar outra cifra
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

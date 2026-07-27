import { useEffect, useState, useRef } from 'react'
import { Loader2, Type, AlertCircle, Music2 } from 'lucide-react'
import { usePlayerStore } from '@/store/playerStore'
import { useLyricsStore } from '@/store/lyricsStore'
import { cn } from '@/lib/utils'

const FONT_SIZES = [14, 16, 18, 20, 24]

export function LyricsPanel() {
  const track = usePlayerStore(s => s.track)
  const playbackState = usePlayerStore(s => s.playbackState)
  const lyrics = useLyricsStore(s => s.lyrics)
  const isLoading = useLyricsStore(s => s.isLoading)
  const error = useLyricsStore(s => s.error)
  const source = useLyricsStore(s => s.source)
  const trackId = useLyricsStore(s => s.trackId)
  const fetchLyrics = useLyricsStore(s => s.fetchLyrics)
  const [fontIdx, setFontIdx] = useState(1)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!track) return
    if (trackId === track.id) return
    fetchLyrics(track.artist, track.title, track.id)
  }, [track?.id])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [lyrics])

  const fontSize = FONT_SIZES[fontIdx]
  const isPlaying = playbackState === 'playing'

  if (!track) return null

  return (
    <div className="rounded-lg bg-white/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 md:px-5 py-3 md:py-4">
        <div className="flex items-center gap-3">
          <Type className="h-5 w-5 text-[hsl(var(--primary))]" />
          <p className="text-sm font-bold text-white">Letra</p>
        </div>

        {lyrics && (
          <div className="flex items-center gap-1">
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
      <div
        ref={scrollRef}
        className="px-4 md:px-5 pb-4 md:pb-5 max-h-[60vh] overflow-y-auto scroll-smooth"
      >
        {isLoading && (
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--primary))]" />
            <p className="text-sm text-[#b3b3b3]">Buscando letra...</p>
          </div>
        )}

        {error === 'not_found' && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <Music2 className="h-8 w-8 text-[#535353]" />
            <p className="text-sm font-medium text-white">Letra não encontrada</p>
            <p className="text-xs text-[#808080] max-w-xs">
              A letra de "{track.title}" ainda não está disponível na base.
            </p>
          </div>
        )}

        {(error === 'not_configured' || error === 'fetch_error') && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertCircle className="h-8 w-8 text-[#535353]" />
            <p className="text-sm font-medium text-white">Erro ao buscar letra</p>
            <p className="text-xs text-[#808080] max-w-xs">
              Não foi possível carregar a letra. Tente novamente.
            </p>
            <button
              onClick={() => fetchLyrics(track.artist, track.title, track.id)}
              className="mt-1 h-8 rounded-full px-5 text-xs font-bold bg-white/10 text-white hover:bg-white/20 transition-colors"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {lyrics && (
          <>
            <div
              className={cn(
                'whitespace-pre-wrap leading-relaxed text-[#e0e0e0] transition-all',
                isPlaying && 'text-white'
              )}
              style={{ fontSize: `${fontSize}px` }}
            >
              {lyrics}
            </div>

            {source && (
              <p className="mt-6 text-[10px] text-[#535353] text-center">
                Fonte: {source}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

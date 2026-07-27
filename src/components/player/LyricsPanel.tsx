import { useEffect, useState, useRef, useCallback } from 'react'
import { Loader2, AlertCircle, Music2 } from 'lucide-react'
import { usePlayerStore } from '@/store/playerStore'
import { useLyricsStore } from '@/store/lyricsStore'
import type { LrcLine } from '@/store/lyricsStore'
import { cn } from '@/lib/utils'

const FONT_SIZES = [14, 16, 18, 20, 24]

function findActiveLine(lines: LrcLine[], time: number): number {
  let idx = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= time) idx = i
    else break
  }
  return idx
}

export function LyricsPanel() {
  const track = usePlayerStore(s => s.track)
  const currentTime = usePlayerStore(s => s.currentTime)
  const playbackState = usePlayerStore(s => s.playbackState)
  const plainLyrics = useLyricsStore(s => s.plainLyrics)
  const syncedLines = useLyricsStore(s => s.syncedLines)
  const isLoading = useLyricsStore(s => s.isLoading)
  const error = useLyricsStore(s => s.error)
  const source = useLyricsStore(s => s.source)
  const trackId = useLyricsStore(s => s.trackId)
  const fetchLyrics = useLyricsStore(s => s.fetchLyrics)
  const [fontIdx, setFontIdx] = useState(2)
  const scrollRef = useRef<HTMLDivElement>(null)
  const lineRefs = useRef<Map<number, HTMLParagraphElement>>(new Map())
  const userScrolledRef = useRef(false)
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (!track) return
    if (trackId === track.id) return
    fetchLyrics(track.artist, track.title, track.id)
  }, [track?.id])

  const activeLine = syncedLines ? findActiveLine(syncedLines, currentTime) : -1

  useEffect(() => {
    if (!syncedLines || activeLine < 0 || userScrolledRef.current) return
    const el = lineRefs.current.get(activeLine)
    if (!el || !scrollRef.current) return
    const container = scrollRef.current
    const elTop = el.offsetTop - container.offsetTop
    const target = elTop - container.clientHeight / 3
    container.scrollTo({ top: target, behavior: 'smooth' })
  }, [activeLine, syncedLines])

  const handleScroll = useCallback(() => {
    if (playbackState !== 'playing') return
    userScrolledRef.current = true
    clearTimeout(scrollTimerRef.current)
    scrollTimerRef.current = setTimeout(() => {
      userScrolledRef.current = false
    }, 4000)
  }, [playbackState])

  useEffect(() => {
    userScrolledRef.current = false
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [trackId])

  useEffect(() => () => clearTimeout(scrollTimerRef.current), [])

  const setLineRef = useCallback((idx: number, el: HTMLParagraphElement | null) => {
    if (el) lineRefs.current.set(idx, el)
    else lineRefs.current.delete(idx)
  }, [])

  const fontSize = FONT_SIZES[fontIdx]
  const hasLyrics = syncedLines || plainLyrics

  if (!track) return null

  return (
    <div className="flex flex-col min-h-[300px] lg:h-full rounded-lg bg-white/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <p className="text-sm font-bold text-white">Letra</p>
        {hasLyrics && (
          <div className="flex items-center gap-1">
            {syncedLines && (
              <span className="text-[10px] font-medium text-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 px-2 py-0.5 rounded-full mr-2">
                SYNC
              </span>
            )}
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
        className="flex-1 overflow-y-auto px-4 pb-4 scroll-smooth"
        onWheel={handleScroll}
        onTouchMove={handleScroll}
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
            <p className="text-sm font-medium text-white">Letra indisponivel</p>
            <p className="text-xs text-[#808080] max-w-xs">
              A letra de "{track.title}" ainda nao esta na base.
            </p>
          </div>
        )}

        {(error === 'fetch_error') && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertCircle className="h-8 w-8 text-[#535353]" />
            <p className="text-sm font-medium text-white">Erro ao buscar letra</p>
            <button
              onClick={() => fetchLyrics(track.artist, track.title, track.id)}
              className="mt-1 h-8 rounded-full px-5 text-xs font-bold bg-white/10 text-white hover:bg-white/20 transition-colors"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {/* Synced lyrics — line by line with highlighting */}
        {syncedLines && syncedLines.length > 0 && (
          <div className="space-y-1 py-4">
            {syncedLines.map((line, i) => (
              <p
                key={i}
                ref={el => setLineRef(i, el)}
                className={cn(
                  'py-1.5 px-2 rounded-md leading-relaxed transition-all duration-300 cursor-pointer',
                  i === activeLine
                    ? 'text-white font-bold scale-[1.02] bg-white/5'
                    : i < activeLine
                      ? 'text-[#808080]'
                      : 'text-[#b3b3b3]'
                )}
                style={{ fontSize: i === activeLine ? `${fontSize + 2}px` : `${fontSize}px` }}
                onClick={() => {
                  const seek = usePlayerStore.getState().seek
                  seek(line.time)
                  userScrolledRef.current = false
                }}
              >
                {line.text}
              </p>
            ))}
            <div className="h-32" />
          </div>
        )}

        {/* Plain lyrics fallback */}
        {!syncedLines && plainLyrics && (
          <div
            className="whitespace-pre-wrap leading-relaxed text-[#e0e0e0] py-4"
            style={{ fontSize: `${fontSize}px` }}
          >
            {plainLyrics}
          </div>
        )}

        {source && hasLyrics && (
          <p className="mt-4 text-[10px] text-[#535353] text-center pb-2">
            Fonte: {source}
          </p>
        )}
      </div>
    </div>
  )
}

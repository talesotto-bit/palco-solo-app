import { useEffect, useState, useRef, useCallback } from 'react'
import { Loader2, AlertCircle, Search, RotateCcw, ArrowDownToLine, Minus, Plus, Hand } from 'lucide-react'
import { usePlayerStore } from '@/store/playerStore'
import { useAutoScroll } from '@/hooks/useAutoScroll'
import { cn } from '@/lib/utils'
import { useLyricsStore } from '@/store/lyricsStore'
import { useLyricSync, findActiveLine } from '@/hooks/useLyricSync'

const FONT_SIZES = [14, 16, 18, 20, 24]

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
  const searchManual = useLyricsStore(s => s.searchManual)
  const resetToSearch = useLyricsStore(s => s.resetToSearch)
  const [fontIdx, setFontIdx] = useState(2)
  const [manualQuery, setManualQuery] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const lineRefs = useRef<Map<number, HTMLParagraphElement>>(new Map())
  const userScrolledRef = useRef(false)
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const autoScrollingUntil = useRef(0)
  const lastActiveLine = useRef(-1)

  useEffect(() => {
    if (!track) return
    if (trackId === track.id) return
    fetchLyrics(track.artist, track.title, track.id, track.lrclibId)
  }, [track?.id, trackId, fetchLyrics])

  const sync = useLyricSync(syncedLines)
  const activeLine = syncedLines ? findActiveLine(syncedLines, currentTime - sync.offset) : -1

  // Letra sem sincronização: rola acompanhando o progresso da música
  const [autoScroll, setAutoScroll] = useState(true)
  useAutoScroll(scrollRef, autoScroll && !syncedLines && !!plainLyrics)

  // Auto-scroll to active line
  useEffect(() => {
    if (!syncedLines || activeLine < 0) return
    if (activeLine === lastActiveLine.current) return
    lastActiveLine.current = activeLine
    if (userScrolledRef.current) return

    const el = lineRefs.current.get(activeLine)
    if (!el) return

    autoScrollingUntil.current = Date.now() + 1200

    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } catch {
      // Fallback for browsers that don't support smooth scrollIntoView options
      const container = scrollRef.current
      if (container) {
        const elTop = el.offsetTop - container.offsetTop
        const target = elTop - container.clientHeight / 3
        container.scrollTop = target
      }
    }
  }, [activeLine, syncedLines])

  // Detect user scroll vs auto-scroll
  const handleUserScroll = useCallback(() => {
    if (Date.now() < autoScrollingUntil.current) return
    if (playbackState !== 'playing') return
    userScrolledRef.current = true
    clearTimeout(scrollTimerRef.current)
    scrollTimerRef.current = setTimeout(() => {
      userScrolledRef.current = false
    }, 6000)
  }, [playbackState])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let touchY = 0
    const onTouchStart = (e: TouchEvent) => { touchY = e.touches[0].clientY }
    const onTouchMove = (e: TouchEvent) => {
      if (Math.abs(e.touches[0].clientY - touchY) > 10) handleUserScroll()
    }
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: true })
    el.addEventListener('wheel', handleUserScroll, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('wheel', handleUserScroll)
    }
  }, [handleUserScroll])

  // Reset scroll state on track change
  useEffect(() => {
    userScrolledRef.current = false
    autoScrollingUntil.current = 0
    lastActiveLine.current = -1
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [trackId])

  useEffect(() => () => {
    clearTimeout(scrollTimerRef.current)
  }, [])

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
            {syncedLines ? (
              <span className="text-[10px] font-medium text-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 px-2 py-0.5 rounded-full mr-2">
                Sincronizada
              </span>
            ) : (
              <button
                onClick={() => setAutoScroll(v => !v)}
                aria-pressed={autoScroll}
                title="Rolagem automática"
                className={cn(
                  'h-7 px-2 mr-1 rounded flex items-center gap-1 text-[10px] font-bold transition-colors',
                  autoScroll
                    ? 'bg-[hsl(var(--primary))]/20 text-[hsl(var(--primary))]'
                    : 'bg-white/5 text-[#b3b3b3] hover:bg-white/10'
                )}
              >
                <ArrowDownToLine className="h-3 w-3" />
                Rolar
              </button>
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

      {/* Sincronia da letra com o playback */}
      {syncedLines && syncedLines.length > 0 && (
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 shrink-0 bg-black/20 text-[11px]">
          <span className="text-[#9a9a9a] leading-tight">
            Sincronia: <b className="text-white">{sync.mode === 'auto' ? 'automática' : sync.mode === 'manual' ? `ajustada (${sync.offset > 0 ? '+' : ''}${sync.offset.toFixed(1)}s)` : 'original'}</b>
          </span>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => sync.nudge(-0.25)} aria-label="Letra mais cedo" className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center"><Minus className="h-3.5 w-3.5" /></button>
            <button onClick={() => sync.nudge(0.25)} aria-label="Letra mais tarde" className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center"><Plus className="h-3.5 w-3.5" /></button>
            {playbackState === 'playing' && (
              <button onClick={sync.markStart} title="Toque quando o cantor começar"
                className="h-8 px-2 rounded-full bg-[hsl(var(--primary))]/20 text-[hsl(var(--primary))] font-bold flex items-center gap-1"><Hand className="h-3.5 w-3.5" /> Começou</button>
            )}
            {sync.mode === 'manual' && <button onClick={sync.reset} className="h-8 px-2 rounded-full bg-white/5 text-[#b3b3b3]">Auto</button>}
          </div>
        </div>
      )}

      {/* Content */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 pb-4 scroll-smooth"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {isLoading && (
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--primary))]" />
            <p className="text-sm text-[#b3b3b3]">Buscando letra...</p>
          </div>
        )}

        {error === 'not_found' && (
          <div className="flex flex-col items-center gap-3 py-8">
            <p className="text-xs text-[#808080] text-center">
              Busque pelo artista e titulo da musica
            </p>
            <form
              className="w-full max-w-xs"
              onSubmit={(e) => {
                e.preventDefault()
                if (manualQuery.trim()) searchManual(manualQuery.trim(), track.id)
              }}
            >
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#808080]" />
                <input
                  type="text"
                  value={manualQuery}
                  onChange={(e) => setManualQuery(e.target.value)}
                  placeholder="Ex: Roberto Carlos - Detalhes"
                  className="w-full h-9 rounded-lg bg-[#2a2a2a] pl-9 pr-3 text-xs text-white placeholder:text-[#606060] border-0 outline-none focus:ring-1 focus:ring-white/20 transition"
                />
              </div>
              <button
                type="submit"
                disabled={!manualQuery.trim()}
                className="mt-2 w-full h-8 rounded-full text-xs font-semibold bg-white text-black hover:bg-white/90 disabled:opacity-30 disabled:cursor-default transition-colors"
              >
                Buscar letra
              </button>
            </form>
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

        {/* Synced lyrics — line by line */}
        {syncedLines && syncedLines.length > 0 && (
          <div className="space-y-1 py-4">
            {syncedLines.map((line, i) => (
              <p
                key={i}
                ref={el => setLineRef(i, el)}
                className={cn(
                  'py-1.5 px-2 rounded-md leading-relaxed cursor-pointer hover:bg-white/5 transition-all duration-300',
                  i === activeLine
                    ? 'text-white font-bold bg-[hsl(var(--primary))]/15'
                    : i < activeLine
                      ? 'text-[#6b6b6b]'
                      : 'text-[#b3b3b3]'
                )}
                style={{ fontSize: `${i === activeLine ? fontSize + 2 : fontSize}px` }}
                onClick={() => {
                  const seek = usePlayerStore.getState().seek
                  seek(Math.max(0, line.time + sync.offset))
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

        {hasLyrics && (
          <div className="flex justify-center pb-4">
            <button
              onClick={() => {
                setManualQuery('')
                resetToSearch()
              }}
              className="flex items-center gap-2 text-sm font-medium text-[#b3b3b3] hover:text-white bg-white/5 hover:bg-white/10 px-4 py-2.5 rounded-lg transition-colors"
            >
              <RotateCcw className="h-4 w-4" />
              Letra incorreta? Buscar outra
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

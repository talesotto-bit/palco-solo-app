import { useRef, useState, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { Repeat } from 'lucide-react'
import { usePlayerStore } from '@/store/playerStore'
import { formatTime } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { SongSection } from '@/audio/AudioEngine'

/** Cor de cada parte da música (barra e botões) */
export const SECTION_COLOR: Record<string, string> = {
  Intro: '#94a3b8', Verso: '#38bdf8', Refrão: '#22c55e', Solo: '#fbbf24', Final: '#c084fc',
}
export const colorOf = (label: string) => SECTION_COLOR[label.replace(/ \d+$/, '')] || '#a3a3a3'

/** Forma de onda em barras (SVG esticado na largura da barra de progresso) */
export function Waveform({ peaks, className, color }: { peaks: number[]; className?: string; color: string }) {
  const n = peaks.length
  return (
    <svg viewBox={`0 0 ${n} 40`} preserveAspectRatio="none" className={className} aria-hidden>
      {peaks.map((p, i) => {
        const h = Math.max(2, p * 38)
        return <rect key={i} x={i + 0.18} width={0.64} y={20 - h / 2} height={h} rx={0.3} fill={color} />
      })}
    </svg>
  )
}

/** Parte da música que está tocando agora */
export function sectionAt(sections: SongSection[], t: number): number {
  return sections.findIndex(s => t >= s.start && t < s.end)
}

let hinted = false

export function ProgressBar() {
  const seek = usePlayerStore(s => s.seek)
  const playbackState = usePlayerStore(s => s.playbackState)
  const analysis = usePlayerStore(s => s.analysis)
  const barRef = useRef<HTMLDivElement>(null)
  const fillRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLDivElement>(null)
  const elapsedRef = useRef<HTMLSpanElement>(null)
  const remainRef = useRef<HTMLSpanElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragProgress, setDragProgress] = useState(0)
  const [hoverX, setHoverX] = useState<number | null>(null)
  const [active, setActive] = useState(-1)
  const [barW, setBarW] = useState(0)
  const durationRef = useRef(0)
  const sections = analysis?.sections ?? []
  const peaks = analysis?.peaks

  // largura da barra: a forma de onda colorida (parte já tocada) precisa da largura total
  useEffect(() => {
    const el = barRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setBarW(el.clientWidth))
    ro.observe(el); setBarW(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (isDragging) return
    return usePlayerStore.subscribe((state) => {
      const { currentTime, duration } = state
      durationRef.current = duration
      const pct = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0
      if (fillRef.current) fillRef.current.style.width = `${pct}%`
      if (thumbRef.current) thumbRef.current.style.left = `${pct}%`
      if (elapsedRef.current) elapsedRef.current.textContent = formatTime(currentTime)
      if (remainRef.current) remainRef.current.textContent = `-${formatTime(Math.max(0, duration - currentTime))}`
      const secs = state.analysis?.sections
      if (secs?.length) { const i = sectionAt(secs, currentTime); setActive(a => (a === i ? a : i)) }
    })
  }, [isDragging])

  const isLoading = playbackState === 'loading'

  const getRatioFromClientX = useCallback((clientX: number) => {
    if (!barRef.current) return 0
    const rect = barRef.current.getBoundingClientRect()
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  }, [])

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const dur = durationRef.current || usePlayerStore.getState().duration
    if (!dur || dur <= 0) return
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    const ratio = getRatioFromClientX(e.clientX)
    setIsDragging(true)
    setDragProgress(ratio * 100)
  }, [getRatioFromClientX])

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const ratio = getRatioFromClientX(e.clientX)
    if (isDragging) {
      setDragProgress(ratio * 100)
    } else {
      setHoverX(ratio)
    }
  }, [isDragging, getRatioFromClientX])

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return
    const ratio = getRatioFromClientX(e.clientX)
    const dur = durationRef.current || usePlayerStore.getState().duration
    seek(ratio * dur)
    setIsDragging(false)
  }, [isDragging, seek, getRatioFromClientX])

  const displayProgress = isDragging ? dragProgress : 0
  const loop = usePlayerStore(s => s.loop)
  const dur = durationRef.current || usePlayerStore.getState().duration
  const displayTime = isDragging ? (dragProgress / 100) * dur : 0
  const hoverTime = hoverX !== null && dur > 0 && !isDragging ? hoverX * dur : null
  const isLooping = (sec: SongSection) => !!loop && loop.b !== null && Math.abs(loop.a - sec.start) < 0.01 && Math.abs(loop.b - sec.end) < 0.01

  /** Toque numa parte: vai para ela. Tocar de novo na parte que está tocando: repete só ela */
  const onSection = (sec: SongSection, i: number) => {
    const P = usePlayerStore.getState()
    if (isLooping(sec)) { P.clearLoop(); toast('Parou de repetir'); return }
    if (i === active && P.playbackState === 'playing') {
      P.loopRange(sec.start, sec.end)
      toast(`Repetindo: ${sec.label}`, { description: 'Toque de novo para parar de repetir' })
      return
    }
    if (loop) P.clearLoop()
    seek(sec.start)
    if (!hinted) { hinted = true; toast(sec.label, { description: 'Toque de novo na parte que está tocando para repetir só ela' }) }
  }

  return (
    <div className="w-full space-y-1.5">
      {/* Progress track */}
      <div
        ref={barRef}
        className={cn('group relative w-full cursor-pointer touch-none transition-all',
          peaks ? 'h-10' : 'h-2 md:h-1 md:hover:h-1.5 rounded-full bg-white/10')}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => setIsDragging(false)}
        onMouseLeave={() => { if (!isDragging) setHoverX(null) }}
      >
        {peaks && <Waveform peaks={peaks} color="rgba(255,255,255,0.22)" className="absolute inset-0 h-full w-full pointer-events-none" />}
        {/* Trecho do loop A-B */}
        {loop && dur > 0 && (
          <div className="absolute inset-y-[-3px] rounded bg-amber-400/35 border-x-2 border-amber-400 pointer-events-none"
            style={{ left: `${(loop.a / dur) * 100}%`, width: `${(((loop.b ?? loop.a + 0.3) - loop.a) / dur) * 100}%` }} />
        )}
        {/* Progress fill */}
        <div
          ref={fillRef}
          className={cn(
            'absolute inset-y-0 left-0 overflow-hidden pointer-events-none',
            !peaks && cn('rounded-full transition-colors duration-75', isDragging ? 'bg-[hsl(var(--primary))]' : 'bg-white group-hover:bg-[hsl(var(--primary))]')
          )}
          style={{ width: isDragging ? `${displayProgress}%` : '0%' }}
        >
          {peaks && <div className="h-full" style={{ width: barW }}><Waveform peaks={peaks} color="hsl(var(--primary))" className="h-full w-full" /></div>}
        </div>

        {/* Thumb */}
        <div
          ref={thumbRef}
          className={cn(
            'absolute -translate-x-1/2 bg-white shadow-md transition-all pointer-events-none',
            peaks ? 'top-0 bottom-0 w-[2px] rounded' : cn('top-1/2 -translate-y-1/2 rounded-full', isDragging ? 'h-3.5 w-3.5 opacity-100' : 'h-3 w-3 opacity-0 group-hover:opacity-100')
          )}
          style={{ left: isDragging ? `${displayProgress}%` : undefined }}
        />

        {/* Hover time tooltip */}
        {hoverTime !== null && (
          <div
            className="absolute -top-8 -translate-x-1/2 px-2 py-0.5 rounded bg-[#2a2a2a] text-white text-[10px] font-medium tabular-nums opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
            style={{ left: `${(hoverX ?? 0) * 100}%` }}
          >
            {formatTime(hoverTime)}
          </div>
        )}

        {/* Loading shimmer */}
        {isLoading && (
          <div className="absolute inset-0 rounded-full overflow-hidden">
            <div className="h-full w-1/3 bg-white/20 animate-pulse" />
          </div>
        )}
      </div>

      {/* Partes da música, em cores, alinhadas à forma de onda */}
      {sections.length > 0 && dur > 0 && (
        <div className="relative h-1 w-full">
          {sections.map((sec, i) => (
            <div key={i} className={cn('absolute inset-y-0 rounded-full transition-opacity', i === active ? 'opacity-100' : 'opacity-45')}
              style={{ left: `calc(${(sec.start / dur) * 100}% + 1px)`, width: `calc(${((sec.end - sec.start) / dur) * 100}% - 2px)`, background: colorOf(sec.label) }} />
          ))}
        </div>
      )}

      {/* Time labels */}
      <div className="flex items-center justify-between text-xs md:text-[11px] tabular-nums text-[#b3b3b3]">
        <span ref={elapsedRef}>{isDragging ? formatTime(displayTime) : '0:00'}</span>
        <span ref={remainRef}>{isDragging ? `-${formatTime(Math.max(0, dur - displayTime))}` : '-0:00'}</span>
      </div>

      {sections.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-0.5" aria-label="Partes da música">
          {sections.map((sec, i) => {
            const looping = isLooping(sec)
            return (
              <button key={i} onClick={() => onSection(sec, i)}
                aria-label={`${sec.label} em ${formatTime(sec.start)}${looping ? ', repetindo' : ''}`}
                className={cn('h-7 shrink-0 rounded-full px-2.5 text-[11px] font-bold flex items-center gap-1.5 transition-colors',
                  i === active ? 'bg-white text-black' : 'bg-white/[0.07] text-[#d0d0d0]', looping && 'ring-2 ring-amber-400')}>
                <span className="h-2 w-2 rounded-full" style={{ background: colorOf(sec.label) }} />
                {sec.label}
                {looping && <Repeat className="h-3 w-3" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

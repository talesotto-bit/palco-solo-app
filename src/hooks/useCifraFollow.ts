import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { usePlayerStore } from '@/store/playerStore'
import { useLyricsStore } from '@/store/lyricsStore'
import { audioEngine } from '@/audio/AudioEngine'
import { parseSheet } from '@/lib/chordSheet'
import { cifraTiming, positionAt } from '@/lib/cifraTiming'
import { songArtist } from '@/lib/lyricsMatch'
import { usePlaybackLyrics, useLyricSync } from './useLyricSync'
import { sungSpan } from './useAutoScroll'

const RESUME_AFTER_MS = 4000
/** a linha que está tocando fica a esta altura da tela: dá para ler as próximas */
const FOCUS = 0.32

/**
 * Rolagem da cifra acompanhando a música. Usa a letra sincronizada para saber em que linha a música está
 * (ver cifraTiming); desliza a cada quadro e destaca a linha atual. Se o músico rolar com o dedo/mouse,
 * para e volta sozinha depois de alguns segundos.
 * As linhas da cifra precisam ter data-l={índice} (ChordSheet já põe).
 */
export function useCifraFollow(containerRef: RefObject<HTMLElement>, content: string, enabled: boolean) {
  const track = usePlayerStore(s => s.track)
  const duration = usePlayerStore(s => s.duration)
  const lyricsTrack = useLyricsStore(s => s.trackId)
  const { syncedLines } = usePlaybackLyrics()
  const sync = useLyricSync(syncedLines)

  // a letra é o relógio da cifra: carrega mesmo com a aba Letra fechada
  useEffect(() => {
    if (!track || lyricsTrack === track.id) return
    void useLyricsStore.getState().fetchLyrics(songArtist(track), track.title, track.id, track.lrclibId, track.durationSeconds, track.lyricsUrl)
  }, [track, lyricsTrack])

  const lines = useMemo(() => parseSheet(content), [content])
  const timing = useMemo(() => {
    if (!duration) return null
    const lrc = syncedLines?.map(l => ({ time: l.time + sync.offset, text: l.text })) ?? null
    return cifraTiming(lines, lrc, sungSpan(duration), audioEngine.contentEnd || duration)
  }, [lines, syncedLines, sync.offset, duration])

  const pausedUntil = useRef(0)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onUser = () => { pausedUntil.current = Date.now() + RESUME_AFTER_MS }
    const evs = ['wheel', 'touchstart', 'touchmove', 'mousedown', 'keydown'] as const
    evs.forEach(e => el.addEventListener(e, onUser, { passive: true }))
    return () => evs.forEach(e => el.removeEventListener(e, onUser))
  }, [containerRef])

  useEffect(() => {
    const el = containerRef.current
    if (!el || !timing) return
    let raf = 0, last = performance.now(), active = -1
    const lineEls = () => el.querySelectorAll<HTMLElement>('[data-l]')
    const setActive = (i: number) => {
      if (i === active) return
      const els = lineEls()
      els[active]?.removeAttribute('data-active')
      if (timing.synced && i >= 0) els[i]?.setAttribute('data-active', 'true')
      active = i
    }
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min(0.1, (now - last) / 1000); last = now
      const els = lineEls()
      if (!els.length) return
      const t = audioEngine.currentTime
      const pos = positionAt(timing.times, t)
      const i = Math.min(els.length - 1, Math.floor(pos))
      // destaque na última linha com acordes/letra (linha em branco e título de parte não acendem)
      let h = i
      while (h > 0 && els[h].hasAttribute('data-skip')) h--
      setActive(t >= timing.times[0] && !els[h].hasAttribute('data-skip') ? h : -1)
      if (!enabled || Date.now() < pausedUntil.current) return
      const a = els[i], b = els[i + 1]
      const base = el.getBoundingClientRect().top - el.scrollTop
      const ya = a.getBoundingClientRect().top - base
      const top = ya + (b ? (b.getBoundingClientRect().top - base - ya) * (pos - i) : 0)
      const target = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, top - el.clientHeight * FOCUS))
      const diff = target - el.scrollTop
      if (Math.abs(diff) < 0.5) return
      // salto grande (o músico pulou um trecho): vai direto; senão desliza
      el.scrollTop = Math.abs(diff) > el.clientHeight * 1.5 ? target : el.scrollTop + diff * Math.min(1, dt * 5)
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); setActive(-1) }
  }, [containerRef, timing, enabled])

  return { synced: !!timing?.synced }
}

import { useEffect, useRef, type RefObject } from 'react'
import { usePlayerStore } from '@/store/playerStore'

const RESUME_AFTER_MS = 5000

/**
 * Rola o conteúdo acompanhando o progresso da música (para letra sem
 * sincronização e cifras). Se o músico rolar com o dedo/mouse, pausa e
 * retoma sozinho após alguns segundos.
 */
export function useAutoScroll(containerRef: RefObject<HTMLElement>, enabled: boolean) {
  const currentTime = usePlayerStore(s => s.currentTime)
  const duration = usePlayerStore(s => s.duration)
  const pausedUntil = useRef(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onUser = () => { pausedUntil.current = Date.now() + RESUME_AFTER_MS }
    el.addEventListener('wheel', onUser, { passive: true })
    el.addEventListener('touchmove', onUser, { passive: true })
    return () => {
      el.removeEventListener('wheel', onUser)
      el.removeEventListener('touchmove', onUser)
    }
  }, [containerRef])

  useEffect(() => {
    const el = containerRef.current
    if (!enabled || !el || !duration || Date.now() < pausedUntil.current) return
    const maxScroll = el.scrollHeight - el.clientHeight
    if (maxScroll <= 0) return
    const progress = Math.min(1, Math.max(0, currentTime / duration))
    el.scrollTop = progress * maxScroll
  }, [enabled, currentTime, duration, containerRef])
}

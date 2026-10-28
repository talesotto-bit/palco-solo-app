import { useEffect, useRef, type RefObject } from 'react'
import { usePlayerStore } from '@/store/playerStore'
import { audioEngine } from '@/audio/AudioEngine'

const RESUME_AFTER_MS = 5000

/**
 * Trecho cantado da música: começa depois da introdução e termina antes do final instrumental.
 * Rolar só nesse trecho evita a letra correr na frente do cantor. A "voz guia" pode ser a melodia
 * tocada por um instrumento já na introdução, então ela só conta quando entra depois do início típico do canto.
 */
export function sungSpan(duration: number): [number, number] {
  const edge = Math.min(12, duration * 0.06)
  const start = Math.max(audioEngine.voiceStart() ?? 0, edge)
  const end = Math.max(start + 10, (audioEngine.contentEnd || duration) - edge)
  return [start, end]
}

/**
 * Rola o conteúdo acompanhando o trecho cantado da música (para letra sem
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
    const [start, end] = sungSpan(duration)
    const progress = Math.min(1, Math.max(0, (currentTime - start) / (end - start)))
    el.scrollTop = progress * maxScroll
  }, [enabled, currentTime, duration, containerRef])
}

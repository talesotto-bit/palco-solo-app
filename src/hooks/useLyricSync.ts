import { useEffect, useState } from 'react'
import { usePlayerStore } from '@/store/playerStore'
import { useLyricsSyncStore } from '@/store/lyricsSyncStore'
import { audioEngine } from '@/audio/AudioEngine'
import type { LrcLine } from '@/store/lyricsStore'

/**
 * Sincronia da letra com o playback:
 * - ajuste manual do músico (salvo por música) tem prioridade;
 * - senão, alinha sozinho pelo início da voz guia (quando a música tem);
 * - senão, usa os tempos da letra como vieram.
 */
export function useLyricSync(lines: LrcLine[] | null) {
  const trackId = usePlayerStore(s => s.track?.id)
  const loaded = usePlayerStore(s => s.playbackState !== 'loading' && s.playbackState !== 'idle')
  const manual = useLyricsSyncStore(s => (trackId ? s.offsets[trackId] : undefined))
  const setOffset = useLyricsSyncStore(s => s.setOffset)
  const clearOffset = useLyricsSyncStore(s => s.clearOffset)
  const [auto, setAuto] = useState<number | null>(null)

  useEffect(() => {
    setAuto(null)
    if (!lines?.length || !loaded) return
    const vs = audioEngine.voiceStart()
    if (vs === null) return
    const diff = vs - lines[0].time
    if (Math.abs(diff) >= 0.3 && Math.abs(diff) <= 40) setAuto(Math.round(diff * 100) / 100)
  }, [trackId, lines, loaded])

  const offset = manual ?? auto ?? 0
  return {
    offset,
    mode: manual !== undefined ? 'manual' as const : auto !== null ? 'auto' as const : 'none' as const,
    nudge: (delta: number) => { if (trackId) setOffset(trackId, offset + delta) },
    /** o músico toca quando o cantor começa: alinha a 1ª linha naquele instante */
    markStart: () => {
      if (!trackId || !lines?.length) return
      setOffset(trackId, usePlayerStore.getState().currentTime - lines[0].time)
    },
    reset: () => { if (trackId) clearOffset(trackId) },
  }
}

export function findActiveLine(lines: LrcLine[], time: number): number {
  // busca binária: rápido mesmo com letras longas, chamado a cada atualização de tempo
  let lo = 0, hi = lines.length - 1, idx = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid].time <= time) { idx = mid; lo = mid + 1 } else hi = mid - 1
  }
  return idx
}

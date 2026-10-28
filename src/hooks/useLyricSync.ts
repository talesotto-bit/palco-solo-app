import { usePlayerStore } from '@/store/playerStore'
import { useLyricsSyncStore } from '@/store/lyricsSyncStore'
import type { LrcLine } from '@/store/lyricsStore'

/**
 * Sincronia da letra com o playback:
 * - ajuste manual do músico (salvo por música) tem prioridade;
 * - senão, usa os tempos da letra como vieram. Só chega letra sincronizada da gravação com a mesma duração
 *   do playback (lyricsStore), então os tempos já batem.
 *
 * Não alinha mais pelo início da "voz guia": em muitos playbacks a guia é a melodia tocada por um instrumento
 * e começa na introdução, antes do cantor. Em Deixa Alagar ela entra aos 3,2 s e o canto aos 11,5 s, e o
 * alinhamento automático adiantava a letra 8 s (a letra corria na frente do cantor).
 */
export function useLyricSync(lines: LrcLine[] | null) {
  const trackId = usePlayerStore(s => s.track?.id)
  const manual = useLyricsSyncStore(s => (trackId ? s.offsets[trackId] : undefined))
  const setOffset = useLyricsSyncStore(s => s.setOffset)
  const clearOffset = useLyricsSyncStore(s => s.clearOffset)

  const offset = manual ?? 0
  return {
    offset,
    mode: manual !== undefined ? 'manual' as const : 'none' as const,
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

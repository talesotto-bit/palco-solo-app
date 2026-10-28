import { useEffect, useRef, useState } from 'react'
import { Loader2, Search, Check } from 'lucide-react'
import { useLyricsStore, searchLyricsCandidates, type LrclibHit } from '@/store/lyricsStore'
import type { Track } from '@/types/track'
import { songArtist } from '@/lib/lyricsMatch'

function mmss(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * Letra não encontrada (ou errada): o músico busca e escolhe a certa numa lista com música, artista e duração.
 * Já abre buscando pelo nome da música; a escolha fica guardada para as próximas vezes.
 */
export function LyricsFinder({ track, initialQuery, titleQuery }: { track: Track; initialQuery: string; titleQuery?: string }) {
  const pickLyrics = useLyricsStore(s => s.pickLyrics)
  const [query, setQuery] = useState(initialQuery)
  const [hits, setHits] = useState<LrclibHit[] | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
  const seq = useRef(0)

  const run = async (q: string, fallback?: string) => {
    if (!q.trim()) return
    const my = ++seq.current
    setState('loading')
    try {
      let r = await searchLyricsCandidates(q.trim())
      // "cantor + música" sem resultado: tenta só a música (o cantor pode estar escrito diferente)
      if (!r.length && fallback && fallback !== q) {
        r = await searchLyricsCandidates(fallback)
        if (my === seq.current && r.length) setQuery(fallback)
      }
      if (my !== seq.current) return
      setHits(r); setState('idle')
    } catch {
      if (my === seq.current) setState('error')
    }
  }

  useEffect(() => { void run(initialQuery, titleQuery) }, [track.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="w-full max-w-sm">
      <form onSubmit={e => { e.preventDefault(); void run(query) }} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#808080]" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Nome da música e do cantor"
            className="w-full h-10 rounded-lg bg-[#2a2a2a] pl-9 pr-3 text-sm text-white placeholder:text-[#606060] border-0 outline-none focus:ring-1 focus:ring-white/20"
          />
        </div>
        <button type="submit" disabled={!query.trim()} className="h-10 px-4 rounded-lg bg-white text-black text-sm font-bold disabled:opacity-30">Buscar</button>
      </form>

      {state === 'loading' && (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-[#b3b3b3]"><Loader2 className="h-4 w-4 animate-spin" /> Procurando letras...</div>
      )}
      {state === 'error' && (
        <p className="py-4 text-center text-xs text-[#b3b3b3]">A busca de letras está lenta agora. Toque em Buscar de novo.</p>
      )}
      {state === 'idle' && hits && hits.length === 0 && (
        <p className="py-4 text-center text-xs text-[#b3b3b3]">Nada com esse nome. Tente só o nome da música, ou o nome do cantor junto.</p>
      )}
      {state === 'idle' && hits && hits.length > 0 && (
        <>
          <p className="mt-3 mb-1.5 text-[11px] text-[#808080]">Toque na letra certa:</p>
          <ul className="flex flex-col gap-1.5">
            {hits.map(h => {
              const near = !!track.durationSeconds && Math.abs(h.duration - track.durationSeconds) <= 4
              return (
                <li key={h.id}>
                  <button
                    onClick={() => void pickLyrics(h.id, songArtist(track), track.title, track.id, track.durationSeconds)}
                    className="w-full text-left flex items-center gap-3 rounded-lg bg-white/5 hover:bg-white/10 active:bg-white/15 px-3 py-2.5 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white truncate">{h.trackName}</p>
                      <p className="text-xs text-[#b3b3b3] truncate">{h.artistName} · {mmss(h.duration)}</p>
                    </div>
                    {h.synced && <span className="shrink-0 text-[10px] font-bold text-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 px-2 py-0.5 rounded-full">Sincronizada</span>}
                    {near && <Check className="shrink-0 h-4 w-4 text-[hsl(var(--primary))]" aria-label="mesma duração da música" />}
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}

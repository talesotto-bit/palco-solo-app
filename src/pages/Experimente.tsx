/**
 * "Teste agora": versão mínima do player para aparecer dentro da página de vendas (iframe).
 * 4 músicas leves (prévia instantânea), play, tom, velocidade, voz guia e instrumentos. Sem botões de compra:
 * a página de vendas cuida disso.
 */
import { useEffect, useMemo, useState } from 'react'
import { Play, Pause, Loader2, Minus, Plus, Mic, MicOff } from 'lucide-react'
import { useCatalogStore } from '@/store/catalogStore'
import { usePlayerStore } from '@/store/playerStore'
import { audioEngine, isSupportStem } from '@/audio/AudioEngine'
import { CoverImg } from '@/components/shows/CoverImg'
import { formatTons } from '@/lib/musicTheory'
import { formatTime, cn } from '@/lib/utils'
import type { Stem } from '@/types/track'

const isGuide = (s: Stem) => { const t = `${s.id} ${s.label}`.toLowerCase(); return /(voz|guia|vocal|voice)/.test(t) && !/(back|coro|choir|backing)/.test(t) }

export default function Experimente() {
  const loadCatalog = useCatalogStore(s => s.loadCatalog)
  const tracks = useCatalogStore(s => s.tracks)
  const track = usePlayerStore(s => s.track)
  const state = usePlayerStore(s => s.playbackState)
  const pitch = usePlayerStore(s => Math.round(s.pitch))
  const speed = usePlayerStore(s => s.speed)
  const stemStates = usePlayerStore(s => s.stemStates)
  const t = usePlayerStore(s => s.currentTime)
  const d = usePlayerStore(s => s.duration)
  const P = usePlayerStore.getState
  const [touched, setTouched] = useState(false)

  useEffect(() => { void loadCatalog('/experimente.json') }, [loadCatalog])
  useEffect(() => { if (tracks[0] && !track) void P().loadTrack(tracks[0]) }, [tracks]) // eslint-disable-line react-hooks/exhaustive-deps
  // saiu da aba: pausa
  useEffect(() => { const h = () => { if (document.hidden) P().pause() }; document.addEventListener('visibilitychange', h); return () => document.removeEventListener('visibilitychange', h) }, [P])

  const guide = track?.stems.find(isGuide)
  const instruments = useMemo(() => {
    const list = (track?.stems || []).filter(s => !s.derive && !isSupportStem(s) && s !== guide).slice(0, 6)
    // nomes limpos: "Bumbu-mp3" → "Bumbo"; repetidos ganham número
    const names = list.map(s => { const n = s.label.replace(/[-_ ]?(mp3|wav)$/i, '').replace(/^bumbu$/i, 'Bumbo').replace(/[-_]+/g, ' ').trim(); return n.charAt(0).toUpperCase() + n.slice(1) })
    const seen: Record<string, number> = {}
    return list.map((s, i) => { const n = names[i]; const dup = names.filter(x => x === n).length > 1; seen[n] = (seen[n] || 0) + 1; return { s, name: dup ? `${n} ${seen[n]}` : n } })
  }, [track, guide])
  // a voz guia começa ligada: o "uau" é ouvir a música completa e tirar a voz com um toque
  useEffect(() => { if (guide && P().stemStates[guide.id]?.muted) P().setStemMuted(guide.id, false) }, [track?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const on = (s?: Stem) => !!s && !!stemStates[s.id] && !stemStates[s.id].muted
  const toggle = (s?: Stem) => { if (!s) return; setTouched(true); P().setStemMuted(s.id, on(s)) }
  const playing = state === 'playing', loading = state === 'loading'

  const pick = (i: number) => { setTouched(true); void audioEngine.unlock(); void P().loadTrack(tracks[i], { autoplay: true }) }
  const playPause = () => { setTouched(true); void audioEngine.unlock(); P().togglePlay() }

  return (
    <div className="min-h-dvh bg-[#0d0d0d] text-white px-4 py-4 select-none">
      <p className="text-center text-[13px] font-bold text-[hsl(var(--primary))]">{touched ? 'Agora é você no comando 🎤' : '👆 Toque no play, tire a voz guia e mude o tom'}</p>

      <div className="mt-3 flex gap-1.5 overflow-x-auto no-scrollbar">
        {tracks.map((x, i) => (
          <button key={x.id} onClick={() => pick(i)} className={cn('shrink-0 h-8 rounded-full px-3 text-xs font-bold', track?.id === x.id ? 'bg-white text-black' : 'bg-white/10 text-white/75')}>{x.title}</button>
        ))}
      </div>

      {track && (
        <div className="mt-3 rounded-2xl bg-white/[0.05] border border-white/10 p-3">
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 overflow-hidden rounded-lg shrink-0"><CoverImg track={track} className="h-full w-full object-cover" /></div>
            <div className="min-w-0 flex-1"><p className="truncate font-bold">{track.title}</p><p className="truncate text-xs text-white/55">{track.artist}</p></div>
            <button onClick={playPause} aria-label={playing ? 'Pausar' : 'Tocar'} className={cn('h-14 w-14 shrink-0 rounded-full flex items-center justify-center', playing ? 'bg-[hsl(var(--primary))]' : 'bg-white')}>
              {loading ? <Loader2 className="h-6 w-6 animate-spin text-black" /> : playing ? <Pause className="h-6 w-6 fill-black text-black" /> : <Play className="h-6 w-6 fill-black text-black ml-0.5" />}
            </button>
          </div>
          <div className="mt-3 h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-[hsl(var(--primary))]" style={{ width: `${d ? (t / d) * 100 : 0}%` }} /></div>
          <div className="mt-1 flex justify-between text-[10px] text-white/40 tabular-nums"><span>{formatTime(t)}</span><span>{formatTime(d)}</span></div>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-white/[0.05] p-2.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-white/45">Tom</p>
          <div className="mt-1.5 flex items-center justify-between">
            <button onClick={() => { setTouched(true); P().setPitch(Math.round(P().pitch) - 1) }} aria-label="Descer meio tom" className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center active:bg-white/20"><Minus className="h-4 w-4" /></button>
            <span className={cn('text-sm font-black', pitch ? 'text-[hsl(var(--primary))]' : '')}>{pitch ? formatTons(pitch) : 'Original'}</span>
            <button onClick={() => { setTouched(true); P().setPitch(Math.round(P().pitch) + 1) }} aria-label="Subir meio tom" className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center active:bg-white/20"><Plus className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="rounded-2xl bg-white/[0.05] p-2.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-white/45">Velocidade</p>
          <div className="mt-1.5 flex gap-1">
            {[0.85, 1, 1.15].map(v => (
              <button key={v} onClick={() => { setTouched(true); P().setSpeed(v) }} className={cn('h-10 flex-1 rounded-full text-xs font-bold', Math.abs(speed - v) < 0.01 ? 'bg-white text-black' : 'bg-white/10')}>{Math.round(v * 100)}%</button>
            ))}
          </div>
        </div>
      </div>

      {guide && (
        <button onClick={() => toggle(guide)} className={cn('mt-2 w-full h-12 rounded-2xl text-sm font-black flex items-center justify-center gap-2', on(guide) ? 'bg-white/10' : 'bg-[hsl(var(--primary))] text-black')}>
          {on(guide) ? <><MicOff className="h-4 w-4" /> Tirar a voz guia (cante você)</> : <><Mic className="h-4 w-4" /> Voz guia desligada · tocar de novo</>}
        </button>
      )}

      {instruments.length > 0 && (
        <>
          <p className="mt-3 text-[11px] font-bold uppercase tracking-wider text-white/45">Toque para tirar ou colocar um instrumento</p>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5">
            {instruments.map(({ s, name }) => (
              <button key={s.id} onClick={() => toggle(s)} className={cn('h-11 rounded-xl px-2 text-[12px] font-bold truncate transition-colors', on(s) ? 'bg-white/[0.12] text-white' : 'bg-white/[0.03] text-white/35 line-through')}>{name}</button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

import { useMemo, useState } from 'react'
import { Check, Undo2, Play, Pause, RotateCcw, Hand } from 'lucide-react'
import { toast } from 'sonner'
import { Sheet } from '@/components/ui/sheet'
import { usePlayerStore } from '@/store/playerStore'
import { useLyricsStore } from '@/store/lyricsStore'
import { useOwnLyrics, toLrc } from '@/store/ownLyricsStore'
import { formatTime, cn } from '@/lib/utils'

interface Props {
  mode: 'edit' | 'sync' | null
  initial: string
  onClose: () => void
}

/** Colar/editar a letra e sincronizar tocando (o músico toca na tela no começo de cada linha) */
export function LyricsEditor({ mode, initial, onClose }: Props) {
  const track = usePlayerStore(s => s.track)
  const playing = usePlayerStore(s => s.playbackState === 'playing')
  const currentTime = usePlayerStore(s => s.currentTime)
  const setPlain = useOwnLyrics(s => s.setPlain)
  const setLrc = useOwnLyrics(s => s.setLrc)
  const [text, setText] = useState(initial)
  const [times, setTimes] = useState<number[]>([])
  const lines = useMemo(() => text.split(/\r?\n/).map(l => l.trim()).filter(Boolean), [text])

  if (!track || !mode) return null
  const reload = () => useLyricsStore.getState().reload(track.artist, track.title, track.id, track.lrclibId)

  const saveText = () => {
    if (!text.trim()) { toast.error('Cole a letra antes de salvar.'); return }
    setPlain(track.id, text.trim())
    reload(); onClose()
    toast.success('Letra salva neste aparelho. Quer que ela role sozinha? Toque em "Sincronizar tocando".')
  }

  const mark = () => {
    if (times.length >= lines.length) return
    const t = Math.max(0, usePlayerStore.getState().currentTime - 0.15) // reação humana
    setTimes(ts => [...ts, t])
    try { navigator.vibrate?.(15) } catch {}
  }
  const saveSync = () => {
    if (times.length < 2) { toast.error('Marque pelo menos algumas linhas.'); return }
    setPlain(track.id, text.trim())
    setLrc(track.id, toLrc(lines, times))
    reload(); onClose()
    toast.success('Letra sincronizada! Agora ela acompanha a música, também no Modo Palco.')
  }
  const P = usePlayerStore.getState

  return (
    <Sheet open onClose={onClose} variant="full" title={mode === 'edit' ? 'Sua letra' : 'Sincronizar tocando'}
      footer={mode === 'edit' ? (
        <button onClick={saveText} className="w-full h-12 rounded-full bg-[hsl(var(--primary))] text-black font-bold flex items-center justify-center gap-2"><Check className="h-5 w-5" /> Salvar letra</button>
      ) : (
        <div className="space-y-2">
          <button onClick={mark} disabled={!playing || times.length >= lines.length}
            className="w-full h-20 rounded-3xl bg-[hsl(var(--primary))] text-black text-xl font-black flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-40">
            <Hand className="h-6 w-6" /> {times.length >= lines.length ? 'Todas marcadas!' : playing ? 'Toque quando a linha começar' : 'Dê play para começar'}
          </button>
          <div className="flex gap-2">
            <button onClick={() => (playing ? P().pause() : void P().play())} className="h-11 px-4 rounded-full bg-white/10 font-semibold flex items-center gap-1.5">{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}{playing ? 'Pausar' : 'Tocar'}</button>
            <button onClick={() => setTimes(ts => ts.slice(0, -1))} disabled={!times.length} className="h-11 px-4 rounded-full bg-white/10 font-semibold flex items-center gap-1.5 disabled:opacity-30"><Undo2 className="h-4 w-4" /> Voltar</button>
            <button onClick={() => { setTimes([]); P().seek(0) }} className="h-11 px-4 rounded-full bg-white/10 font-semibold flex items-center gap-1.5"><RotateCcw className="h-4 w-4" /></button>
            <button onClick={saveSync} disabled={times.length < 2} className="flex-1 h-11 rounded-full bg-white text-black font-bold disabled:opacity-30">Salvar</button>
          </div>
        </div>
      )}>
      {mode === 'edit' ? (
        <div className="p-4 space-y-2">
          <p className="text-sm text-[#b5b5b5]">Cole a letra de qualquer site (ou digite). Ela fica salva neste aparelho e aparece no player e no Modo Palco.</p>
          <textarea value={text} onChange={e => setText(e.target.value)} autoFocus placeholder={'Uma linha da letra por linha...'}
            className="w-full min-h-[55vh] rounded-2xl bg-white/[0.06] border border-white/10 p-3 text-base leading-relaxed outline-none focus:border-white/25" />
        </div>
      ) : (
        <div className="p-4">
          <p className="text-sm text-[#b5b5b5]">Dê play e toque no botão verde sempre que uma linha começar. Errou? Toque em “Voltar”.</p>
          <p className="mt-2 text-xs text-white/50 tabular-nums">{formatTime(currentTime)} · {times.length}/{lines.length} linhas</p>
          <ol className="mt-3 space-y-1">
            {lines.map((l, i) => (
              <li key={i} className={cn('rounded-xl px-3 py-2 text-[17px] leading-snug transition-colors',
                i === times.length ? 'bg-[hsl(var(--primary))]/20 text-white font-bold' : i < times.length ? 'text-white/40' : 'text-white/75')}>
                {times[i] !== undefined && <span className="mr-2 text-xs tabular-nums text-[hsl(var(--primary))]">{formatTime(times[i])}</span>}{l}
              </li>
            ))}
          </ol>
        </div>
      )}
    </Sheet>
  )
}

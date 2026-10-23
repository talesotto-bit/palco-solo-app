/**
 * Adicionar as músicas do próprio músico: VS multipista (pistas soltas ou .zip) ou música inteira.
 * Revisão antes de salvar (nome, artista, tom, nome de cada pista) e conferência de formato.
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Layers, Music2, Upload, Trash2, CheckCircle2, AlertTriangle, Loader2, Play, Pause, Lock, ListPlus, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { readSelection, saveDraft, checkPlayable, storageInfo, type ImportDraft, isAudioName } from '@/lib/importer'
import { useLocalTracksStore } from '@/store/localTracksStore'
import { usePlayerStore } from '@/store/playerStore'
import { useAddToShow } from '@/store/addToShowStore'
import { generateCover } from '@/store/catalogStore'
import { INSTRUMENT_ICONS } from '@/types/track'
import { confetti } from '@/lib/confetti'
import { cn } from '@/lib/utils'
import type { Track } from '@/types/track'

const mb = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.max(0.1, b / 1e6).toFixed(1)} MB`)
const inputCls = 'w-full h-11 rounded-xl bg-white/[0.07] border border-white/10 px-3 text-[15px] outline-none placeholder:text-[#6f6f6f] focus:border-white/30'

type Phase = 'pick' | 'reading' | 'review' | 'saving' | 'done'

export default function Importar() {
  const navigate = useNavigate()
  const addTracks = useLocalTracksStore(s => s.addTracks)
  const openAddToShow = useAddToShow(s => s.open)
  const [phase, setPhase] = useState<Phase>('pick')
  const [drafts, setDrafts] = useState<ImportDraft[]>([])
  const [playable, setPlayable] = useState<Record<string, number | null>>({})
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [saved, setSaved] = useState<Track[]>([])
  const [space, setSpace] = useState<{ usage: number; quota: number } | null>(null)
  const [drag, setDrag] = useState(false)
  const [previewing, setPreviewing] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const multiRef = useRef<HTMLInputElement>(null)
  const singleRef = useRef<HTMLInputElement>(null)

  useEffect(() => { void storageInfo().then(setSpace) }, [])
  useEffect(() => () => { audioRef.current?.pause() }, [])

  const handle = async (files: File[], mode: 'multi' | 'single') => {
    if (!files.length) return
    setPhase('reading')
    try {
      const list = await readSelection(files, mode)
      if (!list.length) { toast.error('Não encontrei arquivos de áudio. Use MP3, WAV, M4A ou um .zip com as pistas.'); setPhase('pick'); return }
      setDrafts(list); setPhase('review')
      // confere se o aparelho toca cada arquivo (em paralelo, sem travar a tela)
      for (const d of list) for (const s of d.stems) void checkPlayable(s.blob).then(v => setPlayable(p => ({ ...p, [`${d.id}/${s.key}`]: v })))
    } catch (err) {
      console.error(err)
      toast.error('Não consegui abrir esse arquivo. Se for .zip, confira se não está corrompido.')
      setPhase('pick')
    }
  }

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault(); setDrag(false)
    const files = [...e.dataTransfer.files]
    const audio = files.filter(f => isAudioName(f.name) || /\.zip$/i.test(f.name))
    void handle(audio, audio.length === 1 && !/\.zip$/i.test(audio[0].name) ? 'single' : 'multi')
  }

  const update = (id: string, patch: Partial<ImportDraft>) => setDrafts(ds => ds.map(d => (d.id === id ? { ...d, ...patch } : d)))
  const totalSize = drafts.reduce((n, d) => n + d.stems.reduce((m, s) => m + s.size, 0), 0)
  const broken = drafts.flatMap(d => d.stems.filter(s => playable[`${d.id}/${s.key}`] === null).map(s => s.name))
  const lowSpace = space && space.quota > 0 && space.quota - space.usage < totalSize * 1.2

  const preview = (key: string, blob: Blob) => {
    audioRef.current?.pause()
    if (previewing === key) { setPreviewing(null); return }
    const a = new Audio(URL.createObjectURL(blob)); audioRef.current = a
    a.play().catch(() => {}); a.onended = () => setPreviewing(null)
    setPreviewing(key)
  }

  const save = async () => {
    audioRef.current?.pause()
    setPhase('saving')
    const total = drafts.reduce((n, d) => n + d.stems.length, 0)
    let done = 0
    const out: Track[] = []
    try {
      for (const d of drafts) {
        const clean = { ...d, stems: d.stems.filter(s => playable[`${d.id}/${s.key}`] !== null) }
        if (!clean.stems.length) continue
        const t = await saveDraft(clean, () => { done++; setProgress({ done, total }) })
        t.coverUrl = generateCover(t.title, t.artist, Math.floor(Math.random() * 100))
        out.push(t)
      }
      addTracks(out); setSaved(out); setPhase('done'); confetti()
    } catch (err: any) {
      console.error(err)
      toast.error(/quota|espaço|space/i.test(String(err?.message || err)) ? 'Sem espaço no aparelho. Libere espaço e tente de novo.' : 'Não consegui salvar. Tente de novo.')
      setPhase('review')
    }
  }

  const openTrack = async (t: Track) => { navigate('/app/player'); await usePlayerStore.getState().loadTrack(t) }

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 pb-16" onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={onDrop}>
      <button onClick={() => navigate(-1)} className="h-10 -ml-2 px-2 flex items-center gap-2 text-[#b3b3b3]"><ArrowLeft className="h-5 w-5" /> Voltar</button>

      {(phase === 'pick' || phase === 'reading') && (
        <>
          <h1 className="text-[28px] font-black leading-tight">Adicione suas músicas</h1>
          <p className="mt-1 text-[15px] text-white/70">Toque seus próprios VS e faixas com tudo que o app tem: mixer, tom, velocidade, letra, cifra e Modo Palco.</p>

          <div className={cn('mt-5 grid gap-3 transition-opacity', phase === 'reading' && 'opacity-50 pointer-events-none')}>
            <button onClick={() => multiRef.current?.click()} className="group relative overflow-hidden rounded-3xl p-5 text-left border border-white/10 bg-gradient-to-br from-[#1f4a35] to-[#121212] active:scale-[0.99] transition-transform">
              <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-[hsl(var(--primary))]/25 blur-2xl" />
              <Layers className="h-9 w-9 text-[hsl(var(--primary))]" />
              <p className="mt-3 text-xl font-black">VS multipista</p>
              <p className="text-sm text-white/70">Escolha todas as pistas de uma vez (bateria, baixo, violão…) ou o <b>.zip</b> do VS. O app reconhece cada instrumento.</p>
              <span className="mt-3 inline-flex h-10 items-center gap-2 rounded-full bg-[hsl(var(--primary))] px-4 text-sm font-bold text-black"><Upload className="h-4 w-4" /> Escolher pistas ou .zip</span>
            </button>
            <button onClick={() => singleRef.current?.click()} className="group relative overflow-hidden rounded-3xl p-5 text-left border border-white/10 bg-gradient-to-br from-[#3a1f5a] to-[#121212] active:scale-[0.99] transition-transform">
              <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-purple-500/25 blur-2xl" />
              <Music2 className="h-9 w-9 text-purple-300" />
              <p className="mt-3 text-xl font-black">Música inteira</p>
              <p className="text-sm text-white/70">MP3, M4A ou WAV. Mude o tom e a velocidade, ensaie um trecho em loop e <b>tire a voz (beta)</b>.</p>
              <span className="mt-3 inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-bold text-black"><Upload className="h-4 w-4" /> Escolher música</span>
            </button>
          </div>

          <input ref={multiRef} type="file" multiple accept="audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.zip,application/zip" className="hidden"
            onChange={e => { void handle([...(e.target.files || [])], 'multi'); e.target.value = '' }} />
          <input ref={singleRef} type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg" multiple className="hidden"
            onChange={e => { void handle([...(e.target.files || [])], 'single'); e.target.value = '' }} />

          {phase === 'reading' && <p className="mt-4 flex items-center justify-center gap-2 text-sm text-white/70"><Loader2 className="h-4 w-4 animate-spin" /> Abrindo os arquivos...</p>}
          <div className={cn('mt-4 hidden md:flex h-28 items-center justify-center rounded-3xl border-2 border-dashed text-sm transition-colors', drag ? 'border-[hsl(var(--primary))] text-white bg-[hsl(var(--primary))]/10' : 'border-white/15 text-white/50')}>
            ou arraste pastas, pistas ou o .zip para cá
          </div>
          <p className="mt-5 flex items-start gap-2 text-xs text-white/50"><Lock className="h-4 w-4 shrink-0" /> Suas músicas ficam guardadas só neste aparelho. Nada é enviado para a internet.</p>
          {space && space.quota > 0 && <p className="mt-1 text-xs text-white/40 pl-6">Espaço livre para o app: {mb(Math.max(0, space.quota - space.usage))}</p>}
        </>
      )}

      {phase === 'review' && (
        <>
          <h1 className="text-[26px] font-black leading-tight">Confira antes de salvar</h1>
          <p className="text-sm text-white/60">{drafts.length} música{drafts.length > 1 ? 's' : ''} · {mb(totalSize)}</p>
          <div className="mt-4 space-y-4">
            {drafts.map(d => (
              <section key={d.id} className="rounded-3xl bg-white/[0.04] border border-white/[0.08] p-4">
                <div className="flex items-start gap-2">
                  <div className="flex-1 grid gap-2">
                    <input value={d.title} onChange={e => update(d.id, { title: e.target.value })} placeholder="Nome da música" className={cn(inputCls, 'h-12 text-lg font-bold')} />
                    <input value={d.artist} onChange={e => update(d.id, { artist: e.target.value })} placeholder="Artista (ajuda a achar letra e cifra)" className={inputCls} />
                    <div className="grid grid-cols-2 gap-2">
                      <input value={d.keyNote} onChange={e => update(d.id, { keyNote: e.target.value })} placeholder="Tom (ex.: G)" className={inputCls} />
                      <input inputMode="numeric" value={d.bpm} onChange={e => update(d.id, { bpm: e.target.value.replace(/\D/g, '') })} placeholder="BPM (opcional)" className={inputCls} />
                    </div>
                  </div>
                  {drafts.length > 1 && <button onClick={() => setDrafts(ds => ds.filter(x => x.id !== d.id))} aria-label="Tirar esta música" className="h-10 w-10 flex items-center justify-center rounded-full text-white/50 active:bg-white/10"><Trash2 className="h-4 w-4" /></button>}
                </div>
                <p className="mt-4 mb-2 text-xs font-bold uppercase tracking-wider text-white/50">{d.single ? 'Faixa' : `${d.stems.length} pistas`}</p>
                <ul className="space-y-1.5">
                  {d.stems.map(s => {
                    const st = playable[`${d.id}/${s.key}`]
                    const k = `${d.id}/${s.key}`
                    return (
                      <li key={s.key} className="flex items-center gap-2 rounded-2xl bg-white/[0.04] px-2.5 py-2">
                        <span className="text-lg w-7 text-center">{INSTRUMENT_ICONS[s.instrument] || '🎵'}</span>
                        <input value={s.label} onChange={e => update(d.id, { stems: d.stems.map(x => (x.key === s.key ? { ...x, label: e.target.value } : x)) })}
                          className="flex-1 min-w-0 bg-transparent text-[15px] font-medium outline-none focus:bg-white/5 rounded px-1 py-1" />
                        <span className="text-[11px] text-white/40 shrink-0">{mb(s.size)}</span>
                        {st === undefined ? <Loader2 className="h-4 w-4 animate-spin text-white/40 shrink-0" />
                          : st === null ? <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" aria-label="Formato não suportado neste aparelho" />
                          : <CheckCircle2 className="h-4 w-4 text-[hsl(var(--primary))] shrink-0" />}
                        <button onClick={() => preview(k, s.blob)} aria-label="Ouvir" className="h-8 w-8 flex items-center justify-center rounded-full bg-white/10 shrink-0">{previewing === k ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}</button>
                        {d.stems.length > 1 && <button onClick={() => update(d.id, { stems: d.stems.filter(x => x.key !== s.key) })} aria-label="Tirar pista" className="h-8 w-8 flex items-center justify-center rounded-full text-white/40 shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>}
                      </li>
                    )
                  })}
                </ul>
                {d.single && <p className="mt-3 flex items-center gap-1.5 text-xs text-purple-200/80"><Sparkles className="h-3.5 w-3.5" /> No player você vai ter o botão “Tirar a voz (beta)”.</p>}
              </section>
            ))}
          </div>
          {broken.length > 0 && <p className="mt-3 rounded-2xl bg-amber-500/10 px-3 py-2 text-xs text-amber-200">{broken.length} arquivo(s) em formato que este aparelho não toca e ficarão de fora. Prefira MP3 ou WAV.</p>}
          {lowSpace && <p className="mt-3 rounded-2xl bg-red-500/10 px-3 py-2 text-xs text-red-200">Pouco espaço livre no aparelho para {mb(totalSize)}. Libere espaço antes de salvar.</p>}
          <div className="mt-5 flex gap-2">
            <button onClick={() => { setDrafts([]); setPhase('pick') }} className="h-14 px-5 rounded-full bg-white/10 font-semibold">Voltar</button>
            <button onClick={save} className="flex-1 h-14 rounded-full bg-[hsl(var(--primary))] text-black text-lg font-black">Salvar na minha biblioteca</button>
          </div>
        </>
      )}

      {phase === 'saving' && (
        <div className="py-20 text-center">
          <Loader2 className="h-10 w-10 mx-auto animate-spin text-[hsl(var(--primary))]" />
          <p className="mt-4 text-lg font-bold">Guardando no seu aparelho...</p>
          <div className="mt-3 mx-auto max-w-xs h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-[hsl(var(--primary))] transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></div>
          <p className="mt-2 text-sm text-white/50">{progress.done} de {progress.total} arquivos</p>
        </div>
      )}

      {phase === 'done' && (
        <div className="py-10 text-center animate-pop-in">
          <CheckCircle2 className="h-16 w-16 mx-auto text-[hsl(var(--primary))]" />
          <h1 className="mt-4 text-3xl font-black">Pronto!</h1>
          <p className="mt-1 text-white/70">{saved.length === 1 ? `"${saved[0].title}" está na sua biblioteca.` : `${saved.length} músicas estão na sua biblioteca.`}</p>
          <div className="mt-6 grid gap-2 max-w-sm mx-auto">
            {saved[0] && <button onClick={() => void openTrack(saved[0])} className="h-14 rounded-full bg-[hsl(var(--primary))] text-black text-lg font-black flex items-center justify-center gap-2"><Play className="h-5 w-5 fill-current" /> Tocar agora</button>}
            {saved[0] && <button onClick={() => openAddToShow(saved[0])} className="h-12 rounded-full bg-white/10 font-semibold flex items-center justify-center gap-2"><ListPlus className="h-5 w-5" /> Adicionar a um show</button>}
            <button onClick={() => { setDrafts([]); setSaved([]); setPhase('pick') }} className="h-12 rounded-full bg-white/[0.05] font-semibold">Adicionar mais músicas</button>
          </div>
        </div>
      )}
    </div>
  )
}

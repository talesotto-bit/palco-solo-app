/**
 * "Grave-se tocando": o músico grava a voz ou o instrumento junto com o playback, ouve, ajusta e compartilha
 * (áudio para WhatsApp; vídeo vertical com a capa e a marca para Stories/Status).
 */
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Mic, Square, Play, Pause, Share2, Video, Download, RotateCcw, Trash2, Loader2, Headphones } from 'lucide-react'
import { Sheet } from '@/components/ui/sheet'
import { Slider } from '@/components/ui/slider'
import { usePlayerStore } from '@/store/playerStore'
import { useProgressStore } from '@/store/progressStore'
import { audioEngine } from '@/audio/AudioEngine'
import { TakeRecorder, renderPlayback, autoMicGain, mixTake, saveTake, listTakes, loadTake, deleteTake, shareOrDownload, type RawTake, type SavedTake } from '@/lib/recorder'
import { renderTakeVideo, videoSupported, VIDEO_MAX_SECONDS } from '@/lib/takeVideo'
import { useCoverArt } from '@/hooks/useCoverArt'
import { formatTime, cn } from '@/lib/utils'

type Phase = 'setup' | 'recording' | 'processing' | 'review'

export function RecordButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 h-9 rounded-full px-3.5 text-xs font-bold bg-red-500/15 text-red-300 shrink-0">
        <Mic className="h-4 w-4" /> Gravar
      </button>
      {open && <RecordTake onClose={() => setOpen(false)} />}
    </>
  )
}

function RecordTake({ onClose }: { onClose: () => void }) {
  const track = usePlayerStore(s => s.track)!
  const coverUrl = useCoverArt(track.artist, track.title, track.coverUrl)
  const [phase, setPhase] = useState<Phase>('setup')
  const [noHeadphones, setNoHeadphones] = useState(false)
  const [fromStart, setFromStart] = useState(true)
  const [secs, setSecs] = useState(0)
  const [take, setTake] = useState<RawTake | null>(null)
  const [playback, setPlayback] = useState<AudioBuffer | null>(null)
  const [micGain, setMicGain] = useState(1)
  const [pbGain, setPbGain] = useState(0.9)
  const [sync, setSync] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [saved, setSaved] = useState<SavedTake[]>(() => listTakes())
  const rec = useRef<TakeRecorder | null>(null)
  const levelRef = useRef<HTMLDivElement>(null)
  const autoGain = useRef(1)
  const counted = useRef(false)
  const savedId = useRef<string | null>(null)
  const cancelVideo = useRef({ cancelled: false })
  const position = usePlayerStore(s => s.currentTime)

  // ── gravar ──
  const begin = async () => {
    try {
      const P = usePlayerStore.getState()
      await audioEngine.unlock()
      const r = new TakeRecorder()
      await r.open(noHeadphones)
      rec.current = r
      if (P.loop) P.clearLoop()
      if (fromStart) P.seek(0)
      r.onAutoStop = () => void finish()
      await P.play()
      // a contagem (se ligada) toca antes: começa a captar já, a primeira amostra marca o ponto da música
      await r.start()
      setPhase('recording')
    } catch (err: any) {
      rec.current?.close(); rec.current = null
      const denied = err?.name === 'NotAllowedError' || err?.name === 'SecurityError'
      toast.error(denied ? 'Sem acesso ao microfone. Libere o microfone para este site nas configurações do navegador.' : (err?.message || 'Não foi possível usar o microfone.'))
    }
  }

  const finishing = useRef(false)
  const finish = async () => {
    if (finishing.current || !rec.current) return
    finishing.current = true
    const raw = rec.current.stop()
    rec.current = null
    usePlayerStore.getState().pause()
    if (!raw) { toast('Gravação muito curta. Tente de novo.'); setPhase('setup'); finishing.current = false; return }
    setPhase('processing')
    try {
      const pb = await renderPlayback(raw, usePlayerStore.getState().stemStates)
      if (!pb) throw new Error('sem playback')
      autoGain.current = autoMicGain(raw, pb)
      setTake(raw); setPlayback(pb); setMicGain(1); setPbGain(0.9); setSync(0)
      counted.current = false; savedId.current = null
      setPhase('review')
    } catch {
      toast.error('Não foi possível preparar a gravação. Tente de novo.')
      setPhase('setup')
    } finally { finishing.current = false }
  }

  // tempo e medidor durante a gravação; parou a música (pause/fim) = encerra
  useEffect(() => {
    if (phase !== 'recording') return
    let raf = 0
    const loop = () => {
      const r = rec.current
      if (r) {
        setSecs(r.seconds)
        if (levelRef.current) levelRef.current.style.transform = `scaleX(${Math.max(0.03, r.level)})`
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    const unsub = usePlayerStore.subscribe(s => { if (s.playbackState !== 'playing' && s.playbackState !== 'loading') void finish() })
    return () => { cancelAnimationFrame(raf); unsub() }
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // fechar no meio: não deixa o microfone aberto
  useEffect(() => () => { rec.current?.stop(); cancelVideo.current.cancelled = true; stopPreview() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── ouvir a gravação (playback e microfone separados: os ajustes valem na hora) ──
  const preview = useRef<{ srcs: AudioBufferSourceNode[]; mic: GainNode; pb: GainNode; startedAt: number; from: number } | null>(null)
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0)
  function stopPreview() {
    const p = preview.current
    if (!p) return
    p.srcs.forEach(s => { try { s.stop() } catch {} ; s.disconnect() })
    p.mic.disconnect(); p.pb.disconnect()
    preview.current = null
    setPlaying(false)
  }
  const startPreview = (from = pos) => {
    const ctx = audioEngine.audioContext
    if (!ctx || !take || !playback) return
    stopPreview()
    usePlayerStore.getState().pause()
    const micBuf = ctx.createBuffer(1, take.mic.length, take.sampleRate)
    micBuf.copyToChannel(take.mic as Float32Array<ArrayBuffer>, 0)
    const pb = ctx.createGain(), mic = ctx.createGain()
    pb.gain.value = pbGain; mic.gain.value = micGain * autoGain.current
    pb.connect(ctx.destination); mic.connect(ctx.destination)
    const a = ctx.createBufferSource(); a.buffer = playback; a.connect(pb)
    const b = ctx.createBufferSource(); b.buffer = micBuf; b.connect(mic)
    const when = ctx.currentTime + 0.05
    const shift = -take.inputLatency + sync / 1000 // atraso do microfone + ajuste do músico
    a.start(when, from)
    const micFrom = from - shift
    if (micFrom >= 0) b.start(when, micFrom); else b.start(when - micFrom, 0)
    a.onended = () => { if (preview.current?.srcs[0] === a) { stopPreview(); setPos(0) } }
    preview.current = { srcs: [a, b], mic, pb, startedAt: when, from }
    setPlaying(true)
  }
  useEffect(() => {
    if (!playing) return
    let raf = 0
    const loop = () => {
      const p = preview.current, ctx = audioEngine.audioContext
      if (p && ctx) setPos(Math.max(0, p.from + ctx.currentTime - p.startedAt))
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playing])
  useEffect(() => { if (preview.current) preview.current.mic.gain.value = micGain * autoGain.current }, [micGain])
  useEffect(() => { if (preview.current) preview.current.pb.gain.value = pbGain }, [pbGain])

  // ── exportar ──
  const finalMix = () => mixTake(take!, playback!, { micGain: micGain * autoGain.current, playbackGain: pbGain, syncMs: sync })
  const baseName = `${track.title} - minha gravação`
  const countIt = () => { if (!counted.current) { counted.current = true; useProgressStore.getState().addRecording() } }
  const toMp3 = async () => {
    const { encodeMp3 } = await import('@/lib/mp3Encoder')
    await new Promise(r => setTimeout(r, 30))
    return encodeMp3(finalMix())
  }
  const keep = async (mp3: Blob) => {
    const id = savedId.current || Math.random().toString(36).slice(2, 10)
    savedId.current = id
    await saveTake({ id, trackId: track.id, title: track.title, artist: track.artist, createdAt: Date.now(), seconds: Math.round(playback!.duration) }, mp3)
    setSaved(listTakes())
  }
  const shareAudio = async () => {
    setBusy('Gerando o áudio...'); stopPreview()
    try {
      const mp3 = await toMp3()
      await keep(mp3); countIt()
      const r = await shareOrDownload(mp3, `${baseName}.mp3`, `🎙️ ${track.title} — gravei no Power Tom`)
      if (r === 'downloaded') toast.success('Áudio salvo nos downloads')
    } catch { toast.error('Não foi possível gerar o áudio.') } finally { setBusy(null) }
  }
  const saveOnly = async () => {
    setBusy('Salvando...'); stopPreview()
    try { await keep(await toMp3()); countIt(); toast.success('Gravação salva no aparelho') } catch { toast.error('Não foi possível salvar.') } finally { setBusy(null) }
  }
  const shareVideo = async () => {
    stopPreview()
    cancelVideo.current = { cancelled: false }
    setBusy('Gerando o vídeo... 0%')
    try {
      const blob = await renderTakeVideo(finalMix(), { title: track.title, artist: track.artist, coverUrl },
        p => setBusy(`Gerando o vídeo... ${Math.round(p * 100)}%`), cancelVideo.current)
      if (!blob) { if (!cancelVideo.current.cancelled) toast.error('Este aparelho não consegue gerar vídeo. Compartilhe o áudio.'); return }
      countIt()
      const ext = blob.type.includes('mp4') ? 'mp4' : 'webm'
      const r = await shareOrDownload(blob, `${baseName}.${ext}`, `🎙️ ${track.title} — gravei no Power Tom`)
      if (r === 'downloaded') toast.success(ext === 'mp4' ? 'Vídeo salvo nos downloads' : 'Vídeo salvo (formato WebM)')
    } catch { toast.error('Não foi possível gerar o vídeo.') } finally { setBusy(null) }
  }
  const again = () => { stopPreview(); setTake(null); setPlayback(null); setPos(0); setPhase('setup') }

  // ── gravando: barra fixa (a letra e a cifra continuam visíveis) ──
  if (phase === 'recording') {
    return (
      <div className="fixed inset-x-3 z-50 rounded-2xl bg-[#1b0b0b]/95 border border-red-500/30 shadow-2xl backdrop-blur px-4 py-3 flex items-center gap-3"
        style={{ bottom: 'calc(72px + env(safe-area-inset-bottom, 0px))' }}>
        <span className="h-3 w-3 rounded-full bg-red-500 animate-pulse shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold">Gravando · <span className="tabular-nums">{formatTime(secs)}</span></p>
          <div className="mt-1.5 h-1.5 rounded-full bg-white/10 overflow-hidden"><div ref={levelRef} className="h-full w-full origin-left bg-red-400 transition-transform duration-75" /></div>
        </div>
        <button onClick={() => void finish()} className="h-11 px-4 rounded-full bg-white text-black font-bold flex items-center gap-2 shrink-0">
          <Square className="h-4 w-4 fill-current" /> Parar
        </button>
      </div>
    )
  }

  return (
    <Sheet open onClose={() => { if (!busy) onClose() }} title={phase === 'review' ? 'Sua gravação' : 'Grave-se tocando'}>
      <div className="p-4 space-y-4" style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}>
        {phase === 'setup' && (
          <>
            <p className="text-sm text-[#c8c8c8]">Toque ou cante junto com o playback. Depois você ouve, ajusta e compartilha no WhatsApp ou nos Stories.</p>
            <div className="flex items-start gap-3 rounded-xl bg-white/[0.05] p-3">
              <Headphones className="h-5 w-5 text-[hsl(var(--primary))] shrink-0 mt-0.5" />
              <p className="text-xs text-[#bdbdbd]"><b className="text-white">Use fone de ouvido</b>: o microfone grava só você e o playback entra limpo, direto das pistas.</p>
            </div>
            <label className="flex items-center gap-3 rounded-xl bg-white/[0.05] p-3 text-sm">
              <input type="checkbox" checked={noHeadphones} onChange={e => setNoHeadphones(e.target.checked)} className="h-5 w-5 accent-[hsl(var(--primary))]" />
              <span><b>Estou sem fone</b><span className="block text-xs text-[#9a9a9a]">Tira o som da caixa que vaza no microfone (a qualidade da gravação cai um pouco)</span></span>
            </label>
            <div className="flex gap-2">
              <button onClick={() => setFromStart(true)} className={cn('flex-1 h-10 rounded-full text-sm font-semibold', fromStart ? 'bg-white text-black' : 'bg-white/[0.07]')}>Do começo</button>
              <button onClick={() => setFromStart(false)} className={cn('flex-1 h-10 rounded-full text-sm font-semibold', !fromStart ? 'bg-white text-black' : 'bg-white/[0.07]')}>De {formatTime(position)}</button>
            </div>
            <button onClick={() => void begin()} className="w-full h-14 rounded-full bg-red-500 text-white text-lg font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
              <Mic className="h-5 w-5" /> Começar a gravar
            </button>
            {saved.length > 0 && <SavedList saved={saved} onChange={() => setSaved(listTakes())} />}
          </>
        )}

        {phase === 'processing' && (
          <p className="py-10 flex items-center justify-center gap-2 text-sm text-[#c8c8c8]"><Loader2 className="h-5 w-5 animate-spin" /> Juntando você com o playback...</p>
        )}

        {phase === 'review' && take && playback && (
          <>
            <div className="flex items-center gap-3">
              <button onClick={() => (playing ? stopPreview() : startPreview())} aria-label={playing ? 'Pausar' : 'Ouvir'}
                className="h-14 w-14 rounded-full bg-[hsl(var(--primary))] flex items-center justify-center shrink-0">
                {playing ? <Pause className="h-6 w-6 fill-black text-black" /> : <Play className="h-6 w-6 fill-black text-black ml-0.5" />}
              </button>
              <div className="flex-1 min-w-0">
                <Slider min={0} max={playback.duration} step={0.1} value={[pos]} onValueChange={([v]) => { setPos(v); if (playing) startPreview(v) }} />
                <div className="mt-1 flex justify-between text-[11px] tabular-nums text-[#9a9a9a]"><span>{formatTime(pos)}</span><span>{formatTime(playback.duration)}</span></div>
              </div>
            </div>
            <Control label="Você (voz ou instrumento)" value={`${Math.round(micGain * 100)}%`}>
              <Slider min={0} max={2.5} step={0.05} value={[micGain]} onValueChange={([v]) => setMicGain(v)} />
            </Control>
            <Control label="Playback" value={`${Math.round(pbGain * 100)}%`}>
              <Slider min={0} max={1.5} step={0.05} value={[pbGain]} onValueChange={([v]) => setPbGain(v)} />
            </Control>
            <Control label="Sincronia" value={`${sync > 0 ? '+' : ''}${sync} ms`} hint="Se você ficou atrasado em relação ao playback, puxe para a esquerda">
              <Slider min={-400} max={400} step={10} value={[sync]} onValueChange={([v]) => setSync(v)} onValueCommit={() => { if (playing) startPreview(Math.max(0, pos - 2)) }} />
            </Control>

            {busy ? (
              <div className="flex items-center justify-center gap-2 py-3 text-sm text-[#c8c8c8]">
                <Loader2 className="h-5 w-5 animate-spin" /> {busy}
                {busy.startsWith('Gerando o vídeo') && <button onClick={() => { cancelVideo.current.cancelled = true }} className="ml-2 h-8 px-3 rounded-full bg-white/10 text-xs font-semibold">Cancelar</button>}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => void shareAudio()} className="h-12 rounded-full bg-[hsl(var(--primary))] text-black font-bold flex items-center justify-center gap-2"><Share2 className="h-4 w-4" /> Enviar áudio</button>
                {videoSupported()
                  ? <button onClick={() => void shareVideo()} className="h-12 rounded-full bg-gradient-to-r from-pink-500 to-orange-400 text-white font-bold flex items-center justify-center gap-2"><Video className="h-4 w-4" /> Vídeo p/ Stories</button>
                  : <button disabled className="h-12 rounded-full bg-white/5 text-white/40 text-xs font-semibold">Vídeo indisponível neste aparelho</button>}
                <button onClick={() => void saveOnly()} className="h-11 rounded-full bg-white/[0.08] text-sm font-semibold flex items-center justify-center gap-2"><Download className="h-4 w-4" /> Salvar</button>
                <button onClick={again} className="h-11 rounded-full bg-white/[0.08] text-sm font-semibold flex items-center justify-center gap-2"><RotateCcw className="h-4 w-4" /> Gravar de novo</button>
              </div>
            )}
            {playback.duration > VIDEO_MAX_SECONDS && videoSupported() && <p className="text-[11px] text-[#8a8a8a] text-center">O vídeo usa o primeiro minuto (limite dos Stories). O áudio vai inteiro.</p>}
          </>
        )}
      </div>
    </Sheet>
  )
}

function Control({ label, value, hint, children }: { label: string; value: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-2"><span className="font-semibold text-white">{label}</span><span className="tabular-nums text-[#9a9a9a]">{value}</span></div>
      {children}
      {hint && <p className="mt-1.5 text-[11px] text-[#8a8a8a]">{hint}</p>}
    </div>
  )
}

/** Gravações guardadas no aparelho: ouvir, compartilhar, apagar */
function SavedList({ saved, onChange }: { saved: SavedTake[]; onChange: () => void }) {
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)
  useEffect(() => () => { audio.current?.pause() }, [])
  const play = async (t: SavedTake) => {
    if (playingId === t.id) { audio.current?.pause(); setPlayingId(null); return }
    const blob = await loadTake(t.id)
    if (!blob) { toast.error('Gravação não encontrada'); return }
    audio.current?.pause()
    const a = new Audio(URL.createObjectURL(blob))
    a.onended = () => setPlayingId(null)
    audio.current = a; void a.play(); setPlayingId(t.id)
  }
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-[#8a8a8a] mb-2">Minhas gravações</p>
      <div className="space-y-1.5">
        {saved.map(t => (
          <div key={t.id} className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-2 py-2">
            <button onClick={() => void play(t)} className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center shrink-0" aria-label={playingId === t.id ? 'Pausar' : 'Ouvir'}>
              {playingId === t.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
            </button>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold truncate">{t.title}</span>
              <span className="block text-[11px] text-[#8a8a8a]">{new Date(t.createdAt).toLocaleDateString('pt-BR')} · {formatTime(t.seconds)}</span>
            </span>
            <button onClick={async () => { const b = await loadTake(t.id); if (b) void shareOrDownload(b, `${t.title} - minha gravação.mp3`) }} aria-label="Compartilhar" className="h-9 w-9 rounded-full flex items-center justify-center text-[#cfcfcf]"><Share2 className="h-4 w-4" /></button>
            <button onClick={async () => { if (confirm('Apagar esta gravação?')) { await deleteTake(t.id); onChange() } }} aria-label="Apagar" className="h-9 w-9 rounded-full flex items-center justify-center text-red-300"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </div>
  )
}

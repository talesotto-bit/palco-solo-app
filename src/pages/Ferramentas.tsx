/**
 * Ferramentas do músico: afinador (violão e voz, pelo microfone) e metrônomo.
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Mic, MicOff, Play, Square, Minus, Plus, Hand } from 'lucide-react'
import { detectPitch, noteFromFreq, GUITAR_STRINGS, midiToFreq } from '@/lib/pitch'
import { usePlayerStore } from '@/store/playerStore'
import { audioEngine } from '@/audio/AudioEngine'
import { cn } from '@/lib/utils'

type Tab = 'afinador' | 'metronomo'

export default function Ferramentas() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('t') === 'metronomo' ? 'metronomo' : 'afinador'
  return (
    <div className="max-w-xl mx-auto px-4 py-4 pb-16">
      <button onClick={() => navigate(-1)} className="h-10 -ml-2 px-2 flex items-center gap-2 text-[#b3b3b3]"><ArrowLeft className="h-5 w-5" /> Voltar</button>
      <h1 className="text-[28px] font-black">Ferramentas</h1>
      <div className="mt-3 flex gap-2">
        {([['afinador', 'Afinador'], ['metronomo', 'Metrônomo']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setParams({ t: id }, { replace: true })}
            className={cn('h-10 flex-1 rounded-full text-sm font-bold', tab === id ? 'bg-white text-black' : 'bg-white/[0.08] text-white/80')}>{label}</button>
        ))}
      </div>
      <div className="mt-5">{tab === 'afinador' ? <Tuner /> : <Metronome />}</div>
    </div>
  )
}

// ─── Afinador ────────────────────────────────────────────────────────────────

function Tuner() {
  const [mode, setMode] = useState<'violao' | 'livre'>('violao')
  const [on, setOn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [freq, setFreq] = useState(-1)
  const [a4, setA4] = useState(440)
  const [target, setTarget] = useState<number | null>(null) // corda escolhida (midi) ou automática
  const refs = useRef<{ ctx?: AudioContext; stream?: MediaStream; raf?: number; hist: number[] }>({ hist: [] })

  const stop = () => {
    const r = refs.current
    if (r.raf) cancelAnimationFrame(r.raf)
    r.stream?.getTracks().forEach(t => t.stop())
    void r.ctx?.close().catch(() => {})
    refs.current = { hist: [] }
    setOn(false); setFreq(-1)
  }
  useEffect(() => stop, [])

  const start = async () => {
    setError(null)
    // pausa a música para o microfone ouvir só o instrumento
    if (usePlayerStore.getState().playbackState === 'playing') usePlayerStore.getState().pause()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
      await ctx.resume()
      const src = ctx.createMediaStreamSource(stream)
      const an = ctx.createAnalyser(); an.fftSize = 4096
      src.connect(an)
      const data = new Float32Array(an.fftSize)
      refs.current = { ctx, stream, hist: [] }
      let last = 0
      const loop = (t: number) => {
        refs.current.raf = requestAnimationFrame(loop)
        if (t - last < 70) return
        last = t
        an.getFloatTimeDomainData(data)
        const f = detectPitch(data.subarray(0, 2048), ctx.sampleRate)
        const h = refs.current.hist
        if (f > 0) { h.push(f); if (h.length > 5) h.shift() } else if (h.length) h.shift()
        const sorted = [...h].sort((x, y) => x - y)
        setFreq(sorted.length ? sorted[Math.floor(sorted.length / 2)] : -1)
      }
      refs.current.raf = requestAnimationFrame(loop)
      setOn(true)
    } catch (e: any) {
      setError(e?.name === 'NotAllowedError'
        ? 'O microfone foi bloqueado. Libere o microfone para este site nas configurações do navegador e tente de novo.'
        : 'Não consegui acessar o microfone deste aparelho.')
    }
  }

  const note = freq > 0 ? noteFromFreq(freq, a4) : null
  // no modo violão, compara com a corda escolhida ou com a mais próxima
  let cents = note?.cents ?? 0
  let stringIdx = -1
  if (note && mode === 'violao') {
    const midi = 69 + 12 * Math.log2(freq / a4)
    stringIdx = target !== null ? GUITAR_STRINGS.findIndex(s => s.midi === target)
      : GUITAR_STRINGS.reduce((best, s, i) => (Math.abs(s.midi - midi) < Math.abs(GUITAR_STRINGS[best].midi - midi) ? i : best), 0)
    cents = Math.round(1200 * Math.log2(freq / midiToFreq(GUITAR_STRINGS[stringIdx].midi, a4)))
  }
  const clamped = Math.max(-50, Math.min(50, cents))
  const inTune = note && Math.abs(cents) <= 5
  const shownName = mode === 'violao' && stringIdx >= 0 ? GUITAR_STRINGS[stringIdx].name : note?.name

  return (
    <div>
      <div className="flex gap-2">
        {([['violao', 'Violão / guitarra'], ['livre', 'Voz e outros']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setMode(id)} className={cn('h-9 px-3 rounded-full text-[13px] font-semibold', mode === id ? 'bg-[hsl(var(--primary))] text-black' : 'bg-white/[0.07]')}>{label}</button>
        ))}
      </div>

      <div className={cn('mt-5 rounded-[32px] p-6 text-center transition-colors duration-300 border',
        inTune ? 'bg-[hsl(var(--primary))]/20 border-[hsl(var(--primary))]/50' : 'bg-white/[0.04] border-white/10')}>
        <p className="text-sm font-semibold text-white/60 h-5">
          {!on ? 'Toque em "Ativar microfone"' : !note ? 'Toque uma corda ou cante uma nota...' : inTune ? 'Afinado! ✓' : cents < 0 ? 'Aperte (está baixo)' : 'Afrouxe (está alto)'}
        </p>
        <p className={cn('mt-2 text-[96px] leading-none font-black tabular-nums transition-colors', inTune ? 'text-[hsl(var(--primary))]' : 'text-white')}>{shownName || '—'}</p>
        <p className="mt-1 text-sm text-white/50 tabular-nums h-5">
          {note ? `${mode === 'violao' && stringIdx >= 0 ? `${GUITAR_STRINGS[stringIdx].n}ª corda · ${GUITAR_STRINGS[stringIdx].letter}` : `${note.letter}${note.octave}`} · ${freq.toFixed(1)} Hz` : ''}
        </p>
        {/* ponteiro */}
        <div className="relative mt-6 h-14">
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-gradient-to-r from-red-500/60 via-[hsl(var(--primary))] to-red-500/60" />
          {[-50, -25, 0, 25, 50].map(v => (
            <div key={v} className="absolute top-1/2 -translate-y-1/2" style={{ left: `${50 + v}%` }}>
              <div className={cn('w-0.5 -translate-x-1/2', v === 0 ? 'h-10 bg-white' : 'h-5 bg-white/30')} />
            </div>
          ))}
          {note && (
            <div className="absolute top-1/2 h-12 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-lg transition-[left] duration-150"
              style={{ left: `${50 + clamped}%`, background: inTune ? 'hsl(var(--primary))' : '#facc15' }} />
          )}
        </div>
        <p className="mt-1 text-xs text-white/50 tabular-nums">{note ? `${cents > 0 ? '+' : ''}${cents} cents` : ' '}</p>
      </div>

      {mode === 'violao' && (
        <div className="mt-4">
          <p className="text-xs text-white/50 mb-2">Corda (toque para fixar, ou deixe automático)</p>
          <div className="grid grid-cols-6 gap-1.5">
            {GUITAR_STRINGS.map((s, i) => (
              <button key={s.letter} onClick={() => setTarget(target === s.midi ? null : s.midi)}
                className={cn('h-14 rounded-2xl flex flex-col items-center justify-center font-bold border transition-colors',
                  target === s.midi ? 'bg-white text-black border-white' : stringIdx === i && note ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/15' : 'bg-white/[0.05] border-white/10')}>
                <span className="text-[15px]">{s.name}</span><span className="text-[10px] opacity-60">{s.letter}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="mt-4 rounded-2xl bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}
      <button onClick={() => (on ? stop() : void start())}
        className={cn('mt-5 w-full h-14 rounded-full text-lg font-black flex items-center justify-center gap-2', on ? 'bg-white/10' : 'bg-[hsl(var(--primary))] text-black')}>
        {on ? <><MicOff className="h-5 w-5" /> Parar</> : <><Mic className="h-5 w-5" /> Ativar microfone</>}
      </button>
      <div className="mt-4 flex items-center justify-center gap-3 text-xs text-white/50">
        <span>Lá de referência</span>
        <button onClick={() => setA4(v => Math.max(430, v - 1))} className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center"><Minus className="h-3.5 w-3.5" /></button>
        <span className="tabular-nums text-white font-semibold">{a4} Hz</span>
        <button onClick={() => setA4(v => Math.min(450, v + 1))} className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center"><Plus className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  )
}

// ─── Metrônomo ───────────────────────────────────────────────────────────────

function Metronome() {
  const trackBpm = usePlayerStore(s => s.track?.bpm || 0)
  const [bpm, setBpm] = useState(() => trackBpm || 100)
  const [beats, setBeats] = useState(4)
  const [running, setRunning] = useState(false)
  const [beat, setBeat] = useState(-1)
  const taps = useRef<number[]>([])
  const st = useRef<{ ctx?: AudioContext; timer?: number; next: number; count: number }>({ next: 0, count: 0 })
  const bpmRef = useRef(bpm); bpmRef.current = bpm
  const beatsRef = useRef(beats); beatsRef.current = beats

  const stop = () => {
    if (st.current.timer) clearInterval(st.current.timer)
    void st.current.ctx?.close().catch(() => {})
    st.current = { next: 0, count: 0 }
    setRunning(false); setBeat(-1)
  }
  useEffect(() => stop, [])

  const start = async () => {
    if (usePlayerStore.getState().playbackState === 'playing') usePlayerStore.getState().pause()
    void audioEngine.unlock()
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    await ctx.resume()
    st.current = { ctx, next: ctx.currentTime + 0.1, count: 0 }
    const schedule = () => {
      const s = st.current
      if (!s.ctx) return
      while (s.next < s.ctx.currentTime + 0.12) {
        const accent = s.count % beatsRef.current === 0
        const osc = s.ctx.createOscillator(), g = s.ctx.createGain()
        osc.frequency.value = accent ? 1760 : 1100
        g.gain.setValueAtTime(0.0001, s.next)
        g.gain.exponentialRampToValueAtTime(accent ? 0.9 : 0.5, s.next + 0.003)
        g.gain.exponentialRampToValueAtTime(0.0001, s.next + 0.06)
        osc.connect(g); g.connect(s.ctx.destination); osc.start(s.next); osc.stop(s.next + 0.07)
        const b = s.count % beatsRef.current
        const delay = Math.max(0, (s.next - s.ctx.currentTime) * 1000)
        setTimeout(() => setBeat(b), delay)
        s.next += 60 / bpmRef.current
        s.count++
      }
    }
    st.current.timer = window.setInterval(schedule, 25)
    schedule()
    setRunning(true)
  }

  const tap = () => {
    const now = performance.now()
    taps.current = [...taps.current.filter(t => now - t < 3000), now]
    if (taps.current.length >= 2) {
      const iv = taps.current.slice(1).map((t, i) => t - taps.current[i])
      const avg = iv.reduce((a, b) => a + b, 0) / iv.length
      setBpm(Math.max(40, Math.min(240, Math.round(60000 / avg))))
    }
  }

  return (
    <div className="text-center">
      <div className="flex justify-center gap-2.5 h-6 items-center">
        {Array.from({ length: beats }, (_, i) => (
          <span key={i} className={cn('rounded-full transition-all duration-75', i === 0 ? 'h-5 w-5' : 'h-4 w-4',
            beat === i ? (i === 0 ? 'bg-[hsl(var(--primary))] scale-125' : 'bg-white scale-110') : 'bg-white/15')} />
        ))}
      </div>
      <p className="mt-5 text-[96px] leading-none font-black tabular-nums">{bpm}</p>
      <p className="text-sm text-white/50">batidas por minuto</p>
      <div className="mt-5 flex items-center justify-center gap-3">
        <button onClick={() => setBpm(b => Math.max(40, b - 1))} className="h-14 w-14 rounded-full bg-white/10 flex items-center justify-center"><Minus className="h-6 w-6" /></button>
        <input type="range" min={40} max={240} value={bpm} onChange={e => setBpm(Number(e.target.value))} className="flex-1 accent-[hsl(var(--primary))]" aria-label="BPM" />
        <button onClick={() => setBpm(b => Math.min(240, b + 1))} className="h-14 w-14 rounded-full bg-white/10 flex items-center justify-center"><Plus className="h-6 w-6" /></button>
      </div>
      <div className="mt-4 flex justify-center gap-2">
        {[2, 3, 4, 6].map(n => (
          <button key={n} onClick={() => setBeats(n)} className={cn('h-10 w-14 rounded-full text-sm font-bold', beats === n ? 'bg-white text-black' : 'bg-white/[0.07]')}>{n}/4</button>
        ))}
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button onClick={tap} className="h-14 rounded-2xl bg-white/[0.07] font-bold flex items-center justify-center gap-2 active:bg-white/20"><Hand className="h-5 w-5" /> Bater o tempo</button>
        <button onClick={() => trackBpm && setBpm(trackBpm)} disabled={!trackBpm} className="h-14 rounded-2xl bg-white/[0.07] font-bold disabled:opacity-30">{trackBpm ? `BPM da música (${trackBpm})` : 'Sem BPM da música'}</button>
      </div>
      <button onClick={() => (running ? stop() : void start())}
        className={cn('mt-5 w-full h-14 rounded-full text-lg font-black flex items-center justify-center gap-2', running ? 'bg-white/10' : 'bg-[hsl(var(--primary))] text-black')}>
        {running ? <><Square className="h-5 w-5" /> Parar</> : <><Play className="h-5 w-5 fill-current" /> Começar</>}
      </button>
    </div>
  )
}

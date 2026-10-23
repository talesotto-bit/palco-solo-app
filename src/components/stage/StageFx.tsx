/**
 * Clima de show no Modo Palco: luzes que reagem ao som, abertura com contagem, troca de música,
 * barra do repertório, trava de tela, encerramento e plateia virtual (ensaio).
 */
import { useEffect, useRef, useState } from 'react'
import { Play, Lock, Users, Clock, RotateCcw, LogOut, Music2 } from 'lucide-react'
import { audioEngine } from '@/audio/AudioEngine'
import { CoverImg } from '@/components/shows/CoverImg'
import { confetti } from '@/lib/confetti'
import { tap } from '@/lib/haptics'
import { cn } from '@/lib/utils'
import type { Track } from '@/types/track'

// cores de refletor: cada música ganha uma combinação
const PALETTES: [string, string, string][] = [
  ['#22c55e', '#8b5cf6', '#06b6d4'], ['#f43f5e', '#f59e0b', '#8b5cf6'], ['#3b82f6', '#ec4899', '#22d3ee'],
  ['#f97316', '#eab308', '#ef4444'], ['#a855f7', '#22c55e', '#3b82f6'], ['#14b8a6', '#6366f1', '#f472b6'],
]
function paletteFor(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return PALETTES[Math.abs(h) % PALETTES.length]
}

/** Refletores ao fundo: pulsam com o volume da música (sem re-renderizar a tela) */
export function StageLights({ seed, on }: { seed: string; on: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [c1, c2, c3] = paletteFor(seed)
  useEffect(() => {
    if (!on) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let raf = 0, lvl = 0, t = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      if (document.hidden || !ref.current) return
      const raw = Math.min(1, audioEngine.getLevel() * 3.2)
      lvl = raw > lvl ? lvl + (raw - lvl) * 0.5 : lvl + (raw - lvl) * 0.06 // sobe rápido, desce devagar
      t += 0.004 + lvl * 0.01
      const el = ref.current
      el.style.setProperty('--lvl', lvl.toFixed(3))
      if (!reduce) { el.style.setProperty('--sw1', `${Math.sin(t) * 14}deg`); el.style.setProperty('--sw2', `${Math.sin(t * 1.3 + 2) * 14}deg`) }
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [on])
  if (!on) return null
  return (
    <div ref={ref} aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" style={{ ['--lvl' as any]: 0 }}>
      <div className="absolute -top-24 left-[8%] h-[85%] w-[45%] origin-top blur-2xl transition-colors duration-1000"
        style={{ background: `linear-gradient(180deg, ${c1}cc, transparent 80%)`, clipPath: 'polygon(42% 0, 58% 0, 100% 100%, 0 100%)', opacity: 'calc(0.12 + var(--lvl) * 0.55)', transform: 'rotate(var(--sw1, -8deg))' }} />
      <div className="absolute -top-24 right-[8%] h-[85%] w-[45%] origin-top blur-2xl transition-colors duration-1000"
        style={{ background: `linear-gradient(180deg, ${c2}cc, transparent 80%)`, clipPath: 'polygon(42% 0, 58% 0, 100% 100%, 0 100%)', opacity: 'calc(0.12 + var(--lvl) * 0.55)', transform: 'rotate(var(--sw2, 8deg))' }} />
      <div className="absolute inset-x-0 bottom-0 h-1/2 transition-colors duration-1000"
        style={{ background: `radial-gradient(ellipse at 50% 100%, ${c3}55, transparent 70%)`, opacity: 'calc(0.25 + var(--lvl) * 0.75)' }} />
    </div>
  )
}

/** Barra do repertório: um segmento por música, a atual enche com o andamento */
export function ShowProgress({ total, index, progress }: { total: number; index: number; progress: number }) {
  if (total < 2) return null
  return (
    <div className="flex gap-[3px] px-3 pt-1.5" aria-label={`Música ${index + 1} de ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="h-[3px] flex-1 rounded-full bg-white/15 overflow-hidden">
          <div className="h-full bg-white/80 transition-[width] duration-500" style={{ width: i < index ? '100%' : i === index ? `${progress}%` : '0%' }} />
        </div>
      ))}
    </div>
  )
}

function beep(freq: number, ms = 120) {
  const ctx = audioEngine.audioContext
  if (!ctx) return
  const o = ctx.createOscillator(), g = ctx.createGain()
  o.frequency.value = freq; o.type = 'sine'
  g.gain.setValueAtTime(0.0001, ctx.currentTime)
  g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + ms / 1000)
  o.connect(g).connect(ctx.destination)
  o.start(); o.stop(ctx.currentTime + ms / 1000 + 0.02)
}

/** Abertura do show: nome, local, repertório e contagem 3-2-1 */
export function ShowIntro({ name, venue, songs, minutes, firstTrack, onStart, onSkip }: {
  name: string; venue?: string; songs: number; minutes: number; firstTrack?: Track; onStart: () => void; onSkip: () => void
}) {
  const [count, setCount] = useState<number | null>(null)
  const start = async () => {
    tap(15)
    await audioEngine.unlock()
    setCount(3)
  }
  useEffect(() => {
    if (count === null) return
    if (count === 0) { onStart(); return }
    beep(count === 1 ? 1320 : 880)
    const id = setTimeout(() => setCount(c => (c === null ? null : c - 1)), 850)
    return () => clearTimeout(id)
  }, [count]) // eslint-disable-line react-hooks/exhaustive-deps
  const h = new Date().getHours()
  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md px-6 text-center animate-fade-in">
      {count !== null && count > 0 ? (
        <div key={count} className="text-[150px] font-black leading-none text-white animate-pop-in tabular-nums" style={{ textShadow: '0 0 60px hsl(var(--primary))' }}>{count}</div>
      ) : (
        <>
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-[hsl(var(--primary))]">{h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'}{venue ? `, ${venue}` : ''}!</p>
          <h1 className="mt-3 text-4xl font-black leading-tight">{name}</h1>
          <div className="mt-4 flex items-center justify-center gap-3 text-sm text-white/60">
            <span className="flex items-center gap-1"><Music2 className="h-4 w-4" /> {songs} músicas</span>
            {minutes > 0 && <span className="flex items-center gap-1"><Clock className="h-4 w-4" /> ~{minutes} min</span>}
          </div>
          {firstTrack && (
            <div className="mt-6 flex items-center gap-3 rounded-2xl bg-white/[0.07] p-2.5 pr-4 text-left">
              <div className="h-12 w-12 overflow-hidden rounded-lg"><CoverImg track={firstTrack} className="h-full w-full object-cover" /></div>
              <span className="min-w-0"><span className="block text-[10px] font-bold uppercase tracking-wider text-white/45">Abrindo com</span><span className="block truncate font-bold">{firstTrack.title}</span></span>
            </div>
          )}
          <button onClick={start} className="mt-8 h-16 px-10 rounded-full bg-[hsl(var(--primary))] text-black text-xl font-black flex items-center gap-2 shadow-[0_0_40px_hsl(var(--primary)/0.5)] active:scale-95 transition-transform">
            <Play className="h-6 w-6 fill-current" /> Começar o show
          </button>
          <button onClick={onSkip} className="mt-4 text-sm font-semibold text-white/50">Só abrir o palco</button>
        </>
      )}
    </div>
  )
}

/** Entre uma música e outra: capa, posição no show e anel de contagem */
export function NextUp({ at, track, index, total, onNow, onHold }: { at: number; track?: Track; index: number; total: number; onNow: () => void; onHold: () => void }) {
  const [now, setNow] = useState(Date.now())
  const [span] = useState(() => Math.max(1, at - Date.now()))
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 100); return () => clearInterval(id) }, [])
  const left = Math.max(0, at - now)
  const frac = Math.min(1, left / span)
  const R = 54, C = 2 * Math.PI * R
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/85 backdrop-blur-md px-6 animate-fade-in">
      <div className="text-center">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-white/50">Próxima · música {index + 1} de {total}</p>
        <div className="relative mx-auto mt-5 h-[132px] w-[132px]">
          <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90">
            <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="6" />
            <circle cx="60" cy="60" r={R} fill="none" stroke="hsl(var(--primary))" strokeWidth="6" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} style={{ transition: 'stroke-dashoffset .1s linear' }} />
          </svg>
          <div className="absolute inset-[14px] overflow-hidden rounded-full">{track && <CoverImg track={track} className="h-full w-full object-cover" />}</div>
          <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-[hsl(var(--primary))] px-3 py-0.5 text-lg font-black text-black tabular-nums">{Math.ceil(left / 1000)}</span>
        </div>
        <p className="mt-5 text-3xl font-black leading-tight">{track?.title}</p>
        <p className="text-white/60">{track?.artist}{track?.keyNote ? ` · Tom ${track.keyNote}` : ''}</p>
        <div className="mt-6 flex gap-3 justify-center">
          <button onClick={onNow} className="h-14 px-6 rounded-full bg-[hsl(var(--primary))] text-black text-lg font-bold flex items-center gap-2"><Play className="h-5 w-5 fill-current" /> Tocar agora</button>
          <button onClick={onHold} className="h-14 px-6 rounded-full bg-white/15 text-lg font-semibold">Segurar</button>
        </div>
      </div>
    </div>
  )
}

/** Trava contra toques sem querer: segure o botão para destravar (o pedal continua funcionando) */
export function StageLock({ onUnlock }: { onUnlock: () => void }) {
  const [hold, setHold] = useState(0)
  const timer = useRef<number | null>(null)
  const startHold = () => {
    const t0 = Date.now()
    timer.current = window.setInterval(() => {
      const p = Math.min(1, (Date.now() - t0) / 900)
      setHold(p)
      if (p >= 1) { stopHold(); tap(20); onUnlock() }
    }, 30)
  }
  const stopHold = () => { if (timer.current) clearInterval(timer.current); timer.current = null; setHold(0) }
  useEffect(() => () => stopHold(), []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="absolute inset-0 z-50 flex items-end justify-center pb-[calc(28px+env(safe-area-inset-bottom,0px))]" onContextMenu={e => e.preventDefault()}>
      <button onPointerDown={startHold} onPointerUp={stopHold} onPointerLeave={stopHold} onPointerCancel={stopHold}
        className="relative h-14 px-6 rounded-full bg-black/80 border border-white/20 text-sm font-bold flex items-center gap-2 overflow-hidden touch-none select-none">
        <span className="absolute inset-y-0 left-0 bg-[hsl(var(--primary))]/40" style={{ width: `${hold * 100}%` }} />
        <Lock className="relative h-4 w-4" /> <span className="relative">Tela travada · segure para destravar</span>
      </button>
    </div>
  )
}

/** Fim do show: resumo e comemoração */
export function ShowFinale({ songs, minutes, onRestart, onExit }: { songs: number; minutes: number; onRestart: () => void; onExit: () => void }) {
  useEffect(() => { confetti(); const id = setTimeout(confetti, 900); return () => clearTimeout(id) }, [])
  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md px-6 text-center animate-fade-in">
      <div className="text-7xl animate-pop-in">👏</div>
      <h1 className="mt-4 text-4xl font-black">Show encerrado!</h1>
      <p className="mt-2 text-white/60">Mandou bem. Cada show te deixa mais afiado.</p>
      <div className="mt-6 grid grid-cols-2 gap-3 w-full max-w-xs">
        <div className="rounded-2xl bg-white/[0.07] py-4"><p className="text-3xl font-black text-[hsl(var(--primary))]">{songs}</p><p className="text-xs text-white/55">músicas tocadas</p></div>
        <div className="rounded-2xl bg-white/[0.07] py-4"><p className="text-3xl font-black text-[hsl(var(--primary))]">{Math.max(1, minutes)}</p><p className="text-xs text-white/55">{Math.max(1, minutes) === 1 ? 'minuto de show' : 'minutos de show'}</p></div>
      </div>
      <div className="mt-8 flex flex-col gap-2 w-full max-w-xs">
        <button onClick={onExit} className="h-14 rounded-full bg-[hsl(var(--primary))] text-black text-lg font-black flex items-center justify-center gap-2"><LogOut className="h-5 w-5" /> Sair do palco</button>
        <button onClick={onRestart} className="h-12 rounded-full bg-white/10 font-semibold flex items-center justify-center gap-2"><RotateCcw className="h-4 w-4" /> Tocar o show de novo</button>
      </div>
    </div>
  )
}

/** Aplausos sintetizados (plateia virtual para ensaio): palmas aleatórias com sala */
let applauseBuf: AudioBuffer | null = null
export async function playApplause(seconds = 5) {
  await audioEngine.unlock()
  const ctx = audioEngine.audioContext
  if (!ctx) return
  if (!applauseBuf || applauseBuf.sampleRate !== ctx.sampleRate) {
    const sr = ctx.sampleRate, len = Math.floor(seconds * sr)
    const buf = ctx.createBuffer(2, len, sr)
    const L = buf.getChannelData(0), R = buf.getChannelData(1)
    const env = (t: number) => Math.min(1, t / 0.35) * (t > seconds - 2.2 ? Math.max(0, (seconds - t) / 2.2) : 1)
    const claps = Math.floor(seconds * 75)
    for (let c = 0; c < claps; c++) {
      let t: number
      do { t = Math.random() * seconds } while (Math.random() > env(t)) // mais palmas no meio
      const start = Math.floor(t * sr), amp = 0.25 + Math.random() * 0.75, pan = Math.random()
      const tau = (0.003 + Math.random() * 0.004) * sr, n = Math.floor(tau * 6)
      const a1 = Math.exp(-2 * Math.PI * (700 + Math.random() * 700) / sr), a2 = Math.exp(-2 * Math.PI * (2600 + Math.random() * 2600) / sr)
      let lp1 = 0, lp2 = 0
      for (let i = 0; i < n && start + i < len; i++) {
        const w = Math.random() * 2 - 1
        lp1 = a1 * lp1 + (1 - a1) * w; lp2 = a2 * lp2 + (1 - a2) * w
        const v = (lp2 - lp1) * amp * Math.exp(-i / tau)
        L[start + i] += v * (1 - pan * 0.7); R[start + i] += v * (0.3 + pan * 0.7)
      }
    }
    // sala: dois ecos curtos
    for (const ch of [L, R]) {
      const d1 = Math.floor(0.029 * sr), d2 = Math.floor(0.047 * sr)
      for (let i = d2; i < len; i++) ch[i] += ch[i - d1] * 0.32 + ch[i - d2] * 0.22
      let peak = 0
      for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(ch[i]))
      if (peak > 0) for (let i = 0; i < len; i++) ch[i] *= 0.6 / peak
    }
    applauseBuf = buf
  }
  const src = ctx.createBufferSource(), g = ctx.createGain()
  src.buffer = applauseBuf; g.gain.value = 0.7
  src.connect(g).connect(ctx.destination)
  src.start()
}

/** Botão de chip do palco com estado */
export function FxChip({ on, onClick, icon: Icon, label }: { on?: boolean; onClick: () => void; icon: any; label: string }) {
  return (
    <button onClick={onClick} aria-pressed={!!on}
      className={cn('h-10 px-3 rounded-full text-xs font-bold flex items-center gap-1.5 shrink-0 transition-colors', on ? 'bg-[hsl(var(--primary))] text-black' : 'bg-white/[0.08] text-white/80')}>
      <Icon className="h-4 w-4" /> {label}
    </button>
  )
}

export { Users as AudienceIcon }

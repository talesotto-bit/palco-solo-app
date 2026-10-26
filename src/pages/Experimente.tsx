/**
 * "Teste agora": o app de verdade, guiado. 4 músicas, com o player real (forma de onda, partes da música,
 * medidores, letra sincronizada) e 5 "missões" que fazem o músico sentir cada função em segundos:
 * tirar a voz, mudar o tom, tirar o próprio instrumento, ensaiar devagar e ver o Modo Palco.
 * Dentro da página de vendas (iframe) não mostra botão de compra; aberto sozinho (link do WhatsApp), mostra.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Play, Pause, Loader2, Minus, Plus, Mic, MicOff, Check, Sparkles, X, Lightbulb, AlignLeft, SlidersHorizontal, ShoppingBag } from 'lucide-react'
import { useCatalogStore } from '@/store/catalogStore'
import { usePlayerStore } from '@/store/playerStore'
import { audioEngine, isSupportStem } from '@/audio/AudioEngine'
import { CoverImg } from '@/components/shows/CoverImg'
import { ProgressBar } from '@/components/player/ProgressBar'
import { StemMixer } from '@/components/player/StemMixer'
import { LyricsPanel } from '@/components/player/LyricsPanel'
import { StageLights } from '@/components/stage/StageFx'
import { StageLyrics } from '@/pages/Performance'
import { formatTons } from '@/lib/musicTheory'
import { cn, normalizeSearch } from '@/lib/utils'
import { detectInstrument } from '@/lib/stemDetection'
import type { Stem } from '@/types/track'

const CHECKOUT = 'https://pay.cakto.com.br/ygt9oqx_1225675'
const EMBEDDED = typeof window !== 'undefined' && window.self !== window.top

const isGuide = (s: Stem) => { const t = `${s.id} ${s.label}`.toLowerCase(); return /(voz|guia|vocal|voice)/.test(t) && !/(back|coro|choir|backing)/.test(t) }

type MissionId = 'voz' | 'tom' | 'instrumento' | 'ensaio' | 'palco'
const MISSIONS: { id: MissionId; title: string; hint: string }[] = [
  { id: 'voz', title: 'Tire a voz e cante você', hint: 'A banda continua inteira, só a voz do cantor some' },
  { id: 'tom', title: 'Coloque no seu tom', hint: 'Sobe ou desce sem a bateria ficar robótica' },
  { id: 'instrumento', title: 'Tire o seu instrumento', hint: 'Toque o seu ao vivo com o resto da banda' },
  { id: 'ensaio', title: 'Ensaie devagar', hint: 'Mais lento sem mudar o tom, para pegar a parte difícil' },
  { id: 'palco', title: 'Veja como fica no palco', hint: 'Letra grande, luzes que seguem o som, show emendado' },
]

export default function Experimente() {
  const loadCatalog = useCatalogStore(s => s.loadCatalog)
  const tracks = useCatalogStore(s => s.tracks)
  const track = usePlayerStore(s => s.track)
  const state = usePlayerStore(s => s.playbackState)
  const pitch = usePlayerStore(s => Math.round(s.pitch))
  const speed = usePlayerStore(s => s.speed)
  const stemStates = usePlayerStore(s => s.stemStates)
  const preview = usePlayerStore(s => s.previewActive)
  const bg = usePlayerStore(s => s.bgProgress)
  const load = usePlayerStore(s => s.loadProgress)
  const P = usePlayerStore.getState
  const [started, setStarted] = useState(false)
  const [done, setDone] = useState<Set<MissionId>>(new Set())
  const [stage, setStage] = useState(false)
  const [tab, setTab] = useState<'letra' | 'mixer'>('letra')
  const [justReady, setJustReady] = useState(false)
  const celebrated = useRef(false)

  useEffect(() => { void loadCatalog('/experimente.json') }, [loadCatalog])
  useEffect(() => { if (tracks[0] && !track) void P().loadTrack(tracks[0]) }, [tracks]) // eslint-disable-line react-hooks/exhaustive-deps
  // saiu da aba: pausa
  useEffect(() => { const h = () => { if (document.hidden) P().pause() }; document.addEventListener('visibilitychange', h); return () => document.removeEventListener('visibilitychange', h) }, [P])

  const playing = state === 'playing', loading = state === 'loading'
  // as pistas separadas ainda estão chegando: tirar voz/instrumento só funciona depois
  const separating = loading || preview || !!bg
  const wasSeparating = useRef(separating)
  useEffect(() => {
    if (wasSeparating.current && !separating && started) { setJustReady(true); setTimeout(() => setJustReady(false), 4000) }
    wasSeparating.current = separating
  }, [separating, started])

  const guide = track?.stems.find(isGuide)
  const instruments = useMemo(() => {
    const ORDER = ['acoustic', 'guitar', 'keys', 'bass', 'drums', 'percussion', 'brass', 'strings', 'synth', 'choir', 'voice', 'main']
    const rank = (s: Stem) => { const i = ORDER.indexOf(detectInstrument(`${s.id} ${s.label}`)); return i < 0 ? 99 : i }
    const list = (track?.stems || []).filter(s => !s.derive && !isSupportStem(s) && s !== guide).sort((a, b) => rank(a) - rank(b)).slice(0, 6)
    // nomes limpos: tira o nome da música e o ".mp3" ("Banjo-deixa-alagar" → "Banjo"); repetidos ganham número
    const songWords = new Set(normalizeSearch(`${track?.title || ''} ${track?.artist || ''}`).split(/\s+/).filter(w => w.length > 2))
    const names = list.map(s => {
      const words = s.label.replace(/\.(mp3|wav)$/i, '').replace(/[-_]+/g, ' ').split(/\s+/).filter(w => w && !/^(mp3|wav)$/i.test(w) && !songWords.has(normalizeSearch(w)))
      const n = (words.join(' ') || s.label).replace(/^bumbu$/i, 'Bumbo')
      return n.charAt(0).toUpperCase() + n.slice(1)
    })
    const seen: Record<string, number> = {}
    return list.map((s, i) => { const n = names[i]; const dup = names.filter(x => x === n).length > 1; seen[n] = (seen[n] || 0) + 1; return { s, name: dup ? `${n} ${seen[n]}` : n } })
  }, [track, guide])
  // a voz guia começa ligada: o "uau" é ouvir a música completa e tirar a voz com um toque
  useEffect(() => { if (guide && P().stemStates[guide.id]?.muted) P().setStemMuted(guide.id, false) }, [track?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const mark = (m: MissionId) => setDone(d => (d.has(m) ? d : new Set(d).add(m)))
  useEffect(() => {
    if (done.size >= 3 && !celebrated.current) { celebrated.current = true; void import('@/lib/confetti').then(m => m.confetti()) }
  }, [done])

  const on = (s?: Stem) => !!s && !!stemStates[s.id] && !stemStates[s.id].muted
  const toggle = (s: Stem | undefined, m: MissionId) => { if (!s || separating) return; P().setStemMuted(s.id, on(s)); mark(m) }
  const start = () => { setStarted(true); void audioEngine.unlock(); void P().play() }
  const pick = (i: number) => { setStarted(true); void audioEngine.unlock(); void P().loadTrack(tracks[i], { autoplay: true }) }
  const playPause = () => { setStarted(true); void audioEngine.unlock(); P().togglePlay() }
  const setTom = (delta: number) => { P().setPitch(Math.round(P().pitch) + delta); mark('tom') }
  const setVel = (v: number) => { P().setSpeed(v); if (v !== 1) mark('ensaio') }
  const openStage = () => { setStage(true); mark('palco'); if (!playing) playPause() }
  const sepLabel = load ? `Separando os instrumentos ${load.loaded}/${load.total}…` : bg ? `Separando os instrumentos ${bg.loaded}/${bg.total}…` : 'Separando os instrumentos…'

  return (
    <div className={cn('min-h-dvh bg-[#0d0d0d] text-white select-none', !EMBEDDED && 'pb-24')}>
      <div className="mx-auto max-w-xl px-4 py-4">
        {/* topo */}
        <div className="flex items-center justify-between gap-2">
          <p className="text-[15px] font-black tracking-tight">Power<span className="text-[hsl(var(--primary))]">Tom</span> <span className="ml-1 text-[11px] font-semibold text-white/50">teste grátis</span></p>
          <span className="text-[11px] font-bold text-white/60">{done.size}/5 missões</span>
        </div>

        {/* músicas */}
        <div className="mt-3 flex gap-1.5 overflow-x-auto no-scrollbar">
          {tracks.map((x, i) => (
            <button key={x.id} onClick={() => pick(i)} className={cn('shrink-0 h-8 rounded-full px-3 text-xs font-bold', track?.id === x.id ? 'bg-white text-black' : 'bg-white/10 text-white/75')}>{x.title}</button>
          ))}
        </div>

        {/* player */}
        {track && (
          <div className="mt-3 rounded-2xl bg-gradient-to-b from-[#1b2a22] to-white/[0.04] border border-white/10 p-3">
            <div className="flex items-center gap-3">
              <div className="relative h-16 w-16 overflow-hidden rounded-xl shrink-0">
                <CoverImg track={track} className="h-full w-full object-cover" />
                {playing && <span className="absolute bottom-1 left-1 flex items-end gap-[2px] h-3"><span className="eq-bar w-[3px]" /><span className="eq-bar w-[3px]" style={{ animationDuration: '0.7s' }} /><span className="eq-bar w-[3px]" style={{ animationDuration: '0.5s' }} /></span>}
              </div>
              <div className="min-w-0 flex-1"><p className="truncate text-[17px] font-black">{track.title}</p><p className="truncate text-xs text-white/55">{track.artist} · {track.stems.filter(s => !isSupportStem(s)).length} pistas separadas</p></div>
              <button onClick={started ? playPause : start} aria-label={playing ? 'Pausar' : 'Tocar'} className={cn('h-14 w-14 shrink-0 rounded-full flex items-center justify-center shadow-lg', playing ? 'bg-[hsl(var(--primary))]' : 'bg-white')}>
                {loading && started ? <Loader2 className="h-6 w-6 animate-spin text-black" /> : playing ? <Pause className="h-6 w-6 fill-black text-black" /> : <Play className="h-6 w-6 fill-black text-black ml-0.5" />}
              </button>
            </div>
            <div className="mt-3"><ProgressBar /></div>
            {started && separating && <p className="mt-1 flex items-center gap-1.5 text-[11px] text-amber-200"><Loader2 className="h-3 w-3 animate-spin" /> {sepLabel} A música já toca enquanto isso.</p>}
            {justReady && <p className="mt-1 flex items-center gap-1.5 text-[11px] font-bold text-[hsl(var(--primary))]"><Check className="h-3.5 w-3.5" /> Banda separada! Agora tire a voz ou o seu instrumento.</p>}
          </div>
        )}

        {/* começar */}
        {!started && track && (
          <button onClick={start} className="mt-3 w-full h-14 rounded-2xl bg-[hsl(var(--primary))] text-black text-[17px] font-black flex items-center justify-center gap-2 shadow-[0_10px_30px_rgba(34,197,94,.25)] active:scale-[0.98] transition-transform">
            <Play className="h-5 w-5 fill-black" /> Tocar com a banda
          </button>
        )}

        {/* missões */}
        <div className="mt-4 space-y-2">
          <Mission n={1} m={MISSIONS[0]} done={done.has('voz')}>
            {guide ? (
              <button onClick={() => toggle(guide, 'voz')} disabled={separating}
                className={cn('w-full h-12 rounded-xl text-sm font-black flex items-center justify-center gap-2 transition-colors disabled:opacity-50', on(guide) ? 'bg-white text-black' : 'bg-[hsl(var(--primary))] text-black')}>
                {separating ? <><Loader2 className="h-4 w-4 animate-spin" /> Separando a voz…</> : on(guide) ? <><MicOff className="h-4 w-4" /> Tirar a voz do cantor</> : <><Mic className="h-4 w-4" /> Voz tirada! Cante por cima · trazer de volta</>}
              </button>
            ) : <p className="text-xs text-white/50">Esta música já vem sem voz guia.</p>}
          </Mission>

          <Mission n={2} m={MISSIONS[1]} done={done.has('tom')}>
            <div className="flex items-center gap-2">
              <button onClick={() => setTom(-1)} aria-label="Descer meio tom" className="h-12 w-14 rounded-xl bg-white/10 flex items-center justify-center active:bg-white/20"><Minus className="h-5 w-5" /></button>
              <span className={cn('flex-1 text-center text-[15px] font-black', pitch ? 'text-[hsl(var(--primary))]' : 'text-white/70')}>{pitch ? formatTons(pitch) : 'Tom original'}</span>
              <button onClick={() => setTom(1)} aria-label="Subir meio tom" className="h-12 w-14 rounded-xl bg-white/10 flex items-center justify-center active:bg-white/20"><Plus className="h-5 w-5" /></button>
            </div>
          </Mission>

          <Mission n={3} m={MISSIONS[2]} done={done.has('instrumento')}>
            <div className="grid grid-cols-3 gap-1.5">
              {instruments.map(({ s, name }) => (
                <button key={s.id} onClick={() => toggle(s, 'instrumento')} disabled={separating}
                  className={cn('h-11 rounded-xl px-2 text-[12px] font-bold truncate transition-colors disabled:opacity-50', on(s) ? 'bg-white/[0.12] text-white' : 'bg-red-500/15 text-red-300 line-through')}>{name}</button>
              ))}
            </div>
          </Mission>

          <Mission n={4} m={MISSIONS[3]} done={done.has('ensaio')}>
            <div className="flex gap-1.5">
              {[0.75, 0.9, 1].map(v => (
                <button key={v} onClick={() => setVel(v)} className={cn('h-11 flex-1 rounded-xl text-sm font-bold', Math.abs(speed - v) < 0.01 ? 'bg-white text-black' : 'bg-white/10')}>{v === 1 ? 'Normal' : `${Math.round(v * 100)}%`}</button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-white/45">Dica: toque numa parte da música (Verso, Refrão) para pular direto. Toque de novo para repetir só ela.</p>
          </Mission>

          <Mission n={5} m={MISSIONS[4]} done={done.has('palco')}>
            <button onClick={openStage} className="w-full h-12 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-black flex items-center justify-center gap-2">
              <Lightbulb className="h-4 w-4" /> Abrir o Modo Palco
            </button>
          </Mission>
        </div>

        {/* fechamento */}
        {done.size >= 3 && (
          <div className="mt-4 rounded-2xl border border-[hsl(var(--primary))]/40 bg-[hsl(var(--primary))]/10 p-4">
            <p className="flex items-center gap-2 text-[15px] font-black"><Sparkles className="h-5 w-5 text-[hsl(var(--primary))]" /> Agora imagina isso no seu show.</p>
            <p className="mt-1 text-[13px] text-white/75">No app completo são milhares de músicas de todos os gêneros mais tocados, Modo Palco com o show inteiro emendado, letra e cifra no seu tom, gravar e postar nos Stories, e os seus próprios VS.</p>
            {EMBEDDED
              ? <p className="mt-2 text-[13px] font-bold text-[hsl(var(--primary))]">Continue na página e garanta o seu acesso vitalício.</p>
              : <a href={CHECKOUT} className="mt-3 flex h-12 items-center justify-center rounded-xl bg-[hsl(var(--primary))] text-black font-black">Quero o Power Tom · R$ 47 vitalício</a>}
          </div>
        )}

        {/* letra e mixer completo (o app de verdade) */}
        {track && started && (
          <div className="mt-4">
            <div className="flex gap-1.5">
              {([['letra', 'Letra sincronizada', AlignLeft], ['mixer', 'Mixer completo', SlidersHorizontal]] as const).map(([id, label, Icon]) => (
                <button key={id} onClick={() => setTab(id)} className={cn('flex-1 h-9 rounded-full text-[12px] font-bold flex items-center justify-center gap-1', tab === id ? 'bg-white text-black' : 'bg-white/[0.07] text-white/75')}><Icon className="h-3.5 w-3.5" /> {label}</button>
              ))}
            </div>
            <div className="mt-2">{tab === 'letra' ? <div className="h-[55vh]"><LyricsPanel /></div> : <StemMixer />}</div>
          </div>
        )}
      </div>

      {/* compra fixa (só fora da página de vendas) */}
      {!EMBEDDED && started && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#0d0d0d]/95 backdrop-blur px-4 py-2.5" style={{ paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))' }}>
          <div className="mx-auto flex max-w-xl items-center gap-3">
            <div className="min-w-0 flex-1 leading-tight"><p className="text-[13px] font-black">App completo · R$ 47</p><p className="text-[11px] text-white/55">Pagamento único, acesso vitalício, 7 dias de garantia</p></div>
            <a href={CHECKOUT} className="h-11 shrink-0 rounded-full bg-[hsl(var(--primary))] px-4 text-sm font-black text-black flex items-center gap-1.5"><ShoppingBag className="h-4 w-4" /> Garantir</a>
          </div>
        </div>
      )}

      {/* Modo Palco (prévia): luzes que reagem ao som e letra grande */}
      {stage && track && (
        <div className="fixed inset-0 z-50 isolate bg-black text-white flex flex-col overflow-hidden">
          <StageLights seed={track.id} on />
          <div className="flex items-center gap-2 px-3 pt-3 shrink-0">
            <div className="min-w-0 flex-1"><p className="text-[11px] font-bold uppercase tracking-wider text-white/50">Modo Palco</p><p className="truncate text-xl font-black">{track.title}</p></div>
            <button onClick={() => setStage(false)} aria-label="Fechar o Modo Palco" className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center"><X className="h-5 w-5" /></button>
          </div>
          <div className="flex-1 min-h-0"><StageLyrics scale={1.1} syncHint={false} /></div>
          <div className="shrink-0 border-t border-white/10 bg-black/70 px-4 pt-3" style={{ paddingBottom: 'calc(14px + env(safe-area-inset-bottom, 0px))' }}>
            <ProgressBar />
            <div className="mt-2 flex items-center justify-center gap-3">
              {guide && <button onClick={() => toggle(guide, 'voz')} disabled={separating} className={cn('h-11 px-4 rounded-full text-xs font-bold flex items-center gap-1.5 disabled:opacity-50', on(guide) ? 'bg-white/10' : 'bg-[hsl(var(--primary))] text-black')}>{on(guide) ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />} {on(guide) ? 'Tirar voz' : 'Sem voz'}</button>}
              <button onClick={playPause} aria-label={playing ? 'Pausar' : 'Tocar'} className={cn('h-16 w-16 rounded-full flex items-center justify-center', playing ? 'bg-[hsl(var(--primary))]' : 'bg-white')}>
                {playing ? <Pause className="h-7 w-7 fill-black text-black" /> : <Play className="h-7 w-7 fill-black text-black ml-1" />}
              </button>
              <button onClick={() => setTom(1)} className="h-11 px-4 rounded-full bg-white/10 text-xs font-bold">{pitch ? formatTons(pitch) : 'Tom +'}</button>
            </div>
            <p className="mt-2 text-center text-[11px] text-white/45">No app completo: setlist que segue sozinho, pedal Bluetooth e funciona sem internet.</p>
          </div>
        </div>
      )}
    </div>
  )
}

function Mission({ n, m, done, children }: { n: number; m: { title: string; hint: string }; done: boolean; children: React.ReactNode }) {
  return (
    <div className={cn('rounded-2xl border p-3 transition-colors', done ? 'border-[hsl(var(--primary))]/40 bg-[hsl(var(--primary))]/[0.07]' : 'border-white/10 bg-white/[0.04]')}>
      <div className="mb-2 flex items-start gap-2.5">
        <span className={cn('mt-0.5 h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-[12px] font-black', done ? 'bg-[hsl(var(--primary))] text-black' : 'bg-white/10 text-white/70')}>{done ? <Check className="h-3.5 w-3.5" /> : n}</span>
        <span className="min-w-0"><span className="block text-[14px] font-black leading-tight">{m.title}</span><span className="block text-[11px] text-white/50">{m.hint}</span></span>
      </div>
      {children}
    </div>
  )
}

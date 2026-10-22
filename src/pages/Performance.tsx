/**
 * Modo Palco: o show em execução.
 * - Toca o show ativo em ordem, com contagem regressiva entre músicas (dá para tocar já ou segurar).
 * - Letra grande sincronizada, cifra no tom certo ou setlist, com um toque.
 * - Atalhos de palco: voz guia, click, tom, contagem, avançar sozinho, mixer.
 * - Pedal Bluetooth/teclado: espaço = play/pausa, → = próxima, ← = anterior.
 * - Tela sempre acesa, relógio, tempo de show e bateria.
 */
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Play, Pause, SkipBack, SkipForward, X, ListMusic, Mic, AlignLeft, Guitar, Minus, Plus,
  SlidersHorizontal, Timer, Repeat, Loader2, Maximize, BatteryMedium, AlertTriangle, StickyNote,
} from 'lucide-react'
import { usePlayerStore } from '@/store/playerStore'
import { useShowsStore } from '@/store/showsStore'
import { useStageSettings, type StageView } from '@/store/stageSettingsStore'
import { useLyricsStore } from '@/store/lyricsStore'
import { useCifraStore } from '@/store/cifraStore'
import { useAllTracks } from '@/hooks/useAllTracks'
import { useLyricSync, findActiveLine } from '@/hooks/useLyricSync'
import { useAutoScroll } from '@/hooks/useAutoScroll'
import { audioEngine, isSupportStem } from '@/audio/AudioEngine'
import { Sheet } from '@/components/ui/sheet'
import { StemMixer } from '@/components/player/StemMixer'
import { ChordSheet } from '@/components/player/ChordSheet'
import { useCifra, cifraClubUrl } from '@/components/player/CifrasPanel'
import { formatTons, transposeKey } from '@/lib/musicTheory'
import { formatTime, cn } from '@/lib/utils'
import type { Track, Stem } from '@/types/track'

// ─── utilidades ──────────────────────────────────────────────────────────────

function useWakeLock() {
  useEffect(() => {
    let lock: any = null
    const acquire = async () => { try { lock = await (navigator as any).wakeLock?.request('screen') } catch {} }
    void acquire()
    const onVis = () => { if (document.visibilityState === 'visible') void acquire() }
    document.addEventListener('visibilitychange', onVis)
    return () => { document.removeEventListener('visibilitychange', onVis); try { lock?.release() } catch {} }
  }, [])
}

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(id) }, [])
  return now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function useBattery() {
  const [level, setLevel] = useState<number | null>(null)
  useEffect(() => {
    let bat: any
    const upd = () => setLevel(Math.round(bat.level * 100))
    ;(navigator as any).getBattery?.().then((b: any) => { bat = b; upd(); b.addEventListener('levelchange', upd) }).catch(() => {})
    return () => { try { bat?.removeEventListener('levelchange', upd) } catch {} }
  }, [])
  return level
}

const isGuide = (s: Stem) => { const t = `${s.id} ${s.label}`.toLowerCase(); return /(voz|guia|vocal|voice)/.test(t) && !/(back|coro|choir|backing)/.test(t) }
const isClick = (s: Stem) => isSupportStem(s) && /click|clique|metr/.test(`${s.id} ${s.label}`.toLowerCase())
const isCount = (s: Stem) => isSupportStem(s) && /contagem|count|cue/.test(`${s.id} ${s.label}`.toLowerCase())

// ─── Letra de palco ─────────────────────────────────────────────────────────

function StageLyrics({ scale }: { scale: number }) {
  const track = usePlayerStore(s => s.track)
  const currentTime = usePlayerStore(s => s.currentTime)
  const playing = usePlayerStore(s => s.playbackState === 'playing')
  const { plainLyrics, syncedLines, isLoading, trackId, fetchLyrics } = useLyricsStore()
  const sync = useLyricSync(syncedLines)
  const box = useRef<HTMLDivElement>(null)
  const lineRefs = useRef(new Map<number, HTMLElement>())
  const userUntil = useRef(0)
  useAutoScroll(box, !syncedLines && !!plainLyrics)

  useEffect(() => { if (track && trackId !== track.id) void fetchLyrics(track.artist, track.title, track.id) }, [track?.id, trackId, fetchLyrics])
  const active = syncedLines ? findActiveLine(syncedLines, currentTime - sync.offset) : -1
  const searching = isLoading || (!!track && trackId !== track.id)

  useEffect(() => {
    if (active < 0 || Date.now() < userUntil.current) return
    const el = lineRefs.current.get(active), c = box.current
    if (el && c) c.scrollTo({ top: el.offsetTop - c.clientHeight * 0.32, behavior: 'smooth' })
  }, [active])
  useEffect(() => { box.current?.scrollTo({ top: 0 }) }, [track?.id])

  const base = 26 * scale
  if (!track) return null
  return (
    <div ref={box} onTouchMove={() => { userUntil.current = Date.now() + 4000 }} onWheel={() => { userUntil.current = Date.now() + 4000 }}
      className="h-full overflow-y-auto px-5 overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
      {searching && <p className="py-16 text-center text-white/50 flex items-center justify-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Buscando letra...</p>}
      {!searching && !syncedLines && !plainLyrics && (
        <div className="py-16 text-center">
          <p className="text-white/60 text-lg">Letra não encontrada para esta música.</p>
          <p className="text-white/40 text-sm mt-1">Veja a cifra ou o setlist nos botões acima.</p>
        </div>
      )}
      {syncedLines && (
        <div className="py-[30vh]">
          {syncedLines.map((l, i) => (
            <p key={i} ref={el => { if (el) lineRefs.current.set(i, el); else lineRefs.current.delete(i) }}
              onClick={() => { usePlayerStore.getState().seek(Math.max(0, l.time + sync.offset)); userUntil.current = 0 }}
              className={cn('py-2 font-bold leading-tight transition-all duration-300 cursor-pointer',
                i === active ? 'text-white' : i === active + 1 ? 'text-white/55' : i < active ? 'text-white/20' : 'text-white/35')}
              style={{ fontSize: i === active ? base * 1.12 : base }}>
              {l.text}
            </p>
          ))}
        </div>
      )}
      {!syncedLines && plainLyrics && <div className="py-6 whitespace-pre-wrap font-semibold text-white/90 leading-snug" style={{ fontSize: base * 0.85 }}>{plainLyrics}</div>}
      {syncedLines && playing && (
        <div className="fixed right-3 z-10" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 112px)' }}>
          <button onClick={sync.markStart} className="h-9 px-3 rounded-full bg-black/70 border border-white/15 text-xs font-bold text-white/80 active:bg-white/20">
            Letra fora? Toque quando começar a cantar
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Cifra de palco ─────────────────────────────────────────────────────────

function StageCifra({ scale }: { scale: number }) {
  const track = usePlayerStore(s => s.track)
  const pitch = usePlayerStore(s => Math.round(s.pitch))
  const offset = useCifraStore(s => (track ? s.offset[track.id] ?? 0 : 0))
  const { own, remote, state } = useCifra(track?.id, track?.artist || '', track?.title || '')
  const box = useRef<HTMLDivElement>(null)
  useAutoScroll(box, true)
  const content = own?.text ?? remote?.content ?? ''
  if (!track) return null
  return (
    <div ref={box} className="h-full overflow-y-auto px-4 py-4 overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
      {state === 'loading' && !content && <p className="py-16 text-center text-white/50 flex items-center justify-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Buscando cifra...</p>}
      {!content && state !== 'loading' && (
        <div className="py-12 text-center px-4">
          <p className="text-white/70 text-lg">Sem cifra para esta música.</p>
          <p className="text-white/45 text-sm mt-1">Antes do show, abra a música no Player → Cifra → "Colar cifra". Ela fica salva no aparelho.</p>
          <a href={cifraClubUrl(track.artist, track.title)} target="_blank" rel="noopener noreferrer" className="inline-block mt-4 h-10 leading-10 px-4 rounded-full bg-white/10 text-sm font-semibold">Abrir no Cifra Club</a>
        </div>
      )}
      {content && <ChordSheet content={content} transpose={pitch + offset} fontSize={19 * scale} stage />}
      <div className="h-40" />
    </div>
  )
}

// ─── Página ─────────────────────────────────────────────────────────────────

export default function Performance() {
  const navigate = useNavigate()
  const location = useLocation()
  useWakeLock()
  const clock = useClock()
  const battery = useBattery()

  const shows = useShowsStore(s => s.shows)
  const activeShowId = useShowsStore(s => s.activeShowId)
  const setActive = useShowsStore(s => s.setActive)
  const show = shows.find(s => s.id === activeShowId) || null
  const { byId, loading: libLoading } = useAllTracks()

  const track = usePlayerStore(s => s.track)
  const playbackState = usePlayerStore(s => s.playbackState)
  const currentTime = usePlayerStore(s => s.currentTime)
  const duration = usePlayerStore(s => s.duration)
  const pitch = usePlayerStore(s => s.pitch)
  const stemStates = usePlayerStore(s => s.stemStates)
  const queue = usePlayerStore(s => s.queue)
  const queueIndex = usePlayerStore(s => s.queueIndex)
  const loadProgress = usePlayerStore(s => s.loadProgress)
  const loadingStems = usePlayerStore(s => s.loadingStems)
  const pendingAdvance = usePlayerStore(s => s.pendingAdvance)
  const error = usePlayerStore(s => s.error)
  const P = usePlayerStore.getState

  const settings = useStageSettings()
  const [mixer, setMixer] = useState(false)
  const [showStart] = useState(() => Date.now())

  // monta a fila do show (sem reiniciar se o show já está tocando)
  const showTracks = useMemo(() => (show?.songs || []).map(s => byId.get(s.trackId)).filter(Boolean) as Track[], [show?.songs, byId])
  const started = useRef(false)
  useEffect(() => {
    if (started.current || !show || !showTracks.length) return
    started.current = true
    const startIndex = (location.state as any)?.startIndex ?? 0
    const sameQueue = queue.length === showTracks.length && queue.every((t, i) => t.id === showTracks[i].id)
    if (sameQueue && track && (location.state as any)?.startIndex === undefined) return
    const st = showTracks.findIndex(t => t.id === show.songs[startIndex]?.trackId)
    void P().setQueue(showTracks, Math.max(0, st))
  }, [show, showTracks]) // eslint-disable-line react-hooks/exhaustive-deps

  // pedal Bluetooth / teclado
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return
      if (e.key === ' ' || e.key === 'k' || e.key === 'MediaPlayPause') { e.preventDefault(); void audioEngine.unlock(); P().togglePlay() }
      else if (['ArrowRight', 'PageDown', 'MediaTrackNext'].includes(e.key)) { e.preventDefault(); if (P().pendingAdvance) P().advanceNow(); else void P().next() }
      else if (['ArrowLeft', 'PageUp', 'MediaTrackPrevious'].includes(e.key)) { e.preventDefault(); void P().prev() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [P])

  const stems = track?.stems || []
  const guide = stems.find(isGuide), click = stems.find(isClick), count = stems.find(isCount)
  const audible = (s?: Stem) => !!s && !!stemStates[s.id] && !stemStates[s.id].muted
  const toggleStem = (s?: Stem) => { if (s) P().setStemMuted(s.id, audible(s)) }

  const isPlaying = playbackState === 'playing'
  const isLoading = playbackState === 'loading'
  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0
  const nextTrack = queue[queueIndex + 1]
  const note = show?.songs.find(s => s.trackId === track?.id)?.note
  const elapsed = Math.floor((Date.now() - showStart) / 60000)

  // barra de progresso arrastável
  const barRef = useRef<HTMLDivElement>(null)
  const seekAt = useCallback((x: number) => {
    const r = barRef.current?.getBoundingClientRect()
    if (!r || !duration) return
    P().seek(Math.max(0, Math.min(1, (x - r.left) / r.width)) * duration)
  }, [duration, P])

  const view: StageView = settings.view
  const setView = (v: StageView) => settings.set({ view: v })
  const scale = settings.lyricScale

  // ── sem show escolhido ──
  if (!show) {
    return (
      <div className="fixed inset-0 z-50 bg-black text-white flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-xl font-bold">Modo Palco</h1>
          <button onClick={() => navigate(-1)} aria-label="Sair" className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-8">
          <p className="text-white/60 text-sm">Escolha o show que você vai tocar agora.</p>
          <div className="mt-4 space-y-2">
            {shows.map(sh => (
              <button key={sh.id} disabled={!sh.songs.length} onClick={() => { started.current = false; setActive(sh.id) }}
                className="w-full flex items-center gap-3 rounded-2xl bg-white/[0.06] px-4 py-4 text-left active:bg-white/10 disabled:opacity-40">
                <ListMusic className="h-6 w-6 text-[hsl(var(--primary))]" />
                <span className="flex-1 min-w-0"><span className="block font-bold truncate">{sh.name}</span><span className="text-xs text-white/50">{sh.songs.length} músicas</span></span>
                <Play className="h-5 w-5 fill-current" />
              </button>
            ))}
          </div>
          <button onClick={() => navigate('/app/shows')} className="mt-4 w-full h-12 rounded-full bg-[hsl(var(--primary))] text-black font-bold">
            {shows.length ? 'Montar um show novo' : 'Montar meu primeiro show'}
          </button>
          <p className="mt-3 text-center text-xs text-white/40">Dica: em "Shows" há repertórios prontos para tocar na hora.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-black text-white flex flex-col overflow-hidden select-none" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      {/* Topo */}
      <div className="flex items-center gap-2 px-3 pt-2 shrink-0">
        <button onClick={() => navigate(-1)} aria-label="Sair do palco" className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center shrink-0"><X className="h-4 w-4" /></button>
        <div className="min-w-0 flex-1 text-[11px] text-white/50 leading-tight">
          <p className="truncate font-semibold text-white/70">{show.name}</p>
          <p className="tabular-nums">{queueIndex >= 0 ? `Música ${queueIndex + 1} de ${queue.length}` : ''}{elapsed > 0 ? ` · ${elapsed} min de show` : ''}</p>
        </div>
        {battery !== null && <span className={cn('flex items-center gap-0.5 text-[11px] tabular-nums', battery <= 20 ? 'text-red-400' : 'text-white/50')}><BatteryMedium className="h-4 w-4" />{battery}%</span>}
        <span className="text-base font-bold tabular-nums">{clock}</span>
        {document.documentElement.requestFullscreen && !document.fullscreenElement && (
          <button onClick={() => document.documentElement.requestFullscreen().catch(() => {})} aria-label="Tela cheia" className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center shrink-0"><Maximize className="h-4 w-4" /></button>
        )}
      </div>

      {/* Música atual */}
      <div className="px-4 pt-2 pb-1 shrink-0">
        <h1 className="text-[26px] font-black leading-tight truncate">{track?.title || 'Carregando...'}</h1>
        <div className="flex items-center gap-2 text-sm text-white/60 min-w-0">
          <span className="truncate">{track?.artist}</span>
          {track?.keyNote && <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[11px] font-bold text-white">Tom {Math.round(pitch) ? transposeKey(track.keyNote, Math.round(pitch)) : track.keyNote}</span>}
          {Math.round(pitch) !== 0 && <span className="shrink-0 rounded bg-[hsl(var(--primary))]/20 px-1.5 py-0.5 text-[11px] font-bold text-[hsl(var(--primary))]">{formatTons(Math.round(pitch))}</span>}
          {track?.bpm ? <span className="shrink-0 text-[11px]">{track.bpm} BPM</span> : null}
        </div>
        {note && <p className="mt-1 flex items-center gap-1.5 rounded-lg bg-amber-400/15 px-2 py-1 text-[13px] font-semibold text-amber-200"><StickyNote className="h-4 w-4 shrink-0" />{note}</p>}
      </div>

      {/* Abas */}
      <div className="flex gap-1.5 px-4 py-2 shrink-0">
        {([['letra', 'Letra', AlignLeft], ['cifra', 'Cifra', Guitar], ['setlist', 'Setlist', ListMusic]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setView(id)} className={cn('h-9 flex-1 rounded-full text-[13px] font-bold flex items-center justify-center gap-1.5', view === id ? 'bg-white text-black' : 'bg-white/[0.08] text-white/70')}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
        {view !== 'setlist' && (
          <div className="flex shrink-0">
            <button onClick={() => settings.set({ lyricScale: Math.max(0.7, +(scale - 0.15).toFixed(2)) })} aria-label="Letra menor" className="h-9 w-9 rounded-l-full bg-white/[0.08] text-xs font-bold">A-</button>
            <button onClick={() => settings.set({ lyricScale: Math.min(1.9, +(scale + 0.15).toFixed(2)) })} aria-label="Letra maior" className="h-9 w-9 rounded-r-full bg-white/[0.08] text-sm font-bold border-l border-black">A+</button>
          </div>
        )}
      </div>

      {/* Conteúdo */}
      <div className="flex-1 min-h-0 relative">
        {view === 'letra' && <StageLyrics scale={scale} />}
        {view === 'cifra' && <StageCifra scale={scale} />}
        {view === 'setlist' && (
          <div className="h-full overflow-y-auto px-2 pb-6 overscroll-contain">
            {show.songs.map((s, i) => {
              const t = byId.get(s.trackId)
              const qi = queue.findIndex(q => q.id === s.trackId)
              const current = track?.id === s.trackId
              return (
                <button key={s.trackId} disabled={!t || qi < 0} onClick={() => { if (qi >= 0) void P().playQueueIndex(qi, { autoplay: isPlaying }) }}
                  className={cn('w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left active:bg-white/10 disabled:opacity-40', current && 'bg-white/10')}>
                  <span className={cn('w-7 text-center text-lg font-black tabular-nums', current ? 'text-[hsl(var(--primary))]' : 'text-white/30')}>{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className={cn('block text-lg font-bold truncate', current && 'text-[hsl(var(--primary))]')}>{s.title}</span>
                    <span className="block text-[13px] text-white/50 truncate">{s.artist}{s.note ? ` · 📝 ${s.note}` : ''}</span>
                  </span>
                  {current && isPlaying && <span className="flex items-end gap-[2px] h-4"><span className="eq-bar" /><span className="eq-bar" style={{ animationDuration: '.7s' }} /><span className="eq-bar" style={{ animationDuration: '.5s' }} /></span>}
                </button>
              )
            })}
          </div>
        )}

        {/* Carregando a música */}
        {isLoading && (
          <div className="absolute inset-x-4 top-4 rounded-2xl bg-[#111]/95 border border-white/10 px-4 py-3 flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--primary))]" />
            <div className="flex-1">
              <p className="text-sm font-semibold">Preparando {track?.title}</p>
              {loadProgress && <div className="mt-1.5 h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-[hsl(var(--primary))] transition-all" style={{ width: `${(loadProgress.loaded / loadProgress.total) * 100}%` }} /></div>}
            </div>
          </div>
        )}

        {/* Erro */}
        {playbackState === 'error' && (
          <div className="absolute inset-x-4 top-4 rounded-2xl bg-red-950/95 border border-red-500/30 px-4 py-3">
            <p className="text-sm font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> {error || 'Não foi possível tocar esta música.'}</p>
            <div className="mt-2 flex gap-2">
              <button onClick={() => void P().play()} className="h-9 px-4 rounded-full bg-white text-black text-sm font-bold">Tentar de novo</button>
              {nextTrack && <button onClick={() => void P().next()} className="h-9 px-4 rounded-full bg-white/15 text-sm font-semibold">Pular</button>}
            </div>
          </div>
        )}

        {/* Contagem regressiva para a próxima */}
        {pendingAdvance && <AdvanceOverlay at={pendingAdvance.at} title={queue[pendingAdvance.index]?.title || ''} />}
      </div>

      {/* Próxima */}
      {nextTrack && !pendingAdvance && (
        <button onClick={() => setView('setlist')} className="mx-4 mb-1 flex items-center gap-2 text-[12px] text-white/50 shrink-0 min-w-0">
          <span className="shrink-0 font-bold uppercase tracking-wider text-white/35">Próxima</span>
          <span className="truncate text-white/80 font-semibold">{nextTrack.title}</span>
        </button>
      )}

      {/* Controles */}
      <div className="shrink-0 border-t border-white/10 bg-[#0b0b0b] px-3 pt-2" style={{ paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))' }}>
        <div ref={barRef} className="relative h-7 flex items-center touch-none"
          onPointerDown={e => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); seekAt(e.clientX) }}
          onPointerMove={e => { if (e.buttons) seekAt(e.clientX) }}>
          <div className="h-2 w-full rounded-full bg-white/15 overflow-hidden"><div className="h-full bg-[hsl(var(--primary))]" style={{ width: `${progress}%` }} /></div>
          <div className="absolute h-5 w-5 rounded-full bg-white shadow -translate-x-1/2" style={{ left: `${progress}%` }} />
        </div>
        <div className="flex justify-between text-[11px] text-white/45 tabular-nums -mt-1">
          <span>{formatTime(currentTime)}</span><span>-{formatTime(Math.max(0, duration - currentTime))}</span>
        </div>

        <div className="flex items-center justify-center gap-5 py-1.5">
          <button onClick={() => void P().prev()} aria-label="Música anterior" className="h-14 w-14 rounded-full bg-white/[0.08] flex items-center justify-center active:bg-white/20"><SkipBack className="h-6 w-6 fill-current" /></button>
          <button onClick={() => { void audioEngine.unlock(); P().togglePlay() }} disabled={!track} aria-label={isPlaying ? 'Pausar' : 'Tocar'}
            className={cn('h-[72px] w-[72px] rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform disabled:opacity-40', isPlaying ? 'bg-[hsl(var(--primary))]' : 'bg-white')}>
            {isLoading ? <Loader2 className="h-7 w-7 animate-spin text-black" /> : isPlaying ? <Pause className="h-8 w-8 fill-black text-black" /> : <Play className="h-8 w-8 fill-black text-black ml-1" />}
          </button>
          <button onClick={() => { if (P().pendingAdvance) P().advanceNow(); else void P().next() }} disabled={!nextTrack && !pendingAdvance} aria-label="Próxima música"
            className="h-14 w-14 rounded-full bg-white/[0.08] flex items-center justify-center active:bg-white/20 disabled:opacity-25"><SkipForward className="h-6 w-6 fill-current" /></button>
        </div>

        {/* Atalhos de palco */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pt-1 pb-0.5 -mx-1 px-1">
          {guide && <Chip on={audible(guide)} onClick={() => toggleStem(guide)} icon={Mic} label="Voz guia" />}
          {click && <Chip on={audible(click)} onClick={() => toggleStem(click)} icon={Timer} label="Click" busy={loadingStems.includes(click.id)} />}
          {count && <Chip on={audible(count)} onClick={() => toggleStem(count)} icon={Timer} label="Contagem" busy={loadingStems.includes(count.id)} />}
          <div className="flex items-center rounded-full bg-white/[0.08] shrink-0">
            <button onClick={() => P().setPitch(Math.round(P().pitch) - 1)} aria-label="Descer meio tom" className="h-10 w-10 flex items-center justify-center"><Minus className="h-4 w-4" /></button>
            <span className={cn('text-xs font-bold min-w-[52px] text-center', Math.round(pitch) ? 'text-[hsl(var(--primary))]' : 'text-white/70')}>{Math.round(pitch) ? formatTons(Math.round(pitch)) : 'Tom'}</span>
            <button onClick={() => P().setPitch(Math.round(P().pitch) + 1)} aria-label="Subir meio tom" className="h-10 w-10 flex items-center justify-center"><Plus className="h-4 w-4" /></button>
          </div>
          <Chip on={settings.autoAdvance} onClick={() => settings.set({ autoAdvance: !settings.autoAdvance })} icon={Repeat}
            label={settings.autoAdvance ? `Seguir ${settings.advanceGap ? settings.advanceGap + 's' : 'direto'}` : 'Parar no fim'} />
          {settings.autoAdvance && (
            <button onClick={() => settings.set({ advanceGap: [0, 3, 5, 10, 15][([0, 3, 5, 10, 15].indexOf(settings.advanceGap) + 1) % 5] })}
              className="h-10 px-3 rounded-full bg-white/[0.08] text-xs font-bold shrink-0">Pausa: {settings.advanceGap}s</button>
          )}
          {track?.bpm ? <Chip on={settings.precount} onClick={() => P().togglePrecount()} icon={Timer} label="Contar 4" /> : null}
          <Chip on={false} onClick={() => setMixer(true)} icon={SlidersHorizontal} label="Mixer" />
        </div>
      </div>

      <Sheet open={mixer} onClose={() => setMixer(false)} title="Mixer da música">
        <div className="p-3" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}><StemMixer /></div>
      </Sheet>
      {libLoading && !track && <div className="absolute inset-0 flex items-center justify-center bg-black/80"><Loader2 className="h-8 w-8 animate-spin" /></div>}
    </div>
  )
}

function Chip({ on, onClick, icon: Icon, label, busy }: { on: boolean; onClick: () => void; icon: any; label: string; busy?: boolean }) {
  return (
    <button onClick={onClick} aria-pressed={on}
      className={cn('h-10 px-3 rounded-full text-xs font-bold flex items-center gap-1.5 shrink-0 transition-colors',
        on ? 'bg-[hsl(var(--primary))] text-black' : 'bg-white/[0.08] text-white/80')}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />} {label}
    </button>
  )
}

function AdvanceOverlay({ at, title }: { at: number; title: string }) {
  const [left, setLeft] = useState(Math.max(0, Math.ceil((at - Date.now()) / 1000)))
  useEffect(() => { const id = setInterval(() => setLeft(Math.max(0, Math.ceil((at - Date.now()) / 1000))), 200); return () => clearInterval(id) }, [at])
  const P = usePlayerStore.getState
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/85 backdrop-blur-sm px-6">
      <div className="text-center">
        <p className="text-sm font-bold uppercase tracking-widest text-white/50">Próxima música</p>
        <p className="mt-2 text-3xl font-black leading-tight">{title}</p>
        <p className="mt-4 text-7xl font-black tabular-nums text-[hsl(var(--primary))]">{left}</p>
        <div className="mt-6 flex gap-3 justify-center">
          <button onClick={() => P().advanceNow()} className="h-14 px-6 rounded-full bg-[hsl(var(--primary))] text-black text-lg font-bold flex items-center gap-2"><Play className="h-5 w-5 fill-current" /> Tocar agora</button>
          <button onClick={() => P().cancelAdvance()} className="h-14 px-6 rounded-full bg-white/15 text-lg font-semibold">Segurar</button>
        </div>
      </div>
    </div>
  )
}

/**
 * Modo Palco — sistema completo de gestão de show ao vivo.
 * 100% funcional em mobile (principal público).
 *
 * - Setlist editável (adicionar, remover, reordenar)
 * - Auto-advance para próxima faixa
 * - Mixer de stems com mute/solo/volume por instrumento
 * - Ajustes de tom e velocidade
 * - Notas por música
 * - Relógio de show
 * - Screen Wake Lock
 * - Touch-friendly (sem double-click)
 */

import { useNavigate } from 'react-router-dom'
import {
  Play, Pause, Square, SkipBack, SkipForward,
  RotateCcw, X, Layers, ListMusic, Plus,
  ChevronUp, ChevronDown, Trash2,
  Search, Clock, StickyNote, Check,
  ChevronLeft, ChevronRight, Save,
  Volume2, VolumeX,
} from 'lucide-react'
import { usePlayerStore } from '@/store/playerStore'
import { useSetlistStore, type SetlistItem } from '@/store/setlistStore'
import { useTrackSettingsStore } from '@/store/trackSettingsStore'
import { useCatalogStore } from '@/store/catalogStore'
import { useLocalTracksStore } from '@/store/localTracksStore'
import { PitchControl } from '@/components/player/PitchControl'
import { SpeedControl } from '@/components/player/SpeedControl'
import { Slider } from '@/components/ui/slider'
import { formatTime, semitonesToLabel, speedToLabel } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { Track } from '@/types/track'

// ─── Wake Lock ───────────────────────────────────────────────────────────────

function useWakeLock() {
  const lockRef = useRef<WakeLockSentinel | null>(null)
  useEffect(() => {
    async function acquire() {
      try {
        if ('wakeLock' in navigator) {
          lockRef.current = await navigator.wakeLock.request('screen')
        }
      } catch {}
    }
    acquire()
    const reacquire = () => { if (document.visibilityState === 'visible') acquire() }
    document.addEventListener('visibilitychange', reacquire)
    return () => { document.removeEventListener('visibilitychange', reacquire); lockRef.current?.release() }
  }, [])
}

// ─── Show Clock ──────────────────────────────────────────────────────────────

function useShowClock() {
  const [startTime] = useState(() => Date.now())
  const [elapsed, setElapsed] = useState(0)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => { setElapsed(Date.now() - startTime); setNow(new Date()) }, 1000)
    return () => clearInterval(id)
  }, [startTime])
  return {
    clock: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    elapsed: formatTime(Math.floor(elapsed / 1000)),
  }
}

// ─── Stem icon ───────────────────────────────────────────────────────────────

function stemIcon(stemId: string, label: string): string {
  const id = (stemId + ' ' + label).toLowerCase()
  if (/drum|bater|percus|click/.test(id)) return '🥁'
  if (/bass|baixo/.test(id)) return '🎸'
  if (/guitar|gtr|guitarra/.test(id)) return '🎸'
  if (/acoust|acust|violao|violo/.test(id)) return '🪕'
  if (/sanfon|acordeon/.test(id)) return '🪗'
  if (/key|piano|teclad|ep|rhodes|organ|cravo/.test(id)) return '🎹'
  if (/voice|vocal|voz|canto|guia/.test(id)) return '🎤'
  if (/choir|coro|back/.test(id)) return '🎙️'
  if (/brass|metal|horn|trompet|trombon/.test(id)) return '🎺'
  if (/string|cord|violin|cello/.test(id)) return '🎻'
  if (/synth|pad|fx|efeit/.test(id)) return '🎛️'
  return '🎵'
}

// ─── Types ───────────────────────────────────────────────────────────────────

type MobileView = 'player' | 'setlist' | 'addSong' | 'stems'
type BottomPanel = 'none' | 'pitch' | 'speed' | 'notes'

// ─── Main Component ─────────────────────────────────────────────────────────

export default function Performance() {
  const navigate = useNavigate()

  const {
    track, playbackState, currentTime, duration,
    pitch, speed, stemStates,
    play, pause, stop, seek, skipBackward, skipForward,
    setStemMuted, setStemSolo, setStemVolume,
    resetMix, loadTrack, togglePerformanceMode,
  } = usePlayerStore()

  const setlist = useSetlistStore()
  const saveSettings = useTrackSettingsStore(s => s.save)

  const catalogTracks = useCatalogStore(s => s.tracks)
  const localTracks = useLocalTracksStore(s => s.tracks)
  const allTracks = useMemo(() => [...localTracks, ...catalogTracks], [localTracks, catalogTracks])

  // Mobile uses full-screen views; desktop uses side panel
  const [mobileView, setMobileView] = useState<MobileView>('player')
  const [bottomPanel, setBottomPanel] = useState<BottomPanel>('none')
  const [addSearch, setAddSearch] = useState('')
  const [editingNotes, setEditingNotes] = useState('')
  const [autoAdvance, setAutoAdvance] = useState(true)
  const [justSaved, setJustSaved] = useState(false)

  useWakeLock()
  const { clock, elapsed } = useShowClock()

  const isPlaying = playbackState === 'playing'
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0
  const hasSolo = Object.values(stemStates).some(s => s.solo)
  const currentSetlistItem = setlist.items[setlist.currentIndex] as SetlistItem | undefined

  // ─── Auto-advance ──────────────────────────────────────────────────────

  const prevPlaybackState = useRef(playbackState)
  useEffect(() => {
    if (
      autoAdvance &&
      prevPlaybackState.current === 'playing' &&
      (playbackState === 'stopped' || playbackState === 'paused') &&
      currentTime >= duration - 0.5 && duration > 0 &&
      setlist.items.length > 0
    ) {
      setlist.goNext()
    }
    prevPlaybackState.current = playbackState
  }, [playbackState])

  // ─── Load track on setlist index change ────────────────────────────────

  const loadSetlistTrack = useCallback(async (index: number) => {
    const item = setlist.items[index]
    if (!item) return
    const fullTrack = allTracks.find(t => t.id === item.trackId)
    if (!fullTrack) return
    await loadTrack(fullTrack)
    setTimeout(() => {
      const s = usePlayerStore.getState()
      if (s.playbackState === 'paused') s.play()
    }, 300)
  }, [allTracks, loadTrack])

  const prevIndex = useRef(setlist.currentIndex)
  useEffect(() => {
    if (prevIndex.current !== setlist.currentIndex && setlist.items.length > 0) {
      loadSetlistTrack(setlist.currentIndex)
    }
    prevIndex.current = setlist.currentIndex
  }, [setlist.currentIndex, loadSetlistTrack])

  // ─── Helpers ───────────────────────────────────────────────────────────

  const addToSetlist = (t: Track) => {
    setlist.add({ trackId: t.id, title: t.title, artist: t.artist, coverUrl: t.coverUrl })
  }

  const isInSetlist = (trackId: string) => setlist.items.some(i => i.trackId === trackId)

  const addResults = useMemo(() => {
    if (!addSearch.trim()) return allTracks.slice(0, 50)
    const q = addSearch.toLowerCase()
    return allTracks.filter(t =>
      t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)
    ).slice(0, 50)
  }, [allTracks, addSearch])

  const handleSave = () => {
    if (!track) return
    saveSettings(track.id, pitch, speed, stemStates)
    setJustSaved(true)
    setTimeout(() => setJustSaved(false), 2000)
  }

  const playFromSetlist = (index: number) => {
    setlist.setCurrent(index)
    loadSetlistTrack(index)
    setMobileView('player')
  }

  const handlePrevSong = () => {
    if (currentTime > 3) { seek(0) }
    else { setlist.goPrev() }
  }

  const handleNextSong = () => { setlist.goNext() }

  const openNotes = () => {
    if (currentSetlistItem) setEditingNotes(currentSetlistItem.notes)
    setBottomPanel(p => p === 'notes' ? 'none' : 'notes')
  }

  const saveNotes = () => {
    if (currentSetlistItem) setlist.setNotes(setlist.currentIndex, editingNotes)
    setBottomPanel('none')
  }

  const handleExit = () => { togglePerformanceMode(); navigate('/app/player') }

  // Touch-based seek on progress bar
  const progressRef = useRef<HTMLDivElement>(null)
  const handleProgressTouch = (e: React.TouchEvent) => {
    const rect = progressRef.current?.getBoundingClientRect()
    if (!rect || !duration) return
    const touch = e.touches[0] || e.changedTouches[0]
    const pct = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width))
    seek(pct * duration)
  }

  // ─── Empty state ───────────────────────────────────────────────────────

  if (!track && setlist.items.length === 0 && mobileView === 'player') {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-black p-8">
        <ListMusic className="h-16 w-16 text-[#535353]" />
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white">Modo Palco</h2>
          <p className="text-[#b3b3b3] text-sm mt-2 max-w-xs">
            Monte seu setlist para ter controle total do show.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setMobileView('addSong')}
            className="h-12 rounded-full px-8 text-sm font-bold bg-[hsl(var(--primary))] text-black active:scale-95 transition-transform flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Montar Setlist
          </button>
          <button onClick={handleExit} className="h-12 rounded-full px-6 text-sm font-semibold bg-white/10 text-white active:bg-white/20">
            Voltar
          </button>
        </div>
      </div>
    )
  }

  // ─── SETLIST VIEW (mobile fullscreen) ──────────────────────────────────

  if (mobileView === 'setlist') {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-white/10"
          style={{ paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))' }}>
          <div className="min-w-0">
            <h2 className="text-base font-bold truncate">{setlist.name}</h2>
            <p className="text-[10px] text-[#808080]">{setlist.items.length} músicas</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setMobileView('addSong')}
              className="h-9 w-9 flex items-center justify-center rounded-full bg-[hsl(var(--primary))] text-black"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              onClick={() => setMobileView('player')}
              className="h-9 w-9 flex items-center justify-center rounded-full bg-white/10 text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto">
          {setlist.items.map((item, i) => {
            const isCurrent = i === setlist.currentIndex
            const isTrackPlaying = isCurrent && track?.id === item.trackId && isPlaying
            return (
              <div
                key={`${item.trackId}-${i}`}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 active:bg-white/10 transition-colors',
                  isCurrent ? 'bg-white/10' : ''
                )}
                onClick={() => playFromSetlist(i)}
              >
                <div className="w-6 text-center shrink-0">
                  {isTrackPlaying ? (
                    <div className="flex items-end justify-center gap-[2px] h-4">
                      <span className="eq-bar" style={{ animationDuration: '0.6s' }} />
                      <span className="eq-bar" style={{ animationDuration: '0.8s' }} />
                      <span className="eq-bar" style={{ animationDuration: '0.5s' }} />
                    </div>
                  ) : (
                    <span className={cn('text-sm tabular-nums font-bold', isCurrent ? 'text-[hsl(var(--primary))]' : 'text-[#808080]')}>
                      {i + 1}
                    </span>
                  )}
                </div>

                <img src={item.coverUrl} alt={item.title} className="h-11 w-11 rounded object-cover shrink-0" />

                <div className="min-w-0 flex-1">
                  <p className={cn('text-sm font-medium truncate', isCurrent ? 'text-[hsl(var(--primary))]' : 'text-white')}>
                    {item.title}
                  </p>
                  <p className="text-xs text-[#808080] truncate">{item.artist}</p>
                </div>

                {/* Always-visible mobile actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); setlist.moveUp(i) }}
                    className="p-2 text-[#808080] active:text-white disabled:opacity-20"
                    disabled={i === 0}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setlist.moveDown(i) }}
                    className="p-2 text-[#808080] active:text-white disabled:opacity-20"
                    disabled={i === setlist.items.length - 1}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setlist.remove(i) }}
                    className="p-2 text-[#808080] active:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )
          })}

          {setlist.items.length === 0 && (
            <div className="flex flex-col items-center py-16 gap-3">
              <p className="text-sm text-[#808080]">Setlist vazio</p>
              <button onClick={() => setMobileView('addSong')} className="text-sm font-semibold text-[hsl(var(--primary))]">
                + Adicionar músicas
              </button>
            </div>
          )}
        </div>

        {/* Auto-advance */}
        <div className="border-t border-white/10 px-4 py-3 flex items-center justify-between"
          style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}>
          <span className="text-xs text-[#808080]">Auto-avançar</span>
          <button
            onClick={() => setAutoAdvance(!autoAdvance)}
            className={cn('h-7 w-12 rounded-full transition-colors relative', autoAdvance ? 'bg-[hsl(var(--primary))]' : 'bg-white/20')}
          >
            <div className={cn('absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform', autoAdvance ? 'translate-x-[24px]' : 'translate-x-1')} />
          </button>
        </div>
      </div>
    )
  }

  // ─── ADD SONG VIEW (mobile fullscreen) ─────────────────────────────────

  if (mobileView === 'addSong') {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
        <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-white/10"
          style={{ paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))' }}>
          <h2 className="text-base font-bold">Adicionar Músicas</h2>
          <button
            onClick={() => setMobileView(setlist.items.length > 0 ? 'setlist' : 'player')}
            className="h-9 w-9 flex items-center justify-center rounded-full bg-white/10 text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#808080]" />
            <input
              type="text"
              placeholder="Buscar música..."
              value={addSearch}
              onChange={(e) => setAddSearch(e.target.value)}
              className="w-full h-11 rounded-lg bg-white/5 pl-10 pr-3 text-sm text-white placeholder:text-[#808080] border-0 outline-none focus:ring-1 focus:ring-white/20"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          {addResults.map(t => {
            const added = isInSetlist(t.id)
            return (
              <div
                key={t.id}
                className="flex items-center gap-3 px-4 py-3 active:bg-white/10 transition-colors"
                onClick={() => !added && addToSetlist(t)}
              >
                <img src={t.coverUrl} alt={t.title} className="h-11 w-11 rounded object-cover shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">{t.title}</p>
                  <p className="text-xs text-[#808080] truncate">{t.artist}</p>
                </div>
                {added ? (
                  <Check className="h-5 w-5 text-[hsl(var(--primary))] shrink-0" />
                ) : (
                  <div className="h-8 w-8 flex items-center justify-center rounded-full bg-white/10 shrink-0">
                    <Plus className="h-4 w-4 text-white" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ─── STEMS VIEW (mobile fullscreen mixer) ──────────────────────────────

  if (mobileView === 'stems') {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
        <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-white/10"
          style={{ paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))' }}>
          <div>
            <h2 className="text-base font-bold">Mixer de Stems</h2>
            <p className="text-[10px] text-[#808080]">{track?.stems.length || 0} pistas · {track?.title}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={resetMix} className="text-xs font-semibold text-[#808080] active:text-white px-3 py-1.5 rounded-full bg-white/5">
              Reset
            </button>
            <button onClick={() => setMobileView('player')} className="h-9 w-9 flex items-center justify-center rounded-full bg-white/10 text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Mini transport */}
        <div className="flex items-center justify-center gap-3 py-3 border-b border-white/10">
          <button onClick={() => skipBackward(5)} className="h-10 w-10 flex items-center justify-center rounded-full bg-white/5 active:bg-white/15">
            <SkipBack className="h-4 w-4" />
          </button>
          <button
            onClick={() => isPlaying ? pause() : play()}
            className={cn(
              'h-12 w-12 flex items-center justify-center rounded-full shadow-lg active:scale-95',
              isPlaying ? 'bg-[hsl(var(--primary))]' : 'bg-white'
            )}
          >
            {isPlaying
              ? <Pause className="h-5 w-5 fill-white text-white" />
              : <Play className="h-5 w-5 fill-black text-black ml-0.5" />
            }
          </button>
          <button onClick={() => skipForward(5)} className="h-10 w-10 flex items-center justify-center rounded-full bg-white/5 active:bg-white/15">
            <SkipForward className="h-4 w-4" />
          </button>
        </div>

        {/* Stem list with explicit M/S/Volume controls */}
        <div className="flex-1 overflow-y-auto" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          {track?.stems.map(stem => {
            const state = stemStates[stem.id]
            if (!state) return null
            const icon = stemIcon(stem.id, stem.label)
            const isActive = hasSolo ? state.solo : !state.muted

            return (
              <div key={stem.id} className={cn(
                'px-4 py-3 border-b border-white/5 transition-opacity',
                !isActive && 'opacity-40'
              )}>
                {/* Row 1: icon, name, M/S buttons */}
                <div className="flex items-center gap-3">
                  <span className="text-2xl shrink-0">{icon}</span>
                  <span className="text-sm font-medium flex-1 min-w-0 truncate">{stem.label}</span>

                  {/* Mute button */}
                  <button
                    onClick={() => setStemMuted(stem.id, !state.muted)}
                    className={cn(
                      'h-10 w-10 flex items-center justify-center rounded-lg text-xs font-bold transition-colors',
                      state.muted
                        ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                        : 'bg-white/10 text-white border border-white/10'
                    )}
                  >
                    {state.muted ? <VolumeX className="h-4 w-4" /> : 'M'}
                  </button>

                  {/* Solo button */}
                  <button
                    onClick={() => setStemSolo(stem.id, !state.solo)}
                    className={cn(
                      'h-10 w-10 flex items-center justify-center rounded-lg text-xs font-bold transition-colors',
                      state.solo
                        ? 'bg-[hsl(var(--primary))]/30 text-[hsl(var(--primary))] border border-[hsl(var(--primary))]/50'
                        : 'bg-white/10 text-white border border-white/10'
                    )}
                  >
                    S
                  </button>
                </div>

                {/* Row 2: Volume slider */}
                <div className="flex items-center gap-3 mt-2 pl-10">
                  <Volume2 className="h-3.5 w-3.5 text-[#808080] shrink-0" />
                  <Slider
                    min={0}
                    max={1}
                    step={0.01}
                    value={[state.volume]}
                    onValueChange={([v]) => setStemVolume(stem.id, v)}
                    disabled={state.muted}
                  />
                  <span className="text-[10px] text-[#808080] tabular-nums w-8 text-right shrink-0">
                    {Math.round(state.volume * 100)}%
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ─── PLAYER VIEW (main stage) ──────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white select-none overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-2 pb-1 shrink-0"
        style={{ paddingTop: 'calc(8px + env(safe-area-inset-top, 0px))' }}>
        {/* Left */}
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={() => setMobileView('setlist')}
            className={cn(
              'flex items-center justify-center h-10 w-10 rounded-full shrink-0 transition-colors',
              'bg-white/10 text-white active:bg-white/20'
            )}
          >
            <ListMusic className="h-5 w-5" />
          </button>

          <div className="min-w-0">
            {setlist.items.length > 0 && (
              <p className="text-[9px] text-[#808080] font-medium leading-none mb-0.5">
                {setlist.currentIndex + 1}/{setlist.items.length} · {setlist.name}
              </p>
            )}
            <h1 className="text-base md:text-xl font-black truncate leading-tight">
              {track?.title || 'Nenhuma faixa'}
            </h1>
            <p className="text-[11px] text-[#808080] truncate">{track?.artist || ''}</p>
          </div>
        </div>

        {/* Right */}
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          <div className="flex flex-col items-end mr-1">
            <span className="text-sm font-bold tabular-nums text-white leading-none">{clock}</span>
            <span className="text-[9px] text-[#808080] tabular-nums flex items-center gap-0.5 leading-none mt-0.5">
              <Clock className="h-2 w-2" />
              {elapsed}
            </span>
          </div>

          {pitch !== 0 && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[hsl(var(--primary))]/20 text-[hsl(var(--primary))]">
              {semitonesToLabel(pitch)}
            </span>
          )}
          {speed !== 1 && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white/10 text-white/70">
              {speedToLabel(speed)}
            </span>
          )}

          <button onClick={handleExit} className="h-8 w-8 flex items-center justify-center rounded-full bg-white/10 text-[#808080] active:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Progress bar — touch-friendly */}
      <div className="px-4 shrink-0 mt-1">
        <div
          ref={progressRef}
          className="h-3 rounded-full bg-white/10 cursor-pointer relative"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            seek(((e.clientX - rect.left) / rect.width) * duration)
          }}
          onTouchMove={handleProgressTouch}
          onTouchStart={handleProgressTouch}
        >
          <div className="absolute inset-y-0 left-0 rounded-full bg-[hsl(var(--primary))]" style={{ width: `${progress}%` }} />
          <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-5 w-5 rounded-full bg-white shadow-lg" style={{ left: `${progress}%` }} />
        </div>
        <div className="flex items-center justify-between mt-1 text-[10px] text-white/40 tabular-nums">
          <span>{formatTime(currentTime)}</span>
          <span>-{formatTime(Math.max(0, duration - currentTime))}</span>
        </div>
      </div>

      {/* Main controls area */}
      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4 min-h-0">
        {/* Setlist navigation */}
        {setlist.items.length > 1 && (
          <div className="flex items-center gap-5 text-[#808080]">
            <button onClick={handlePrevSong} disabled={setlist.currentIndex === 0 && currentTime < 3}
              className="flex items-center gap-1 text-xs font-medium active:text-white disabled:opacity-30 py-2 px-3">
              <ChevronLeft className="h-4 w-4" /> Anterior
            </button>
            <span className="text-xs tabular-nums font-bold">{setlist.currentIndex + 1} / {setlist.items.length}</span>
            <button onClick={handleNextSong} disabled={setlist.currentIndex >= setlist.items.length - 1}
              className="flex items-center gap-1 text-xs font-medium active:text-white disabled:opacity-30 py-2 px-3">
              Próxima <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Notes banner */}
        {currentSetlistItem?.notes && bottomPanel !== 'notes' && (
          <div className="max-w-md w-full px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-center">
            <p className="text-[11px] text-yellow-200/80 line-clamp-2">{currentSetlistItem.notes}</p>
          </div>
        )}

        {/* Transport */}
        <div className="flex items-center gap-2.5">
          <button onClick={() => seek(0)} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/5 text-white active:bg-white/20">
            <RotateCcw className="h-5 w-5" />
          </button>
          <button onClick={() => skipBackward(5)} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/5 text-white active:bg-white/20">
            <SkipBack className="h-5 w-5" />
          </button>
          <button
            onClick={() => isPlaying ? pause() : play()}
            className={cn(
              'flex h-[72px] w-[72px] items-center justify-center rounded-full shadow-xl transition-all active:scale-95',
              isPlaying ? 'bg-[hsl(var(--primary))] shadow-[hsl(var(--primary))]/40' : 'bg-white text-black shadow-white/20'
            )}
          >
            {isPlaying
              ? <Pause className="h-8 w-8 fill-white text-white" />
              : <Play className="h-8 w-8 fill-black text-black ml-1" />
            }
          </button>
          <button onClick={() => skipForward(5)} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/5 text-white active:bg-white/20">
            <SkipForward className="h-5 w-5" />
          </button>
          <button onClick={stop} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/5 text-white active:bg-white/20">
            <Square className="h-4 w-4" />
          </button>
        </div>

        {/* Action buttons — 2 rows on mobile for bigger touch targets */}
        <div className="flex items-center gap-2 flex-wrap justify-center max-w-sm">
          <button
            onClick={() => setBottomPanel(p => p === 'pitch' ? 'none' : 'pitch')}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-semibold transition-colors',
              bottomPanel === 'pitch' ? 'bg-[hsl(var(--primary))] text-black' : 'bg-white/10 text-white active:bg-white/20'
            )}
          >
            🎵 Tom
          </button>
          <button
            onClick={() => setBottomPanel(p => p === 'speed' ? 'none' : 'speed')}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-semibold transition-colors',
              bottomPanel === 'speed' ? 'bg-[hsl(var(--primary))] text-black' : 'bg-white/10 text-white active:bg-white/20'
            )}
          >
            ⏱️ Velocidade
          </button>
          {track?.hasStems && (
            <button
              onClick={() => setMobileView('stems')}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-semibold transition-colors',
                'bg-white/10 text-white active:bg-white/20'
              )}
            >
              <Layers className="h-3.5 w-3.5" />
              Mixer {hasSolo && '(Solo)'}
            </button>
          )}
          {currentSetlistItem && (
            <button onClick={openNotes}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-semibold transition-colors',
                bottomPanel === 'notes' ? 'bg-yellow-500 text-black' : 'bg-white/10 text-white active:bg-white/20'
              )}
            >
              <StickyNote className="h-3.5 w-3.5" /> Notas
            </button>
          )}
          <button onClick={handleSave}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-semibold transition-colors',
              justSaved ? 'bg-green-500 text-black' : 'bg-white/10 text-white active:bg-white/20'
            )}
          >
            {justSaved ? <><Check className="h-3.5 w-3.5" /> Salvo!</> : <><Save className="h-3.5 w-3.5" /> Salvar</>}
          </button>
        </div>
      </div>

      {/* Bottom panels */}
      <div className="shrink-0 max-h-[45vh] overflow-y-auto">
        {bottomPanel === 'pitch' && (
          <div className="mx-3 mb-2 rounded-2xl bg-white/5 border border-white/10 p-4">
            <PitchControl compact />
          </div>
        )}
        {bottomPanel === 'speed' && (
          <div className="mx-3 mb-2 rounded-2xl bg-white/5 border border-white/10 p-4">
            <SpeedControl compact />
          </div>
        )}
        {bottomPanel === 'notes' && (
          <div className="mx-3 mb-2 rounded-2xl bg-white/5 border border-yellow-500/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-yellow-500/70">Notas</p>
              <button onClick={saveNotes} className="text-xs font-semibold text-yellow-400 flex items-center gap-1">
                <Check className="h-3 w-3" /> Salvar
              </button>
            </div>
            <textarea
              value={editingNotes}
              onChange={(e) => setEditingNotes(e.target.value)}
              placeholder="Ex: Começar no refrão, subir tom no final..."
              className="w-full h-20 rounded-lg bg-black/40 text-sm text-white placeholder:text-[#535353] p-3 border border-white/10 outline-none focus:border-yellow-500/30 resize-none"
            />
          </div>
        )}
      </div>

      {/* Safe area */}
      <div className="shrink-0" style={{ height: 'calc(6px + env(safe-area-inset-bottom, 0px))' }} />
    </div>
  )
}

/**
 * Modo Palco — sistema completo de gestão de show ao vivo.
 *
 * Funcionalidades:
 *  - Setlist editável (adicionar, remover, reordenar músicas)
 *  - Auto-advance para próxima faixa
 *  - Ajustes salvos por música (tom, velocidade, stems)
 *  - Relógio de show e contagem de tempo
 *  - Controles grandes para palco (touch-friendly)
 *  - Notas por música
 *  - Tela cheia sem distrações
 *  - Screen Wake Lock (tela sempre ligada)
 */

import { useNavigate } from 'react-router-dom'
import {
  Play, Pause, Square, SkipBack, SkipForward,
  RotateCcw, X, Layers, ListMusic, Plus,
  ChevronUp, ChevronDown, Trash2, GripVertical,
  Search, Clock, StickyNote, Check,
  ChevronLeft, ChevronRight, Save,
} from 'lucide-react'
import { usePlayerStore } from '@/store/playerStore'
import { useSetlistStore, type SetlistItem } from '@/store/setlistStore'
import { useTrackSettingsStore } from '@/store/trackSettingsStore'
import { useCatalogStore } from '@/store/catalogStore'
import { useLocalTracksStore } from '@/store/localTracksStore'
import { PitchControl } from '@/components/player/PitchControl'
import { SpeedControl } from '@/components/player/SpeedControl'
import { formatTime, semitonesToLabel, speedToLabel } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { Track } from '@/types/track'

// ─── Wake Lock (keep screen on) ──────────────────────────────────────────────

function useWakeLock() {
  const lockRef = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    async function acquire() {
      try {
        if ('wakeLock' in navigator) {
          lockRef.current = await navigator.wakeLock.request('screen')
        }
      } catch { /* not supported or denied */ }
    }
    acquire()

    const reacquire = () => {
      if (document.visibilityState === 'visible') acquire()
    }
    document.addEventListener('visibilitychange', reacquire)

    return () => {
      document.removeEventListener('visibilitychange', reacquire)
      lockRef.current?.release()
    }
  }, [])
}

// ─── Show Clock ──────────────────────────────────────────────────────────────

function useShowClock() {
  const [startTime] = useState(() => Date.now())
  const [elapsed, setElapsed] = useState(0)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Date.now() - startTime)
      setNow(new Date())
    }, 1000)
    return () => clearInterval(id)
  }, [startTime])

  return {
    clock: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    elapsed: formatTime(Math.floor(elapsed / 1000)),
  }
}

// ─── Stem icon helper ────────────────────────────────────────────────────────

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

// ─── Panel types ─────────────────────────────────────────────────────────────

type SidePanel = 'none' | 'setlist' | 'addSong'
type BottomPanel = 'none' | 'stems' | 'pitch' | 'speed' | 'notes'

// ─── Main Component ──────────────────────────────────────────────────────────

export default function Performance() {
  const navigate = useNavigate()

  // Player state
  const {
    track, playbackState, currentTime, duration,
    pitch, speed, stemStates,
    play, pause, stop, seek, skipBackward, skipForward,
    setStemMuted, setStemSolo,
    resetMix, loadTrack, togglePerformanceMode,
  } = usePlayerStore()

  // Setlist state
  const setlist = useSetlistStore()
  const saveSettings = useTrackSettingsStore(s => s.save)
  const hasSavedSettings = useTrackSettingsStore(s => s.has)

  // Library for adding songs
  const catalogTracks = useCatalogStore(s => s.tracks)
  const localTracks = useLocalTracksStore(s => s.tracks)
  const allTracks = useMemo(() => [...localTracks, ...catalogTracks], [localTracks, catalogTracks])

  // UI state
  const [sidePanel, setSidePanel] = useState<SidePanel>('none')
  const [bottomPanel, setBottomPanel] = useState<BottomPanel>('none')
  const [addSearch, setAddSearch] = useState('')
  const [editingNotes, setEditingNotes] = useState('')
  const [autoAdvance, setAutoAdvance] = useState(true)
  const [justSaved, setJustSaved] = useState(false)

  // Hooks
  useWakeLock()
  const { clock, elapsed } = useShowClock()

  const isPlaying = playbackState === 'playing'
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0
  const hasSolo = Object.values(stemStates).some(s => s.solo)

  const currentSetlistItem = setlist.items[setlist.currentIndex] as SetlistItem | undefined

  // ─── Auto-advance to next song ──────────────────────────────────────────

  const prevPlaybackState = useRef(playbackState)
  useEffect(() => {
    if (
      autoAdvance &&
      prevPlaybackState.current === 'playing' &&
      (playbackState === 'stopped' || playbackState === 'paused') &&
      currentTime >= duration - 0.5 &&
      duration > 0 &&
      setlist.items.length > 0
    ) {
      const hasNext = setlist.goNext()
      if (hasNext) {
        // Will be loaded by the index change effect below
      }
    }
    prevPlaybackState.current = playbackState
  }, [playbackState])

  // ─── Load track when setlist index changes ──────────────────────────────

  const loadSetlistTrack = useCallback(async (index: number) => {
    const item = setlist.items[index]
    if (!item) return

    const fullTrack = allTracks.find(t => t.id === item.trackId)
    if (!fullTrack) return

    await loadTrack(fullTrack)
    // Auto-play after loading
    setTimeout(() => {
      const state = usePlayerStore.getState()
      if (state.playbackState === 'paused') state.play()
    }, 300)
  }, [allTracks, loadTrack])

  // Watch for setlist index changes to auto-load
  const prevIndex = useRef(setlist.currentIndex)
  useEffect(() => {
    if (prevIndex.current !== setlist.currentIndex && setlist.items.length > 0) {
      loadSetlistTrack(setlist.currentIndex)
    }
    prevIndex.current = setlist.currentIndex
  }, [setlist.currentIndex, loadSetlistTrack])

  // ─── Add song to setlist ────────────────────────────────────────────────

  const addToSetlist = (t: Track) => {
    setlist.add({
      trackId: t.id,
      title: t.title,
      artist: t.artist,
      coverUrl: t.coverUrl,
    })
  }

  const isInSetlist = (trackId: string) =>
    setlist.items.some(i => i.trackId === trackId)

  // Filtered songs for add panel
  const addResults = useMemo(() => {
    if (!addSearch.trim()) return allTracks.slice(0, 30)
    const q = addSearch.toLowerCase()
    return allTracks.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.artist.toLowerCase().includes(q)
    ).slice(0, 30)
  }, [allTracks, addSearch])

  // ─── Save current settings ──────────────────────────────────────────────

  const handleSave = () => {
    if (!track) return
    saveSettings(track.id, pitch, speed, stemStates)
    setJustSaved(true)
    setTimeout(() => setJustSaved(false), 2000)
  }

  // ─── Play specific setlist song ─────────────────────────────────────────

  const playFromSetlist = (index: number) => {
    setlist.setCurrent(index)
    loadSetlistTrack(index)
  }

  // ─── Navigate next/prev in setlist ──────────────────────────────────────

  const handlePrevSong = () => {
    if (currentTime > 3) {
      seek(0)
    } else {
      const went = setlist.goPrev()
      if (went) loadSetlistTrack(setlist.currentIndex - 1)
    }
  }

  const handleNextSong = () => {
    const went = setlist.goNext()
    if (went) loadSetlistTrack(setlist.currentIndex + 1)
  }

  // ─── Open notes for current song ────────────────────────────────────────

  const openNotes = () => {
    if (currentSetlistItem) {
      setEditingNotes(currentSetlistItem.notes)
    }
    setBottomPanel(p => p === 'notes' ? 'none' : 'notes')
  }

  const saveNotes = () => {
    if (currentSetlistItem) {
      setlist.setNotes(setlist.currentIndex, editingNotes)
    }
    setBottomPanel('none')
  }

  // ─── Exit handler ──────────────────────────────────────────────────────

  const handleExit = () => {
    togglePerformanceMode()
    navigate('/app/player')
  }

  // ─── Empty state (no track loaded and no setlist) ───────────────────────

  if (!track && setlist.items.length === 0) {
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
            onClick={() => setSidePanel('addSong')}
            className="h-12 rounded-full px-8 text-sm font-bold bg-[hsl(var(--primary))] text-black hover:scale-105 transition-transform flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Montar Setlist
          </button>
          <button
            onClick={handleExit}
            className="h-12 rounded-full px-6 text-sm font-semibold bg-white/10 text-white hover:bg-white/20 transition-colors"
          >
            Voltar
          </button>
        </div>

        {/* Show add panel even in empty state */}
        {sidePanel === 'addSong' && (
          <AddSongPanel
            search={addSearch}
            setSearch={setAddSearch}
            results={addResults}
            isInSetlist={isInSetlist}
            onAdd={addToSetlist}
            onClose={() => setSidePanel('none')}
          />
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex bg-black text-white select-none overflow-hidden">
      {/* ─── Setlist Sidebar ────────────────────────────────────────────── */}
      {sidePanel === 'setlist' && (
        <div className="w-[280px] md:w-[320px] shrink-0 flex flex-col bg-[#0a0a0a] border-r border-white/10 h-full">
          {/* Setlist header */}
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-white truncate">{setlist.name}</h2>
              <p className="text-[10px] text-[#808080]">{setlist.items.length} músicas</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setSidePanel('addSong')}
                className="h-8 w-8 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
              >
                <Plus className="h-4 w-4" />
              </button>
              <button
                onClick={() => setSidePanel('none')}
                className="h-8 w-8 flex items-center justify-center rounded-full text-[#808080] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Setlist items */}
          <div className="flex-1 overflow-y-auto">
            {setlist.items.map((item, i) => {
              const isCurrent = i === setlist.currentIndex
              const isTrackPlaying = isCurrent && track?.id === item.trackId && isPlaying

              return (
                <div
                  key={`${item.trackId}-${i}`}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors group',
                    isCurrent ? 'bg-white/10' : 'hover:bg-white/5'
                  )}
                  onClick={() => playFromSetlist(i)}
                >
                  {/* Number */}
                  <div className="w-6 text-center shrink-0">
                    {isTrackPlaying ? (
                      <div className="flex items-end justify-center gap-[2px] h-4">
                        <span className="eq-bar" style={{ animationDuration: '0.6s' }} />
                        <span className="eq-bar" style={{ animationDuration: '0.8s' }} />
                        <span className="eq-bar" style={{ animationDuration: '0.5s' }} />
                      </div>
                    ) : (
                      <span className={cn(
                        'text-xs tabular-nums',
                        isCurrent ? 'text-[hsl(var(--primary))]' : 'text-[#808080]'
                      )}>
                        {i + 1}
                      </span>
                    )}
                  </div>

                  {/* Cover */}
                  <img
                    src={item.coverUrl}
                    alt={item.title}
                    className="h-9 w-9 rounded object-cover shrink-0"
                  />

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <p className={cn(
                      'text-xs font-medium truncate',
                      isCurrent ? 'text-[hsl(var(--primary))]' : 'text-white'
                    )}>
                      {item.title}
                    </p>
                    <p className="text-[10px] text-[#808080] truncate">{item.artist}</p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); setlist.moveUp(i) }}
                      className="p-1 text-[#808080] hover:text-white"
                      disabled={i === 0}
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setlist.moveDown(i) }}
                      className="p-1 text-[#808080] hover:text-white"
                      disabled={i === setlist.items.length - 1}
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setlist.remove(i) }}
                      className="p-1 text-[#808080] hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Notes indicator */}
                  {item.notes && (
                    <div className="shrink-0">
                      <StickyNote className="h-3 w-3 text-yellow-500/60" />
                    </div>
                  )}
                </div>
              )
            })}

            {setlist.items.length === 0 && (
              <div className="flex flex-col items-center py-10 gap-3">
                <p className="text-sm text-[#808080]">Setlist vazio</p>
                <button
                  onClick={() => setSidePanel('addSong')}
                  className="text-xs font-semibold text-[hsl(var(--primary))] hover:underline"
                >
                  + Adicionar músicas
                </button>
              </div>
            )}
          </div>

          {/* Auto-advance toggle */}
          <div className="border-t border-white/10 p-3 flex items-center justify-between">
            <span className="text-[11px] text-[#808080]">Auto-avançar</span>
            <button
              onClick={() => setAutoAdvance(!autoAdvance)}
              className={cn(
                'h-6 w-11 rounded-full transition-colors relative',
                autoAdvance ? 'bg-[hsl(var(--primary))]' : 'bg-white/20'
              )}
            >
              <div className={cn(
                'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                autoAdvance ? 'translate-x-[22px]' : 'translate-x-0.5'
              )} />
            </button>
          </div>
        </div>
      )}

      {/* ─── Add Song Panel ────────────────────────────────────────────── */}
      {sidePanel === 'addSong' && (
        <AddSongPanel
          search={addSearch}
          setSearch={setAddSearch}
          results={addResults}
          isInSetlist={isInSetlist}
          onAdd={addToSetlist}
          onClose={() => setSidePanel(setlist.items.length > 0 ? 'setlist' : 'none')}
        />
      )}

      {/* ─── Main Stage Area ───────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 md:px-6 pt-3 md:pt-4 pb-2 shrink-0">
          {/* Left: setlist toggle + song info */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setSidePanel(p => p === 'setlist' ? 'none' : 'setlist')}
              className={cn(
                'flex items-center justify-center h-10 w-10 rounded-full shrink-0 transition-colors',
                sidePanel === 'setlist'
                  ? 'bg-[hsl(var(--primary))] text-black'
                  : 'bg-white/10 text-white hover:bg-white/20'
              )}
            >
              <ListMusic className="h-5 w-5" />
            </button>

            <div className="min-w-0">
              {setlist.items.length > 0 && (
                <p className="text-[10px] text-[#808080] font-medium">
                  {setlist.currentIndex + 1}/{setlist.items.length} · {setlist.name}
                </p>
              )}
              <h1 className="text-lg md:text-xl font-black truncate leading-tight">
                {track?.title || 'Nenhuma faixa'}
              </h1>
              <p className="text-xs md:text-sm text-[#808080] truncate">
                {track?.artist || ''}
              </p>
            </div>
          </div>

          {/* Right: clock, badges, exit */}
          <div className="flex items-center gap-2 shrink-0 ml-3">
            {/* Show clock */}
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-lg font-bold tabular-nums text-white">{clock}</span>
              <span className="text-[10px] text-[#808080] tabular-nums flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />
                {elapsed}
              </span>
            </div>

            {pitch !== 0 && (
              <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-[hsl(var(--primary))]/20 text-[hsl(var(--primary))]">
                {semitonesToLabel(pitch)}
              </span>
            )}
            {speed !== 1 && (
              <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-white/10 text-white/70">
                {speedToLabel(speed)}
              </span>
            )}

            <button
              onClick={handleExit}
              className="h-9 w-9 flex items-center justify-center rounded-full bg-white/10 text-[#808080] hover:text-white hover:bg-white/20"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="px-4 md:px-6 shrink-0">
          <div
            className="h-2.5 rounded-full bg-white/10 cursor-pointer relative group"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              seek(((e.clientX - rect.left) / rect.width) * duration)
            }}
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-[hsl(var(--primary))] transition-all duration-100"
              style={{ width: `${progress}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-5 w-5 rounded-full bg-white opacity-0 group-hover:opacity-100 shadow-lg"
              style={{ left: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-1 text-xs text-white/40 tabular-nums">
            <span>{formatTime(currentTime)}</span>
            <span>-{formatTime(Math.max(0, duration - currentTime))}</span>
          </div>
        </div>

        {/* ─── Main Controls ───────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col items-center justify-center gap-4 md:gap-5 px-4 min-h-0">
          {/* Song navigation (prev/next in setlist) */}
          {setlist.items.length > 1 && (
            <div className="flex items-center gap-4 text-[#808080]">
              <button
                onClick={handlePrevSong}
                disabled={setlist.currentIndex === 0 && currentTime < 3}
                className="flex items-center gap-1 text-xs font-medium hover:text-white disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </button>
              <span className="text-xs tabular-nums">
                {setlist.currentIndex + 1} / {setlist.items.length}
              </span>
              <button
                onClick={handleNextSong}
                disabled={setlist.currentIndex >= setlist.items.length - 1}
                className="flex items-center gap-1 text-xs font-medium hover:text-white disabled:opacity-30 transition-colors"
              >
                Próxima
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Notes display */}
          {currentSetlistItem?.notes && bottomPanel !== 'notes' && (
            <div className="max-w-md w-full px-4 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-center">
              <p className="text-xs text-yellow-200/80 line-clamp-2">{currentSetlistItem.notes}</p>
            </div>
          )}

          {/* Transport controls */}
          <div className="flex items-center gap-3 md:gap-4">
            <button
              onClick={() => seek(0)}
              className="flex h-12 w-12 md:h-14 md:w-14 items-center justify-center rounded-full bg-white/5 text-white hover:bg-white/10 active:bg-white/20 transition-colors"
            >
              <RotateCcw className="h-5 w-5 md:h-6 md:w-6" />
            </button>

            <button
              onClick={() => skipBackward(5)}
              className="flex h-12 w-12 md:h-14 md:w-14 items-center justify-center rounded-full bg-white/5 text-white hover:bg-white/10 active:bg-white/20 transition-colors"
            >
              <SkipBack className="h-5 w-5 md:h-6 md:w-6" />
            </button>

            <button
              onClick={() => isPlaying ? pause() : play()}
              className={cn(
                'flex h-20 w-20 md:h-24 md:w-24 items-center justify-center rounded-full shadow-xl transition-all active:scale-95',
                isPlaying
                  ? 'bg-[hsl(var(--primary))] shadow-[hsl(var(--primary))]/40'
                  : 'bg-white text-black shadow-white/20'
              )}
            >
              {isPlaying
                ? <Pause className="h-8 w-8 md:h-10 md:w-10 fill-white text-white" />
                : <Play className="h-8 w-8 md:h-10 md:w-10 fill-black text-black ml-1" />
              }
            </button>

            <button
              onClick={() => skipForward(5)}
              className="flex h-12 w-12 md:h-14 md:w-14 items-center justify-center rounded-full bg-white/5 text-white hover:bg-white/10 active:bg-white/20 transition-colors"
            >
              <SkipForward className="h-5 w-5 md:h-6 md:w-6" />
            </button>

            <button
              onClick={stop}
              className="flex h-12 w-12 md:h-14 md:w-14 items-center justify-center rounded-full bg-white/5 text-white hover:bg-white/10 active:bg-white/20 transition-colors"
            >
              <Square className="h-4 w-4 md:h-5 md:w-5" />
            </button>
          </div>

          {/* Quick action bar */}
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <button
              onClick={() => setBottomPanel(p => p === 'pitch' ? 'none' : 'pitch')}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition-colors',
                bottomPanel === 'pitch' ? 'bg-[hsl(var(--primary))] text-black' : 'bg-white/10 text-white hover:bg-white/15'
              )}
            >
              🎵 Tom
            </button>
            <button
              onClick={() => setBottomPanel(p => p === 'speed' ? 'none' : 'speed')}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition-colors',
                bottomPanel === 'speed' ? 'bg-[hsl(var(--primary))] text-black' : 'bg-white/10 text-white hover:bg-white/15'
              )}
            >
              ⏱️ Velocidade
            </button>
            {track?.hasStems && (
              <button
                onClick={() => setBottomPanel(p => p === 'stems' ? 'none' : 'stems')}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition-colors',
                  bottomPanel === 'stems' ? 'bg-[hsl(var(--primary))] text-black' : 'bg-white/10 text-white hover:bg-white/15'
                )}
              >
                <Layers className="h-3.5 w-3.5" />
                Stems {hasSolo && '(Solo)'}
              </button>
            )}
            {currentSetlistItem && (
              <button
                onClick={openNotes}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition-colors',
                  bottomPanel === 'notes' ? 'bg-yellow-500 text-black' : 'bg-white/10 text-white hover:bg-white/15'
                )}
              >
                <StickyNote className="h-3.5 w-3.5" />
                Notas
              </button>
            )}
            <button
              onClick={handleSave}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition-colors',
                justSaved
                  ? 'bg-green-500 text-black'
                  : 'bg-white/10 text-white hover:bg-white/15'
              )}
            >
              {justSaved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
              {justSaved ? 'Salvo!' : 'Salvar'}
            </button>
          </div>

          {/* Mobile clock */}
          <div className="sm:hidden flex items-center gap-3 text-[#808080] text-xs tabular-nums">
            <span className="font-bold text-white">{clock}</span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {elapsed}
            </span>
          </div>
        </div>

        {/* ─── Bottom Panels ──────────────────────────────────────────── */}
        <div className="shrink-0 max-h-[40vh] overflow-y-auto">
          {bottomPanel === 'pitch' && (
            <div className="mx-4 mb-3 rounded-2xl bg-white/5 border border-white/10 p-4">
              <PitchControl compact />
            </div>
          )}

          {bottomPanel === 'speed' && (
            <div className="mx-4 mb-3 rounded-2xl bg-white/5 border border-white/10 p-4">
              <SpeedControl compact />
            </div>
          )}

          {bottomPanel === 'stems' && track?.hasStems && (
            <div className="mx-4 mb-3 rounded-2xl bg-white/5 border border-white/10 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-white/50">
                  Stems — {track.stems.length} pistas
                </p>
                <button onClick={resetMix} className="text-xs text-white/50 hover:text-white">
                  Reset
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {track.stems.map(stem => {
                  const state = stemStates[stem.id]
                  if (!state) return null
                  const isSolo = state.solo
                  const isMuted = state.muted
                  const icon = stemIcon(stem.id, stem.label)

                  return (
                    <button
                      key={stem.id}
                      onClick={() => setStemMuted(stem.id, !isMuted)}
                      onDoubleClick={() => setStemSolo(stem.id, !isSolo)}
                      className={cn(
                        'flex flex-col items-center gap-1.5 rounded-xl p-3 text-xs font-medium transition-all',
                        isSolo
                          ? 'bg-[hsl(var(--primary))]/30 text-white border-2 border-[hsl(var(--primary))]'
                          : isMuted
                          ? 'bg-white/5 text-white/30'
                          : 'bg-white/10 text-white border border-white/10 hover:bg-white/15'
                      )}
                    >
                      <span className="text-2xl">{icon}</span>
                      <span className={cn('truncate max-w-full', isMuted && 'line-through')}>
                        {stem.label}
                      </span>
                      {isSolo && (
                        <span className="text-[9px] text-[hsl(var(--primary))] uppercase font-bold">Solo</span>
                      )}
                    </button>
                  )
                })}
              </div>
              <p className="text-[10px] text-white/30 text-center">
                Toque para mutar · duplo toque para solo
              </p>
            </div>
          )}

          {bottomPanel === 'notes' && (
            <div className="mx-4 mb-3 rounded-2xl bg-white/5 border border-yellow-500/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-yellow-500/70">
                  Notas da música
                </p>
                <button
                  onClick={saveNotes}
                  className="text-xs font-semibold text-yellow-400 hover:text-yellow-300 flex items-center gap-1"
                >
                  <Check className="h-3 w-3" />
                  Salvar
                </button>
              </div>
              <textarea
                value={editingNotes}
                onChange={(e) => setEditingNotes(e.target.value)}
                placeholder="Ex: Começar no refrão, subir tom no final, intro 8 compassos..."
                className="w-full h-24 rounded-lg bg-black/40 text-sm text-white placeholder:text-[#535353] p-3 border border-white/10 outline-none focus:border-yellow-500/30 resize-none"
              />
            </div>
          )}
        </div>

        {/* Safe area */}
        <div className="shrink-0" style={{ height: 'calc(8px + env(safe-area-inset-bottom, 0px))' }} />
      </div>
    </div>
  )
}

// ─── Add Song Panel (reusable) ───────────────────────────────────────────────

function AddSongPanel({
  search, setSearch, results, isInSetlist, onAdd, onClose,
}: {
  search: string
  setSearch: (s: string) => void
  results: Track[]
  isInSetlist: (id: string) => boolean
  onAdd: (t: Track) => void
  onClose: () => void
}) {
  return (
    <div className="w-[280px] md:w-[320px] shrink-0 flex flex-col bg-[#0a0a0a] border-r border-white/10 h-full">
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <h2 className="text-sm font-bold text-white">Adicionar Músicas</h2>
        <button
          onClick={onClose}
          className="h-8 w-8 flex items-center justify-center rounded-full text-[#808080] hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Search */}
      <div className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#808080]" />
          <input
            type="text"
            placeholder="Buscar música..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 rounded-lg bg-white/5 pl-9 pr-3 text-xs text-white placeholder:text-[#808080] border-0 outline-none focus:ring-1 focus:ring-white/20"
            autoFocus
          />
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {results.map(t => {
          const added = isInSetlist(t.id)
          return (
            <div
              key={t.id}
              className="flex items-center gap-3 px-3 py-2 hover:bg-white/5 cursor-pointer transition-colors"
              onClick={() => !added && onAdd(t)}
            >
              <img
                src={t.coverUrl}
                alt={t.title}
                className="h-9 w-9 rounded object-cover shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-white truncate">{t.title}</p>
                <p className="text-[10px] text-[#808080] truncate">{t.artist}</p>
              </div>
              {added ? (
                <Check className="h-4 w-4 text-[hsl(var(--primary))] shrink-0" />
              ) : (
                <Plus className="h-4 w-4 text-[#808080] shrink-0" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

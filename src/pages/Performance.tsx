/**
 * Modo Palco — simples, limpo, funcional.
 * Uma tela só. Sem troca de views. Sem complicações.
 */

import { useNavigate } from 'react-router-dom'
import {
  Play, Pause, SkipBack, SkipForward,
  X, Plus, Search, Trash2, Volume2, VolumeX,
  ChevronLeft, ChevronRight, Clock,
} from 'lucide-react'
import { usePlayerStore } from '@/store/playerStore'
import { useCatalogStore } from '@/store/catalogStore'
import { useLocalTracksStore } from '@/store/localTracksStore'
import { useTrackSettingsStore } from '@/store/trackSettingsStore'
import { Slider } from '@/components/ui/slider'
import { formatTime } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { useState, useEffect, useRef, useMemo } from 'react'
import type { Track } from '@/types/track'

// ─── Simple setlist state (component-local + localStorage) ───────────────────

interface SetlistSong {
  id: string
  title: string
  artist: string
  coverUrl: string
}

function useSimpleSetlist() {
  const [songs, setSongs] = useState<SetlistSong[]>(() => {
    try {
      const saved = localStorage.getItem('palco-show')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [currentIdx, setCurrentIdx] = useState(0)

  useEffect(() => {
    localStorage.setItem('palco-show', JSON.stringify(songs))
  }, [songs])

  return {
    songs,
    currentIdx,
    add: (t: Track) => setSongs(s => [...s, { id: t.id, title: t.title, artist: t.artist, coverUrl: t.coverUrl }]),
    remove: (i: number) => {
      setSongs(s => s.filter((_, idx) => idx !== i))
      setCurrentIdx(c => i < c ? c - 1 : c >= songs.length - 1 ? Math.max(0, songs.length - 2) : c)
    },
    setCurrent: setCurrentIdx,
    clear: () => { setSongs([]); setCurrentIdx(0) },
    has: (id: string) => songs.some(s => s.id === id),
  }
}

// ─── Stem icon ───────────────────────────────────────────────────────────────

function stemIcon(id: string, label: string): string {
  const s = (id + ' ' + label).toLowerCase()
  if (/drum|bater|percus|click/.test(s)) return '🥁'
  if (/bass|baixo/.test(s)) return '🎸'
  if (/guitar|gtr|guitarra/.test(s)) return '🎸'
  if (/acoust|acust|violao|violo/.test(s)) return '🪕'
  if (/sanfon|acordeon/.test(s)) return '🪗'
  if (/key|piano|teclad|rhodes|organ/.test(s)) return '🎹'
  if (/voice|vocal|voz|canto|guia/.test(s)) return '🎤'
  if (/choir|coro|back/.test(s)) return '🎙️'
  if (/brass|metal|horn|tromp/.test(s)) return '🎺'
  if (/string|cord|violin|cello/.test(s)) return '🎻'
  if (/synth|pad|fx/.test(s)) return '🎛️'
  return '🎵'
}

// ─── Wake Lock ───────────────────────────────────────────────────────────────

function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null
    const acquire = async () => { try { lock = await navigator.wakeLock.request('screen') } catch {} }
    acquire()
    const onVis = () => { if (document.visibilityState === 'visible') acquire() }
    document.addEventListener('visibilitychange', onVis)
    return () => { document.removeEventListener('visibilitychange', onVis); lock?.release() }
  }, [])
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function Performance() {
  const navigate = useNavigate()
  useWakeLock()

  // Player
  const track = usePlayerStore(s => s.track)
  const playbackState = usePlayerStore(s => s.playbackState)
  const currentTime = usePlayerStore(s => s.currentTime)
  const duration = usePlayerStore(s => s.duration)
  const stemStates = usePlayerStore(s => s.stemStates)
  const play = usePlayerStore(s => s.play)
  const pause = usePlayerStore(s => s.pause)
  const seek = usePlayerStore(s => s.seek)
  const skipBackward = usePlayerStore(s => s.skipBackward)
  const skipForward = usePlayerStore(s => s.skipForward)
  const loadTrack = usePlayerStore(s => s.loadTrack)
  const setStemMuted = usePlayerStore(s => s.setStemMuted)
  const setStemSolo = usePlayerStore(s => s.setStemSolo)
  const setStemVolume = usePlayerStore(s => s.setStemVolume)
  const resetMix = usePlayerStore(s => s.resetMix)

  // Catalog
  const catalogTracks = useCatalogStore(s => s.tracks)
  const catalogLoading = useCatalogStore(s => s.isLoading)
  const loadCatalog = useCatalogStore(s => s.loadCatalog)
  const localTracks = useLocalTracksStore(s => s.tracks)
  const allTracks = useMemo(() => [...localTracks, ...catalogTracks], [localTracks, catalogTracks])

  // Setlist
  const setlist = useSimpleSetlist()

  // UI
  const [showAdd, setShowAdd] = useState(false)
  const [search, setSearch] = useState('')
  const [showStems, setShowStems] = useState(false)
  const [clock, setClock] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  // Load catalog
  useEffect(() => {
    if (catalogTracks.length === 0 && !catalogLoading) loadCatalog()
  }, [])

  // Clock
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))
    tick()
    const id = setInterval(tick, 10000)
    return () => clearInterval(id)
  }, [])

  const isPlaying = playbackState === 'playing'
  const isLoading = playbackState === 'loading'
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0
  const hasSolo = Object.values(stemStates).some(s => s.solo)

  // ─── Play a song ───────────────────────────────────────────────────────

  const playSong = async (t: Track, idx?: number) => {
    if (idx !== undefined) setlist.setCurrent(idx)
    await loadTrack(t)
    // Small delay to let audio engine finish setup
    setTimeout(() => usePlayerStore.getState().play(), 200)
  }

  const playFromSetlist = (idx: number) => {
    const song = setlist.songs[idx]
    if (!song) return
    const fullTrack = allTracks.find(t => t.id === song.id)
    if (fullTrack) playSong(fullTrack, idx)
  }

  // Auto-advance
  const prevState = useRef(playbackState)
  useEffect(() => {
    if (prevState.current === 'playing' && playbackState === 'stopped' && duration > 0) {
      // Song ended, play next
      const next = setlist.currentIdx + 1
      if (next < setlist.songs.length) {
        playFromSetlist(next)
      }
    }
    prevState.current = playbackState
  }, [playbackState])

  // Search results
  const results = useMemo(() => {
    if (!search.trim()) return allTracks.slice(0, 40)
    const q = search.toLowerCase()
    return allTracks.filter(t => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)).slice(0, 40)
  }, [allTracks, search])

  // Progress bar touch
  const progressRef = useRef<HTMLDivElement>(null)
  const seekFromEvent = (clientX: number) => {
    const rect = progressRef.current?.getBoundingClientRect()
    if (!rect || !duration) return
    seek(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * duration)
  }

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 bg-black text-white flex flex-col overflow-hidden"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>

      {/* ═══ TOP BAR ═══ */}
      <div className="flex items-center justify-between px-4 py-2 shrink-0">
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-bold truncate">{track?.title || 'Modo Palco'}</h1>
          <p className="text-[11px] text-[#808080] truncate">{track?.artist || 'Selecione uma música'}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          <span className="text-sm font-bold tabular-nums">{clock}</span>
          <button onClick={() => navigate('/app/library')}
            className="h-8 w-8 flex items-center justify-center rounded-full bg-white/10 active:bg-white/20">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ═══ PROGRESS ═══ */}
      <div className="px-4 shrink-0">
        <div ref={progressRef} className="h-3 rounded-full bg-white/10 relative"
          onClick={(e) => seekFromEvent(e.clientX)}
          onTouchStart={(e) => seekFromEvent(e.touches[0].clientX)}
          onTouchMove={(e) => seekFromEvent(e.touches[0].clientX)}>
          <div className="absolute inset-y-0 left-0 rounded-full bg-[hsl(var(--primary))]"
            style={{ width: `${progress}%` }} />
          <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-4 w-4 rounded-full bg-white shadow"
            style={{ left: `${progress}%` }} />
        </div>
        <div className="flex justify-between mt-0.5 text-[10px] text-white/40 tabular-nums">
          <span>{formatTime(currentTime)}</span>
          <span>-{formatTime(Math.max(0, duration - currentTime))}</span>
        </div>
      </div>

      {/* ═══ TRANSPORT ═══ */}
      <div className="flex items-center justify-center gap-3 py-3 shrink-0">
        {/* Prev song */}
        {setlist.songs.length > 1 && (
          <button onClick={() => setlist.currentIdx > 0 && playFromSetlist(setlist.currentIdx - 1)}
            disabled={setlist.currentIdx === 0}
            className="h-10 w-10 flex items-center justify-center rounded-full bg-white/5 active:bg-white/15 disabled:opacity-20">
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}

        <button onClick={() => skipBackward(5)}
          className="h-11 w-11 flex items-center justify-center rounded-full bg-white/5 active:bg-white/15">
          <SkipBack className="h-5 w-5" />
        </button>

        <button onClick={() => isPlaying ? pause() : play()}
          disabled={!track || isLoading}
          className={cn(
            'h-16 w-16 flex items-center justify-center rounded-full shadow-lg active:scale-95 transition-transform',
            isPlaying ? 'bg-[hsl(var(--primary))]' : 'bg-white',
            (!track || isLoading) && 'opacity-40'
          )}>
          {isLoading ? (
            <div className="h-5 w-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
          ) : isPlaying ? (
            <Pause className="h-7 w-7 fill-white text-white" />
          ) : (
            <Play className="h-7 w-7 fill-black text-black ml-0.5" />
          )}
        </button>

        <button onClick={() => skipForward(5)}
          className="h-11 w-11 flex items-center justify-center rounded-full bg-white/5 active:bg-white/15">
          <SkipForward className="h-5 w-5" />
        </button>

        {/* Next song */}
        {setlist.songs.length > 1 && (
          <button onClick={() => setlist.currentIdx < setlist.songs.length - 1 && playFromSetlist(setlist.currentIdx + 1)}
            disabled={setlist.currentIdx >= setlist.songs.length - 1}
            className="h-10 w-10 flex items-center justify-center rounded-full bg-white/5 active:bg-white/15 disabled:opacity-20">
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* ═══ STEMS (collapsible) ═══ */}
      {track?.hasStems && track.stems.length > 1 && (
        <div className="px-4 shrink-0 mb-2">
          <button onClick={() => setShowStems(!showStems)}
            className="w-full flex items-center justify-between py-2 text-xs font-semibold text-[#808080]">
            <span>MIXER — {track.stems.length} pistas {hasSolo && '(Solo ativo)'}</span>
            <span>{showStems ? '▲' : '▼'}</span>
          </button>

          {showStems && (
            <div className="space-y-1 pb-2">
              {track.stems.map(stem => {
                const st = stemStates[stem.id]
                if (!st) return null
                const active = hasSolo ? st.solo : !st.muted

                return (
                  <div key={stem.id} className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-2 transition-opacity',
                    active ? 'bg-white/5' : 'bg-white/[0.02] opacity-40'
                  )}>
                    <span className="text-lg shrink-0">{stemIcon(stem.id, stem.label)}</span>
                    <span className="text-xs font-medium flex-1 min-w-0 truncate">{stem.label}</span>

                    {/* Volume */}
                    <div className="w-20 shrink-0">
                      <Slider min={0} max={1} step={0.01} value={[st.volume]}
                        onValueChange={([v]) => setStemVolume(stem.id, v)} disabled={st.muted} />
                    </div>

                    {/* Mute */}
                    <button onClick={() => setStemMuted(stem.id, !st.muted)}
                      className={cn(
                        'h-8 w-8 flex items-center justify-center rounded text-[10px] font-bold shrink-0',
                        st.muted ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white'
                      )}>
                      {st.muted ? <VolumeX className="h-3.5 w-3.5" /> : 'M'}
                    </button>

                    {/* Solo */}
                    <button onClick={() => setStemSolo(stem.id, !st.solo)}
                      className={cn(
                        'h-8 w-8 flex items-center justify-center rounded text-[10px] font-bold shrink-0',
                        st.solo ? 'bg-[hsl(var(--primary))]/30 text-[hsl(var(--primary))]' : 'bg-white/10 text-white'
                      )}>
                      S
                    </button>
                  </div>
                )
              })}
              <button onClick={resetMix} className="text-[10px] text-[#808080] active:text-white py-1 px-2">
                Resetar mix
              </button>
            </div>
          )}
        </div>
      )}

      {/* ═══ SETLIST ═══ */}
      <div className="flex-1 flex flex-col min-h-0 border-t border-white/10">
        {/* Setlist header */}
        <div className="flex items-center justify-between px-4 py-2 shrink-0">
          <span className="text-xs font-semibold text-[#808080]">
            SETLIST {setlist.songs.length > 0 && `(${setlist.songs.length})`}
          </span>
          <div className="flex items-center gap-2">
            {setlist.songs.length > 0 && (
              <button onClick={() => setlist.clear()}
                className="text-[10px] text-[#808080] active:text-red-400 px-2 py-1">
                Limpar
              </button>
            )}
            <button onClick={() => { setShowAdd(true); setSearch(''); setTimeout(() => searchRef.current?.focus(), 100) }}
              className="flex items-center gap-1 text-xs font-semibold text-[hsl(var(--primary))] active:opacity-70 px-2 py-1">
              <Plus className="h-3.5 w-3.5" /> Adicionar
            </button>
          </div>
        </div>

        {/* Song list */}
        <div className="flex-1 overflow-y-auto px-2" style={{ paddingBottom: 'calc(8px + env(safe-area-inset-bottom, 0px))' }}>
          {setlist.songs.length === 0 && (
            <div className="flex flex-col items-center py-10 gap-3">
              <p className="text-sm text-[#808080]">Nenhuma música no setlist</p>
              <button onClick={() => { setShowAdd(true); setSearch('') }}
                className="text-sm font-semibold text-[hsl(var(--primary))] active:opacity-70 py-2 px-4">
                + Adicionar músicas
              </button>
            </div>
          )}

          {setlist.songs.map((song, i) => {
            const isCurrent = track?.id === song.id
            const isSongPlaying = isCurrent && isPlaying

            return (
              <div key={`${song.id}-${i}`}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 mb-0.5 active:bg-white/10 transition-colors',
                  isCurrent ? 'bg-white/10' : ''
                )}
                onClick={() => playFromSetlist(i)}>

                {/* Number / EQ */}
                <div className="w-5 text-center shrink-0">
                  {isSongPlaying ? (
                    <div className="flex items-end justify-center gap-[2px] h-4">
                      <span className="eq-bar" style={{ animationDuration: '0.6s' }} />
                      <span className="eq-bar" style={{ animationDuration: '0.8s' }} />
                      <span className="eq-bar" style={{ animationDuration: '0.5s' }} />
                    </div>
                  ) : (
                    <span className={cn('text-xs tabular-nums font-bold', isCurrent ? 'text-[hsl(var(--primary))]' : 'text-[#808080]')}>
                      {i + 1}
                    </span>
                  )}
                </div>

                {/* Cover */}
                <img src={song.coverUrl} alt="" className="h-10 w-10 rounded object-cover shrink-0" />

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <p className={cn('text-sm font-medium truncate', isCurrent ? 'text-[hsl(var(--primary))]' : 'text-white')}>
                    {song.title}
                  </p>
                  <p className="text-[10px] text-[#808080] truncate">{song.artist}</p>
                </div>

                {/* Remove */}
                <button onClick={(e) => { e.stopPropagation(); setlist.remove(i) }}
                  className="h-8 w-8 flex items-center justify-center rounded-full text-[#808080] active:text-red-400 shrink-0">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* ═══ ADD SONGS MODAL ═══ */}
      {showAdd && (
        <div className="fixed inset-0 z-[60] bg-black/95 flex flex-col"
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#808080]" />
              <input ref={searchRef} type="text" placeholder="Buscar música..."
                value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full h-10 rounded-lg bg-white/5 pl-10 pr-3 text-sm text-white placeholder:text-[#808080] outline-none focus:ring-1 focus:ring-white/20" />
            </div>
            <button onClick={() => setShowAdd(false)}
              className="h-10 px-4 rounded-lg bg-white/10 text-sm font-semibold active:bg-white/20">
              Fechar
            </button>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
            {catalogLoading && (
              <div className="flex items-center justify-center py-10">
                <div className="h-6 w-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              </div>
            )}

            {results.map(t => {
              const added = setlist.has(t.id)
              return (
                <div key={t.id}
                  className="flex items-center gap-3 px-4 py-3 active:bg-white/10 transition-colors"
                  onClick={() => { if (!added) { setlist.add(t); } }}>
                  <img src={t.coverUrl} alt="" className="h-11 w-11 rounded object-cover shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white truncate">{t.title}</p>
                    <p className="text-xs text-[#808080] truncate">{t.artist}</p>
                  </div>
                  {added ? (
                    <span className="text-xs font-semibold text-[hsl(var(--primary))] shrink-0 px-2">Adicionada</span>
                  ) : (
                    <div className="h-8 w-8 flex items-center justify-center rounded-full bg-white/10 shrink-0">
                      <Plus className="h-4 w-4" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

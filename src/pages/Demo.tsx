import { useEffect, useMemo, useRef, useState } from 'react'
import { Layers, Music2, Gauge, ChevronDown, ChevronUp, Loader2, Lock, Play, Crown, ArrowRight, Sparkles, CheckCircle2, X } from 'lucide-react'
import { useCatalogStore } from '@/store/catalogStore'
import { usePlayerStore } from '@/store/playerStore'
import { PlayerControls } from '@/components/player/PlayerControls'
import { ProgressBar } from '@/components/player/ProgressBar'
import { PitchControl } from '@/components/player/PitchControl'
import { SpeedControl } from '@/components/player/SpeedControl'
import { StemMixer } from '@/components/player/StemMixer'
import { cn } from '@/lib/utils'
import { semitonesToLabel, speedToLabel } from '@/lib/utils'
import type { Track } from '@/types/track'

const TRACKS_PER_GENRE = 5
const CTA_URL = 'https://payfast.greenn.com.br/152815/offer/gxUz6f'
/** Max stems to load in demo mode — prevents mobile OOM with 20+ stem tracks */
const MAX_DEMO_STEMS = 8

/** Priority order for stem selection when capping */
const STEM_PRIORITY = [
  'main', 'drums', 'bass', 'voice', 'guitar', 'acoustic', 'keys',
  'percussion', 'brass', 'strings', 'synth', 'choir', 'click',
]

/** Limit track stems for demo to avoid mobile memory crashes */
function capStemsForDemo(track: Track): Track {
  if (track.stems.length <= MAX_DEMO_STEMS) return track
  const stemsCopy = [...track.stems]
  stemsCopy.sort((a, b) => {
    const aIdx = STEM_PRIORITY.findIndex(p => a.id.toLowerCase().includes(p) || a.label.toLowerCase().includes(p))
    const bIdx = STEM_PRIORITY.findIndex(p => b.id.toLowerCase().includes(p) || b.label.toLowerCase().includes(p))
    return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx)
  })
  return { ...track, stems: stemsCopy.slice(0, MAX_DEMO_STEMS) }
}

export default function Demo() {
  // Individual selectors — prevents re-render on every currentTime update (60fps)
  const tracks = useCatalogStore(s => s.tracks)
  const genres = useCatalogStore(s => s.genres)
  const isLoading = useCatalogStore(s => s.isLoading)
  const loadCatalog = useCatalogStore(s => s.loadCatalog)

  const currentTrack = usePlayerStore(s => s.track)
  const playbackState = usePlayerStore(s => s.playbackState)
  const pitch = usePlayerStore(s => s.pitch)
  const speed = usePlayerStore(s => s.speed)
  const loadTrack = usePlayerStore(s => s.loadTrack)
  const error = usePlayerStore(s => s.error)
  const [showTuning, setShowTuning] = useState(true)
  const [showCta, setShowCta] = useState(false)
  const [dismissedCta, setDismissedCta] = useState(false)

  useEffect(() => {
    loadCatalog('/demo-catalog.json')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Show floating CTA after 15s
  useEffect(() => {
    const timer = setTimeout(() => setShowCta(true), 15000)
    return () => clearTimeout(timer)
  }, [])

  // Build genre sections with 5 tracks each, splitting rock-pop-mpb into sub-genres
  const genreSections = useMemo(() => {
    if (!tracks.length || !genres.length) return []

    const sections: { id: string; label: string; tracks: Track[]; totalCount: number }[] = []

    // Priority artists that MUST appear if available in the genre
    const PRIORITY_ARTISTS = [
      // Sertanejo
      'gusttavo lima', 'bruno e marrone', 'henrique e juliano',
      'marilia mendonca', 'jorge e mateus', 'ze felipe',
      'ze neto e cristiano', 'ana castela', 'luan santana',
      // Piseiro
      'baroes da pisadinha', 'joao gomes', 'nattan',
      'vitor fernandes', 'tarcisio do acordeon',
      // Forró
      'wesley safadao', 'xand aviao', 'jonas esticado',
      'cavaleiros do forro', 'calcinha preta',
      // Arrocha
      'nadson', 'pablo', 'devinho novaes', 'soro silva',
      // Axé
      'ivete sangalo', 'leo santana', 'harmonia do samba',
      'parangole', 'bell marques',
      // Pagode
      'ferrugem', 'thiaguinho', 'sorriso maroto',
      'turma do pagode', 'pericles', 'raca negra',
      // Gospel
      'aline barros', 'fernandinho', 'anderson freire',
      'gabriela rocha',
      // Rock / MPB
      'legiao urbana', 'tim maia', 'roberto carlos',
      'skank', 'barao vermelho', 'raul seixas', 'djavan',
      // Rock / Pop Internacional
      'michael jackson', 'guns n roses', 'coldplay',
      'bon jovi', 'nirvana', 'metallica', 'pink floyd',
      'bruno mars', 'ed sheeran', 'dire straits',
      // Brega
      'reginaldo rossi', 'amado batista', 'wando',
      'sidney magal', 'jose augusto',
    ]

    // Genre labels used as fallback artist — these are NOT real artists
    const GENRE_LABELS = new Set(genres.map(g => g.label.toLowerCase()))

    // Helper: pick best tracks, unique titles, prefer known artists
    function pickBest(pool: Track[]): Track[] {
      const eligible = [...pool].filter(t => t.stems.length >= 2)
      const best: Track[] = []
      const seenArtists = new Set<string>()
      const seenTitles = new Set<string>()

      function isRealArtist(artist: string): boolean {
        return artist !== '' && !GENRE_LABELS.has(artist.toLowerCase().trim())
      }

      function tryAdd(t: Track): boolean {
        const titleKey = t.title.toLowerCase().trim()
        if (seenTitles.has(titleKey)) return false
        const artistKey = t.artist.toLowerCase().trim()
        // Only enforce artist uniqueness for real (recognized) artists
        if (isRealArtist(t.artist) && seenArtists.has(artistKey)) return false
        seenTitles.add(titleKey)
        if (isRealArtist(t.artist)) seenArtists.add(artistKey)
        best.push(t)
        return true
      }

      // 1. Priority artists first
      for (const priority of PRIORITY_ARTISTS) {
        if (best.length >= TRACKS_PER_GENRE) break
        const match = eligible
          .sort((a, b) => b.stems.length - a.stems.length)
          .find(t => t.artist.toLowerCase().trim().includes(priority))
        if (match) tryAdd(match)
      }

      // 2. Fill remaining — prefer tracks with real artists, then by stem count
      const sorted = [...eligible].sort((a, b) => {
        const aReal = isRealArtist(a.artist) ? 1 : 0
        const bReal = isRealArtist(b.artist) ? 1 : 0
        if (bReal !== aReal) return bReal - aReal
        return b.stems.length - a.stems.length
      })
      for (const t of sorted) {
        if (best.length >= TRACKS_PER_GENRE) break
        tryAdd(t)
      }

      return best
    }

    const genreMap = new Map<string, Track[]>()
    for (const t of tracks) {
      const gId = t.tags[0] || 'other'
      if (!genreMap.has(gId)) genreMap.set(gId, [])
      genreMap.get(gId)!.push(t)
    }

    const sorted = [...genreMap.entries()].sort((a, b) => b[1].length - a[1].length)

    for (const [id, genreTracks] of sorted) {
      const genre = genres.find(g => g.id === id)
      const best = pickBest(genreTracks)
      if (best.length === 0) continue

      sections.push({
        id,
        label: genre?.label || id,
        tracks: best,
        totalCount: genreTracks.length,
      })
    }

    return sections
  }, [tracks, genres])

  // Auto-load first track (only once when sections first become available)
  const autoLoadedRef = useRef(false)
  useEffect(() => {
    if (!autoLoadedRef.current && genreSections.length > 0 && genreSections[0].tracks.length > 0 && !currentTrack) {
      autoLoadedRef.current = true
      loadTrack(capStemsForDemo(genreSections[0].tracks[0])).catch(() => {})
    }
  }, [genreSections]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectTrack = async (track: Track) => {
    try {
      await loadTrack(capStemsForDemo(track))
    } catch {
      // Silently handle audio load failures on mobile
    }
    const el = document.getElementById('demo-player')
    if (el && window.innerWidth < 1024) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const isPlaying = playbackState === 'playing'

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-[#121212] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--primary))]" />
          <p className="text-sm text-[#b3b3b3]">Carregando demonstração...</p>
        </div>
      </div>
    )
  }

  const DISPLAY_TOTAL = '100.000'

  return (
    <div className="min-h-dvh bg-[#121212] flex flex-col">
      {/* Top banner */}
      <div className="bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--primary))]/80 text-black text-center py-2.5 px-4 shrink-0">
        <p className="text-sm font-bold tracking-wide flex items-center justify-center gap-2">
          <Sparkles className="h-4 w-4" />
          Modo Demonstração — Explore o player profissional
          <Sparkles className="h-4 w-4" />
        </p>
      </div>

      {/* Main scrollable area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">

          {/* Stats bar */}
          <div className="flex items-center gap-4 mb-6 flex-wrap">
            <div className="flex items-center gap-2 text-sm text-[#b3b3b3]">
              <Music2 className="h-4 w-4 text-[hsl(var(--primary))]" />
              <span><strong className="text-white">+{DISPLAY_TOTAL}</strong> faixas</span>
            </div>
            <div className="h-4 w-px bg-white/10" />
            <div className="flex items-center gap-2 text-sm text-[#b3b3b3]">
              <Layers className="h-4 w-4 text-[hsl(var(--primary))]" />
              <span><strong className="text-white">Todos</strong> os gêneros</span>
            </div>
            <div className="h-4 w-px bg-white/10" />
            <div className="flex items-center gap-2 text-sm text-[#b3b3b3]">
              <Sparkles className="h-4 w-4 text-[hsl(var(--primary))]" />
              <span>Multipistas separadas</span>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">

            {/* ─── LEFT: Genre sections ─── */}
            <div className="w-full lg:w-[420px] xl:w-[480px] shrink-0 space-y-6">
              <h2 className="text-xs font-semibold text-[#b3b3b3] uppercase tracking-wider">
                Escolha uma faixa para ouvir
              </h2>

              {genreSections.map(section => (
                <div key={section.id}>
                  <div className="mb-2">
                    <h3 className="text-sm font-bold text-white">
                      {section.label}
                    </h3>
                  </div>

                  <div className="space-y-1">
                    {section.tracks.map((track, i) => {
                      const isActive = currentTrack?.id === track.id
                      const isCurrentPlaying = isActive && isPlaying
                      return (
                        <button
                          key={track.id}
                          onClick={() => handleSelectTrack(track)}
                          className={cn(
                            'flex items-center gap-3 w-full rounded-lg p-2.5 transition-all text-left group',
                            isActive
                              ? 'bg-white/10 ring-1 ring-[hsl(var(--primary))]/40'
                              : 'bg-white/[0.03] hover:bg-white/[0.07]'
                          )}
                        >
                          <div className="w-6 shrink-0 text-center">
                            {isCurrentPlaying ? (
                              <div className="flex items-end justify-center gap-[2px] h-4">
                                <span className="eq-bar" style={{ animationDuration: '0.6s' }} />
                                <span className="eq-bar" style={{ animationDuration: '0.8s' }} />
                                <span className="eq-bar" style={{ animationDuration: '0.5s' }} />
                              </div>
                            ) : (
                              <>
                                <span className="text-xs text-[#808080] tabular-nums group-hover:hidden block">
                                  {i + 1}
                                </span>
                                <Play className="h-3.5 w-3.5 text-white hidden group-hover:block mx-auto" />
                              </>
                            )}
                          </div>

                          <div className="h-10 w-10 rounded-md overflow-hidden shrink-0 shadow-md">
                            <img src={track.coverUrl} alt={track.title} className="h-full w-full object-cover" />
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className={cn(
                              'text-sm font-semibold truncate',
                              isActive ? 'text-[hsl(var(--primary))]' : 'text-white'
                            )}>
                              {track.title}
                            </p>
                            <p className="text-[11px] text-[#808080] truncate">{track.artist}</p>
                          </div>

                          {track.hasStems && track.stems.length > 1 && (
                            <div className="flex items-center gap-1 text-[10px] text-[#808080] font-medium shrink-0 bg-white/5 px-1.5 py-0.5 rounded">
                              <Layers className="h-3 w-3" />
                              {track.stems.length}
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>

                  {section.totalCount > TRACKS_PER_GENRE && (
                    <a
                      href="https://palcosolo.online/#pricing"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 mt-1.5 px-3 py-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] border border-dashed border-white/10 transition-colors group"
                    >
                      <Lock className="h-3.5 w-3.5 text-[#808080] group-hover:text-[hsl(var(--primary))]" />
                      <span className="text-xs text-[#808080] group-hover:text-white transition-colors">
                        +{DISPLAY_TOTAL} faixas no plano completo
                      </span>
                    </a>
                  )}
                </div>
              ))}
            </div>

            {/* ─── RIGHT: Player (sticky) ─── */}
            <div id="demo-player" className="flex-1 min-w-0 lg:sticky lg:top-4 lg:self-start">
              <div className="space-y-5">
                {currentTrack ? (
                  <>
                    <div className="flex flex-col sm:flex-row gap-5 items-start">
                      <div className="w-full max-w-[200px] mx-auto sm:mx-0 shrink-0">
                        <div className="relative aspect-square rounded-lg overflow-hidden shadow-2xl shadow-black/60">
                          <img src={currentTrack.coverUrl} alt={currentTrack.title} className="h-full w-full object-cover" />
                          {isPlaying && (
                            <div className="absolute bottom-3 left-3 flex items-end gap-1 h-5">
                              <span className="eq-bar w-1" style={{ animationDuration: '0.6s' }} />
                              <span className="eq-bar w-1" style={{ animationDuration: '0.8s' }} />
                              <span className="eq-bar w-1" style={{ animationDuration: '0.5s' }} />
                              <span className="eq-bar w-1" style={{ animationDuration: '0.7s' }} />
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex-1 min-w-0 w-full">
                        <h1 className="text-lg md:text-2xl font-extrabold text-white leading-tight line-clamp-2">
                          {currentTrack.title}
                        </h1>
                        <p className="text-sm text-[#b3b3b3] mt-1">{currentTrack.artist}</p>

                        <div className="flex flex-wrap items-center gap-2 mt-3">
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/10 text-white">
                            {currentTrack.genreLabel}
                          </span>
                          {currentTrack.hasStems && (
                            <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-[hsl(var(--primary))]/20 text-[hsl(var(--primary))]">
                              <Layers className="h-3 w-3" />
                              {currentTrack.stems.length} stems
                            </span>
                          )}
                          {pitch !== 0 && (
                            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[hsl(var(--primary))]/20 text-[hsl(var(--primary))]">
                              {semitonesToLabel(pitch)}
                            </span>
                          )}
                          {speed !== 1 && (
                            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/10 text-white/70">
                              {speedToLabel(speed)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {error && (
                      <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3">
                        <p className="text-sm text-red-300">{error}</p>
                      </div>
                    )}

                    <ProgressBar />
                    <PlayerControls size="large" />

                    <button
                      onClick={() => setShowTuning(!showTuning)}
                      className="flex items-center gap-2 text-sm font-semibold text-[#b3b3b3] hover:text-white transition-colors"
                    >
                      <Gauge className="h-4 w-4" />
                      Tom & Velocidade
                      {(pitch !== 0 || speed !== 1) && (
                        <span className="text-[hsl(var(--primary))] text-xs">
                          {pitch !== 0 && semitonesToLabel(pitch)}
                          {pitch !== 0 && speed !== 1 && ' · '}
                          {speed !== 1 && speedToLabel(speed)}
                        </span>
                      )}
                      {showTuning ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>

                    {showTuning && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
                        <div className="rounded-lg bg-white/5 p-4">
                          <PitchControl />
                        </div>
                        <div className="rounded-lg bg-white/5 p-4">
                          <SpeedControl />
                        </div>
                      </div>
                    )}

                    <StemMixer />

                    {/* Inline CTA */}
                    <div className="rounded-xl bg-gradient-to-br from-[hsl(var(--primary))]/10 to-[hsl(var(--primary))]/5 border border-[hsl(var(--primary))]/20 p-5 mt-4">
                      <div className="flex items-start gap-3 mb-3">
                        <Crown className="h-5 w-5 text-[hsl(var(--primary))] shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-bold text-white">Gostou do que ouviu?</p>
                          <p className="text-xs text-[#b3b3b3] mt-1 leading-relaxed">
                            No plano completo você tem acesso a <strong className="text-white">+{DISPLAY_TOTAL} faixas</strong> com multipistas separadas, alteração de tom com I.A e atualizações semanais.
                          </p>
                        </div>
                      </div>
                      <a
                        href={CTA_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-2 h-10 rounded-full px-6 text-sm font-bold bg-[hsl(var(--primary))] text-black hover:opacity-90 transition-opacity"
                      >
                        Quero o Avançado — R$197
                        <ArrowRight className="h-4 w-4" />
                      </a>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 gap-4">
                    <Music2 className="h-10 w-10 text-[#535353]" />
                    <p className="text-sm text-[#b3b3b3]">Selecione uma faixa para começar</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Full-width CTA at bottom */}
          <div className="mt-12 mb-4">
            <div className="rounded-2xl bg-gradient-to-r from-[hsl(var(--primary))]/15 via-[hsl(var(--primary))]/10 to-transparent border border-[hsl(var(--primary))]/20 p-6 md:p-8">
              <div className="max-w-2xl">
                <h2 className="text-xl md:text-2xl font-extrabold text-white mb-3">
                  Pronto para o próximo nível?
                </h2>
                <ul className="space-y-2 mb-5">
                  <li className="flex items-center gap-2 text-sm text-[#b3b3b3]">
                    <CheckCircle2 className="h-4 w-4 text-[hsl(var(--primary))] shrink-0" />
                    <span><strong className="text-white">+{DISPLAY_TOTAL}</strong> faixas profissionais com multipistas</span>
                  </li>
                  <li className="flex items-center gap-2 text-sm text-[#b3b3b3]">
                    <CheckCircle2 className="h-4 w-4 text-[hsl(var(--primary))] shrink-0" />
                    <span>Alteração de tom com <strong className="text-white">Inteligência Artificial</strong></span>
                  </li>
                  <li className="flex items-center gap-2 text-sm text-[#b3b3b3]">
                    <CheckCircle2 className="h-4 w-4 text-[hsl(var(--primary))] shrink-0" />
                    <span>Atualizações semanais com lançamentos novos</span>
                  </li>
                  <li className="flex items-center gap-2 text-sm text-[#b3b3b3]">
                    <CheckCircle2 className="h-4 w-4 text-[hsl(var(--primary))] shrink-0" />
                    <span>Acesso vitalício — <strong className="text-white">pagamento único</strong></span>
                  </li>
                </ul>
                <a
                  href="https://palcosolo.online/#pricing"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 h-12 rounded-full px-8 text-sm font-bold bg-[hsl(var(--primary))] text-black hover:scale-[1.02] transition-transform"
                >
                  <Crown className="h-4 w-4" />
                  Ver planos e preços
                  <ArrowRight className="h-4 w-4" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating CTA (appears after 15s) */}
      {showCta && !dismissedCta && (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:max-w-sm z-50 animate-fade-in">
          <div className="relative rounded-xl bg-[#1a1a1a] border border-[hsl(var(--primary))]/30 shadow-2xl shadow-black/60 p-4">
            <button
              onClick={() => setDismissedCta(true)}
              className="absolute top-2 right-2 p-1 text-[#808080] hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-full bg-[hsl(var(--primary))]/20 flex items-center justify-center shrink-0">
                <Crown className="h-5 w-5 text-[hsl(var(--primary))]" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">Acesso completo</p>
                <p className="text-xs text-[#808080]">Pagamento único · Vitalício</p>
              </div>
            </div>
            <a
              href="https://palcosolo.online/#pricing"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full h-10 rounded-lg text-sm font-bold bg-[hsl(var(--primary))] text-black hover:opacity-90 transition-opacity"
            >
              Ver planos e preços
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      )}

      {/* Persistent bottom bar */}
      <div className="shrink-0 border-t border-white/10 bg-[#0a0a0a] px-4 py-3">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-sm text-[#b3b3b3] text-center sm:text-left">
            <span className="text-white font-semibold">Demonstração gratuita</span> — +{DISPLAY_TOTAL} faixas no catálogo completo
          </p>
          <a
            href="https://palcosolo.online/#pricing"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 h-10 rounded-full px-6 text-sm font-bold bg-[hsl(var(--primary))] text-black hover:opacity-90 transition-opacity shrink-0"
          >
            Ver planos e preços
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>
  )
}

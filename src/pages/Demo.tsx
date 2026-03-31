import { useEffect, useMemo, useState } from 'react'
import { Layers, Music2, Gauge, ChevronDown, ChevronUp, Loader2, ExternalLink } from 'lucide-react'
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

export default function Demo() {
  const { tracks, isLoading, loadCatalog } = useCatalogStore()
  const { track: currentTrack, playbackState, pitch, speed, loadTrack, error } = usePlayerStore()
  const [showTuning, setShowTuning] = useState(false)

  useEffect(() => {
    loadCatalog()
  }, [loadCatalog])

  // Pick 5 tracks with the most stems
  const demoTracks = useMemo(() => {
    if (!tracks.length) return []
    return [...tracks]
      .filter(t => t.hasStems && t.stems.length > 1)
      .sort((a, b) => b.stems.length - a.stems.length)
      .slice(0, 5)
  }, [tracks])

  // Auto-load first track when catalog is ready
  useEffect(() => {
    if (demoTracks.length > 0 && !currentTrack) {
      loadTrack(demoTracks[0])
    }
  }, [demoTracks, currentTrack, loadTrack])

  const handleSelectTrack = (track: Track) => {
    loadTrack(track)
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

  if (!isLoading && demoTracks.length === 0) {
    return (
      <div className="min-h-dvh bg-[#121212] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center px-4">
          <Music2 className="h-12 w-12 text-[#535353]" />
          <h2 className="text-xl font-bold text-white">Nenhuma faixa disponível</h2>
          <p className="text-sm text-[#b3b3b3] max-w-sm">
            O catálogo está vazio no momento. Tente novamente mais tarde.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-[#121212] flex flex-col">
      {/* Demo banner */}
      <div className="bg-[hsl(var(--primary))] text-black text-center py-2.5 px-4 shrink-0">
        <p className="text-sm font-bold tracking-wide">
          Modo Demonstração — Experimente o player completo
        </p>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        <div className={cn(
          'min-h-full transition-colors duration-1000',
          isPlaying
            ? 'bg-gradient-to-b from-[#1e3a2f] via-[#171717] to-[#121212]'
            : 'bg-gradient-to-b from-[#2a2a2a] via-[#171717] to-[#121212]'
        )}>
          <div className="max-w-6xl mx-auto px-4 md:px-6 py-4 md:py-8">
            <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">

              {/* Track list — top on mobile, left on desktop */}
              <div className="w-full lg:w-72 shrink-0">
                <h2 className="text-xs font-semibold text-[#b3b3b3] uppercase tracking-wider mb-3">
                  Faixas de demonstração
                </h2>
                <div className="flex flex-row lg:flex-col gap-2 overflow-x-auto lg:overflow-x-visible pb-2 lg:pb-0 -mx-1 px-1">
                  {demoTracks.map(track => {
                    const isActive = currentTrack?.id === track.id
                    return (
                      <button
                        key={track.id}
                        onClick={() => handleSelectTrack(track)}
                        className={cn(
                          'flex items-center gap-3 rounded-lg p-3 transition-colors text-left min-w-[220px] lg:min-w-0 w-full shrink-0 lg:shrink',
                          isActive
                            ? 'bg-white/10 ring-1 ring-[hsl(var(--primary))]/50'
                            : 'bg-white/5 hover:bg-white/[0.08]'
                        )}
                      >
                        {/* Cover art */}
                        <div className="h-12 w-12 rounded-md overflow-hidden shrink-0">
                          <img
                            src={track.coverUrl}
                            alt={track.title}
                            className="h-full w-full object-cover"
                          />
                        </div>

                        {/* Info */}
                        <div className="min-w-0 flex-1">
                          <p className={cn(
                            'text-sm font-semibold truncate',
                            isActive ? 'text-[hsl(var(--primary))]' : 'text-white'
                          )}>
                            {track.title}
                          </p>
                          <p className="text-xs text-[#b3b3b3] truncate">{track.artist}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <Layers className="h-3 w-3 text-[#808080]" />
                            <span className="text-[10px] text-[#808080] font-medium">
                              {track.stems.length} stems
                            </span>
                          </div>
                        </div>

                        {/* Playing indicator */}
                        {isActive && isPlaying && (
                          <div className="flex items-end gap-0.5 h-4 shrink-0">
                            <span className="eq-bar w-0.5" style={{ animationDuration: '0.6s' }} />
                            <span className="eq-bar w-0.5" style={{ animationDuration: '0.8s' }} />
                            <span className="eq-bar w-0.5" style={{ animationDuration: '0.5s' }} />
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Player — bottom on mobile, right on desktop */}
              <div className="flex-1 min-w-0 space-y-5">
                {currentTrack ? (
                  <>
                    {/* Track info + album art */}
                    <div className="flex flex-col sm:flex-row gap-5 items-start">
                      {/* Album art */}
                      <div className="w-full max-w-[200px] mx-auto sm:mx-0 shrink-0">
                        <div className="relative aspect-square rounded-lg overflow-hidden shadow-2xl shadow-black/60">
                          <img
                            src={currentTrack.coverUrl}
                            alt={currentTrack.title}
                            className="h-full w-full object-cover"
                          />
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

                      {/* Track details */}
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

                    {/* Error */}
                    {error && (
                      <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3">
                        <p className="text-sm text-red-300">{error}</p>
                      </div>
                    )}

                    {/* Progress */}
                    <ProgressBar />

                    {/* Controls */}
                    <PlayerControls size="large" />

                    {/* Pitch & Speed toggle */}
                    <button
                      onClick={() => setShowTuning(!showTuning)}
                      className="flex items-center gap-2 text-sm font-semibold text-[#b3b3b3] hover:text-white transition-colors"
                    >
                      <Gauge className="h-4 w-4" />
                      Tom & Velocidade
                      {(pitch !== 0 || speed !== 1) && (
                        <span className="text-[hsl(var(--primary))] text-xs">
                          {pitch !== 0 && semitonesToLabel(pitch)}
                          {pitch !== 0 && speed !== 1 && ' \u00b7 '}
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

                    {/* Stem Mixer */}
                    <StemMixer />
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
        </div>
      </div>

      {/* Persistent CTA at bottom */}
      <div className="shrink-0 border-t border-white/10 bg-[#0a0a0a] px-4 py-3">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-sm text-[#b3b3b3] text-center sm:text-left">
            Gostou? Acesse o catálogo completo com todas as faixas e recursos.
          </p>
          <a
            href="https://palcosolo.online/#pricing"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 h-10 rounded-full px-6 text-sm font-bold bg-[hsl(var(--primary))] text-black hover:opacity-90 transition-opacity shrink-0"
          >
            Acesse o catálogo completo
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>
  )
}

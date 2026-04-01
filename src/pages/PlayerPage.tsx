import { useNavigate } from 'react-router-dom'
import {
  Mic2, Layers, Music2,
  ArrowLeft, AlertCircle, ChevronDown, ChevronUp,
  Gauge, Heart, Save, Check,
} from 'lucide-react'
import { usePlayerStore } from '@/store/playerStore'
import { useFavoritesStore } from '@/store/favoritesStore'
import { useTrackSettingsStore } from '@/store/trackSettingsStore'
import { PlayerControls } from '@/components/player/PlayerControls'
import { ProgressBar } from '@/components/player/ProgressBar'
import { PitchControl } from '@/components/player/PitchControl'
import { SpeedControl } from '@/components/player/SpeedControl'
import { StemMixer } from '@/components/player/StemMixer'
import { Badge } from '@/components/ui/badge'
import { semitonesToLabel, speedToLabel } from '@/lib/utils'
import { useState } from 'react'
import { cn } from '@/lib/utils'

export default function PlayerPage() {
  const navigate = useNavigate()
  const track = usePlayerStore(s => s.track)
  const pitch = usePlayerStore(s => s.pitch)
  const speed = usePlayerStore(s => s.speed)
  const playbackState = usePlayerStore(s => s.playbackState)
  const stemStates = usePlayerStore(s => s.stemStates)
  const togglePerformanceMode = usePlayerStore(s => s.togglePerformanceMode)
  const error = usePlayerStore(s => s.error)
  const toggleFav = useFavoritesStore(s => s.toggle)
  const isFav = useFavoritesStore(s => s.isFavorite)
  const saveSettings = useTrackSettingsStore(s => s.save)
  const hasSaved = useTrackSettingsStore(s => s.has)
  const removeSettings = useTrackSettingsStore(s => s.remove)
  const [showTuning, setShowTuning] = useState(false)
  const [justSaved, setJustSaved] = useState(false)

  if (!track) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-5 p-8">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white/5">
          <Music2 className="h-10 w-10 text-[#535353]" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-bold text-white">Nenhuma faixa carregada</h2>
          <p className="text-[#b3b3b3] text-sm mt-2 max-w-xs">
            Selecione uma faixa na biblioteca para começar.
          </p>
        </div>
        <button
          onClick={() => navigate('/app/library')}
          className="h-10 rounded-full px-8 text-sm font-bold bg-white text-black hover:scale-105 transition-transform"
        >
          Abrir Biblioteca
        </button>
      </div>
    )
  }

  const isPlaying = playbackState === 'playing'

  return (
    <div className="h-full overflow-y-auto">
      {/* Dynamic gradient background based on playback */}
      <div className={cn(
        'min-h-full transition-colors duration-1000',
        isPlaying
          ? 'bg-gradient-to-b from-[#1e3a2f] via-[#171717] to-[#121212]'
          : 'bg-gradient-to-b from-[#2a2a2a] via-[#171717] to-[#121212]'
      )}>
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-4 md:py-6 space-y-5 md:space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 text-[#b3b3b3] hover:text-white transition-colors text-sm font-medium"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Voltar</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={togglePerformanceMode}
                className="flex items-center gap-2 h-8 rounded-full px-4 text-xs font-semibold bg-white/10 text-white hover:bg-white/20 transition-colors"
              >
                <Mic2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Modo Palco</span>
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* Main player area */}
          <div className="flex flex-col md:flex-row gap-5 md:gap-8 items-start">
            {/* Album art */}
            <div className="w-full max-w-[240px] mx-auto md:mx-0 md:max-w-none md:w-80 shrink-0">
              <div className="relative aspect-square rounded-lg overflow-hidden shadow-2xl shadow-black/60">
                <img
                  src={track.coverUrl}
                  alt={track.title}
                  className="h-full w-full object-cover"
                />
                {isPlaying && (
                  <div className="absolute bottom-4 left-4 flex items-end gap-1 h-6">
                    <span className="eq-bar w-1" style={{ animationDuration: '0.6s' }} />
                    <span className="eq-bar w-1" style={{ animationDuration: '0.8s' }} />
                    <span className="eq-bar w-1" style={{ animationDuration: '0.5s' }} />
                    <span className="eq-bar w-1" style={{ animationDuration: '0.7s' }} />
                  </div>
                )}
              </div>
            </div>

            {/* Track info + controls */}
            <div className="flex-1 min-w-0 w-full space-y-5">
              {/* Title */}
              <div>
                <h1 className="text-lg md:text-3xl font-extrabold text-white leading-tight line-clamp-2">
                  {track.title}
                </h1>
                <p className="text-sm md:text-base text-[#b3b3b3] mt-1">{track.artist}</p>

                {/* Tags + Actions */}
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/10 text-white">
                    {track.genreLabel}
                  </span>
                  {track.hasStems && (
                    <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-[hsl(var(--primary))]/20 text-[hsl(var(--primary))]">
                      <Layers className="h-3 w-3" />
                      {track.stems.length} stems
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

                {/* Favorite + Save settings */}
                <div className="flex items-center gap-3 mt-3">
                  <button
                    onClick={() => toggleFav(track.id)}
                    className="flex items-center gap-1.5 h-9 rounded-full px-4 text-xs font-semibold transition-colors bg-white/5 hover:bg-white/10"
                  >
                    <Heart className={cn(
                      'h-4 w-4 transition-colors',
                      isFav(track.id)
                        ? 'fill-red-500 text-red-500'
                        : 'text-[#b3b3b3]'
                    )} />
                    <span className={isFav(track.id) ? 'text-red-400' : 'text-[#b3b3b3]'}>
                      {isFav(track.id) ? 'Favoritada' : 'Favoritar'}
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      if (hasSaved(track.id)) {
                        removeSettings(track.id)
                      } else {
                        saveSettings(track.id, pitch, speed, stemStates)
                        setJustSaved(true)
                        setTimeout(() => setJustSaved(false), 2000)
                      }
                    }}
                    className={cn(
                      'flex items-center gap-1.5 h-9 rounded-full px-4 text-xs font-semibold transition-colors',
                      hasSaved(track.id)
                        ? 'bg-[hsl(var(--primary))]/20 text-[hsl(var(--primary))] hover:bg-red-500/20 hover:text-red-400'
                        : 'bg-white/5 text-[#b3b3b3] hover:bg-white/10'
                    )}
                  >
                    {justSaved ? (
                      <><Check className="h-4 w-4" /> Salvo!</>
                    ) : hasSaved(track.id) ? (
                      <><Save className="h-4 w-4" /> Ajustes Salvos</>
                    ) : (
                      <><Save className="h-4 w-4" /> Salvar Ajustes</>
                    )}
                  </button>
                </div>
              </div>

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
            </div>
          </div>

          {/* Stem Mixer */}
          <div id="player-mixer" className="scroll-mt-4">
            <StemMixer />
          </div>
        </div>
      </div>
    </div>
  )
}

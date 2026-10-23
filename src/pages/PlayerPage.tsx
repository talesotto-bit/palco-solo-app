import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import {
  Mic2, Layers, Music2, ArrowLeft, AlertCircle, Heart, Download, Loader2, ListPlus, RotateCcw,
  AlignLeft, Guitar, Gauge, SlidersHorizontal, MicOff, Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { usePlayerStore } from '@/store/playerStore'
import { useFavoritesStore } from '@/store/favoritesStore'
import { useTrackSettingsStore } from '@/store/trackSettingsStore'
import { useAddToShow } from '@/store/addToShowStore'
import { useLocalTracksStore } from '@/store/localTracksStore'
import { PlayerControls } from '@/components/player/PlayerControls'
import { ProgressBar } from '@/components/player/ProgressBar'
import { PitchControl } from '@/components/player/PitchControl'
import { SpeedControl } from '@/components/player/SpeedControl'
import { StemMixer } from '@/components/player/StemMixer'
import { LyricsPanel } from '@/components/player/LyricsPanel'
import { CifrasPanel } from '@/components/player/CifrasPanel'
import { useCoverArt } from '@/hooks/useCoverArt'
import { FirstTip } from '@/components/FirstTip'
import { semitonesToLabel, speedToLabel, cn } from '@/lib/utils'

type Tab = 'letra' | 'cifra' | 'tom' | 'mixer'

export default function PlayerPage() {
  const navigate = useNavigate()
  const track = usePlayerStore(s => s.track)
  const pitch = usePlayerStore(s => s.pitch)
  const speed = usePlayerStore(s => s.speed)
  const playbackState = usePlayerStore(s => s.playbackState)
  const loadProgress = usePlayerStore(s => s.loadProgress)
  const bgProgress = usePlayerStore(s => s.bgProgress)
  const previewActive = usePlayerStore(s => s.previewActive)
  const error = usePlayerStore(s => s.error)
  const isExporting = usePlayerStore(s => s.isExporting)
  const toggleFav = useFavoritesStore(s => s.toggle)
  const isFav = useFavoritesStore(s => (track ? s.ids.includes(track.id) : false))
  const hasSaved = useTrackSettingsStore(s => (track ? !!s.settings[track.id] : false))
  const removeSettings = useTrackSettingsStore(s => s.remove)
  const openAddToShow = useAddToShow(s => s.open)
  const noVocalsStem = track?.stems.find(s => s.derive === 'karaoke')
  const noVocalsOn = usePlayerStore(s => (noVocalsStem ? !s.stemStates[noVocalsStem.id]?.muted : false))
  const isLocal = !!track?.id.startsWith('local-')
  const keySuggestion = usePlayerStore(s => s.keySuggestion)
  const [tab, setTab] = useState<Tab>('letra')
  const coverUrl = useCoverArt(track?.artist || '', track?.title || '', track?.coverUrl || '')

  if (!track) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-5 p-8">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white/5">
          <Music2 className="h-10 w-10 text-[#535353]" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-bold text-white">Escolha uma música</h2>
          <p className="text-[#b3b3b3] text-sm mt-2 max-w-xs">Abra uma música da biblioteca ou de um show para ajustar tom, mixer, letra e cifra.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate('/app/library')} className="h-11 rounded-full px-6 text-sm font-bold bg-white text-black">Abrir biblioteca</button>
          <button onClick={() => navigate('/app/shows')} className="h-11 rounded-full px-6 text-sm font-bold bg-white/10 text-white">Meus shows</button>
        </div>
      </div>
    )
  }

  const isPlaying = playbackState === 'playing'
  const isLoading = playbackState === 'loading'
  const restoreOriginal = () => {
    const s = usePlayerStore.getState()
    s.resetPitch(); s.resetSpeed(); s.resetMix()
    removeSettings(track.id)
    toast('Música de volta ao original')
  }

  const tabs: [Tab, string, typeof AlignLeft][] = [['letra', 'Letra', AlignLeft], ['cifra', 'Cifra', Guitar], ['tom', 'Tom', Gauge], ['mixer', 'Mixer', SlidersHorizontal]]

  return (
    <div className="h-full overflow-y-auto">
      <div className={cn('min-h-full transition-colors duration-1000',
        isPlaying ? 'bg-gradient-to-b from-[#1e3a2f] via-[#171717] to-[#121212]' : 'bg-gradient-to-b from-[#2a2a2a] via-[#171717] to-[#121212]')}>
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 md:py-6">
          {/* Topo */}
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => navigate(-1)} className="h-10 -ml-2 px-2 flex items-center gap-2 text-[#b3b3b3] hover:text-white text-sm font-medium">
              <ArrowLeft className="h-5 w-5" /><span className="hidden sm:inline">Voltar</span>
            </button>
            <button onClick={() => navigate('/app/performance')} className="flex items-center gap-2 h-9 rounded-full px-4 text-xs font-bold bg-white/10 text-white hover:bg-white/20">
              <Mic2 className="h-4 w-4" /> Modo Palco
            </button>
          </div>

          <div className="flex flex-col lg:flex-row gap-5 lg:gap-8">
            {/* Coluna principal */}
            <div className="flex-1 min-w-0 space-y-4 md:space-y-6">
              <div className="flex gap-4 md:gap-8 items-center md:items-start">
                <div className="w-24 md:w-56 shrink-0">
                  <div className="relative aspect-square rounded-lg overflow-hidden shadow-2xl shadow-black/60">
                    <img src={coverUrl} alt="" onError={e => { if (track.coverUrl && e.currentTarget.src !== track.coverUrl) e.currentTarget.src = track.coverUrl }} className="h-full w-full object-cover bg-[#2a2a2a]" />
                    {isPlaying && (
                      <div className="absolute bottom-2 left-2 flex items-end gap-1 h-4">
                        <span className="eq-bar w-1" /><span className="eq-bar w-1" style={{ animationDuration: '0.8s' }} /><span className="eq-bar w-1" style={{ animationDuration: '0.5s' }} />
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-xl md:text-3xl font-extrabold text-white leading-tight line-clamp-2">{track.title}</h1>
                  <p className="text-sm text-[#b3b3b3] mt-0.5 truncate">{track.artist}</p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    {track.hasStems && <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[hsl(var(--primary))]/20 text-[hsl(var(--primary))]"><Layers className="h-3 w-3" />{track.stems.length} pistas</span>}
                    {track.keyNote && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/10 text-white">Tom {track.keyNote}</span>}
                    {pitch !== 0 && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[hsl(var(--primary))]/20 text-[hsl(var(--primary))]">{semitonesToLabel(pitch)}</span>}
                    {speed !== 1 && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/10 text-white/70">{speedToLabel(speed)}</span>}
                  </div>
                </div>
              </div>

              {/* Ações */}
              <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
                <button onClick={() => openAddToShow(track)} className="flex items-center gap-1.5 h-9 rounded-full px-3.5 text-xs font-bold bg-white text-black shrink-0">
                  <ListPlus className="h-4 w-4" /> Adicionar ao show
                </button>
                {noVocalsStem && (
                  <button onClick={() => usePlayerStore.getState().toggleNoVocals()}
                    className={cn('flex items-center gap-1.5 h-9 rounded-full px-3.5 text-xs font-bold shrink-0', noVocalsOn ? 'bg-purple-400 text-black' : 'bg-purple-500/20 text-purple-200')}>
                    <MicOff className="h-4 w-4" /> {noVocalsOn ? 'Voz removida (beta)' : 'Tirar a voz (beta)'}
                  </button>
                )}
                <button onClick={() => toggleFav(track.id)} className="flex items-center gap-1.5 h-9 rounded-full px-3 text-xs font-semibold bg-white/[0.07] shrink-0">
                  <Heart className={cn('h-4 w-4', isFav ? 'fill-red-500 text-red-500' : 'text-[#b3b3b3]')} />
                  <span className={isFav ? 'text-red-400' : 'text-[#cfcfcf]'}>{isFav ? 'Favorita' : 'Favoritar'}</span>
                </button>
                {hasSaved && (
                  <button onClick={restoreOriginal} className="flex items-center gap-1.5 h-9 rounded-full px-3 text-xs font-semibold bg-white/[0.07] text-[#cfcfcf] shrink-0">
                    <RotateCcw className="h-4 w-4" /> Voltar ao original
                  </button>
                )}
                {isLocal && (
                  <button onClick={async () => {
                    if (!confirm(`Apagar "${track.title}" deste aparelho?`)) return
                    usePlayerStore.getState().stop()
                    await useLocalTracksStore.getState().removeTrack(track.id)
                    toast('Música apagada do aparelho'); navigate('/app/library')
                  }} className="flex items-center gap-1.5 h-9 rounded-full px-3 text-xs font-semibold bg-white/[0.07] text-red-300 shrink-0">
                    <Trash2 className="h-4 w-4" /> Apagar
                  </button>
                )}
                <button onClick={() => void usePlayerStore.getState().downloadMix()} disabled={isExporting || isLoading}
                  className="flex items-center gap-1.5 h-9 rounded-full px-3 text-xs font-semibold bg-white/[0.07] text-[#cfcfcf] shrink-0 disabled:opacity-40">
                  {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} {isExporting ? 'Gerando MP3...' : 'Baixar MP3'}
                </button>
              </div>

              <FirstTip id="player" title="Como usar o player" items={[
                'Tom: sobe ou desce de ½ em ½ tom (letra e cifra acompanham)',
                'Mixer: toque em M para tirar um instrumento',
                'Loop A-B: repete um trecho para ensaiar',
                'Tudo que você ajusta fica salvo nesta música',
              ]} />

              {keySuggestion && (
                keySuggestion.applied && Math.round(pitch) === keySuggestion.shift ? (
                  <div className="flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))]/10 px-3 py-2 text-xs">
                    <span className="flex-1 text-[#d6d6d6]">Aberta {keySuggestion.shift < 0 ? '2 tons abaixo' : '2 tons acima'} para a sua voz {keySuggestion.shift < 0 ? 'masculina' : 'feminina'}.</span>
                    <button onClick={() => usePlayerStore.getState().resetPitch()} className="h-7 px-2.5 rounded-full bg-white/10 font-bold shrink-0">Tom original</button>
                  </div>
                ) : Math.round(pitch) === 0 ? (
                  <button onClick={() => usePlayerStore.getState().applyKeySuggestion()}
                    className="w-full flex items-center gap-2 rounded-xl bg-amber-400/10 border border-amber-400/30 px-3 py-2.5 text-left text-xs">
                    <span className="text-lg">{keySuggestion.shift < 0 ? '🎤' : '🎙️'}</span>
                    <span className="flex-1 text-amber-100">{keySuggestion.shift < 0 ? 'Música de cantora.' : 'Música de cantor.'} Abrir {keySuggestion.shift < 0 ? '2 tons abaixo' : '2 tons acima'} para a sua voz?</span>
                    <span className="h-7 px-2.5 rounded-full bg-amber-400 text-black font-bold flex items-center shrink-0">Ajustar</span>
                  </button>
                ) : null
              )}

              {error && (
                <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2.5">
                  <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                  <p className="text-sm text-red-300 flex-1">{error}</p>
                  <button onClick={() => void usePlayerStore.getState().play()} className="h-8 px-3 rounded-full bg-white/10 text-xs font-bold shrink-0">Tentar de novo</button>
                </div>
              )}

              {/* Tocar */}
              <div className="sticky top-0 z-10 -mx-4 px-4 py-2 bg-[#171717]/90 backdrop-blur lg:static lg:bg-transparent lg:backdrop-blur-0 lg:p-0 lg:mx-0 space-y-2">
                <ProgressBar />
                <PlayerControls size="large" />
                {isLoading && (
                  <div className="flex items-center gap-2 text-xs text-[#b3b3b3]">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[hsl(var(--primary))]" />
                    <span>Preparando as pistas{loadProgress ? ` (${loadProgress.loaded}/${loadProgress.total})` : ''}...</span>
                    {loadProgress && <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-[hsl(var(--primary))] transition-all" style={{ width: `${(loadProgress.loaded / loadProgress.total) * 100}%` }} /></div>}
                  </div>
                )}
                {!isLoading && (bgProgress || previewActive) && (
                  <p className="flex items-center justify-center gap-1.5 text-[11px] text-[#9a9a9a]">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {previewActive ? 'Tocando a prévia rápida' : 'Pistas chegando'}{bgProgress ? ` · pistas ${bgProgress.loaded}/${bgProgress.total}` : ''}
                  </p>
                )}
                {/* Abas no celular */}
                <div className="flex gap-1 lg:hidden pt-1">
                  {tabs.map(([id, label, Icon]) => (
                    <button key={id} onClick={() => setTab(id)}
                      className={cn('flex-1 h-9 rounded-full text-[12px] font-bold flex items-center justify-center gap-1', tab === id ? 'bg-white text-black' : 'bg-white/[0.07] text-[#cfcfcf]')}>
                      <Icon className="h-3.5 w-3.5" /> {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={cn('grid grid-cols-1 md:grid-cols-2 gap-4', tab !== 'tom' && 'hidden lg:grid')}>
                <div className="rounded-lg bg-white/5 p-4"><PitchControl /></div>
                <div className="rounded-lg bg-white/5 p-4"><SpeedControl /></div>
              </div>

              <div id="player-mixer" className={cn('scroll-mt-4', tab !== 'mixer' && 'hidden lg:block')}>
                <p className="text-[11px] text-[#9a9a9a] mb-2">Click e contagem começam desligados (som de show na caixa). Ligue para ouvir no fone. Tudo que você muda fica salvo nesta música.</p>
                <StemMixer />
              </div>
            </div>

            {/* Letra / cifra */}
            <div className={cn('lg:w-[380px] xl:w-[420px] lg:shrink-0 lg:sticky lg:top-4 lg:h-[calc(100vh-6rem)] flex flex-col', tab !== 'letra' && tab !== 'cifra' && 'hidden lg:flex')}>
              <div className="hidden lg:flex rounded-t-lg overflow-hidden shrink-0">
                {(['letra', 'cifra'] as const).map(id => (
                  <button key={id} onClick={() => setTab(id)}
                    className={cn('flex-1 py-2.5 text-xs font-bold transition-colors', (tab === id || (id === 'letra' && tab !== 'cifra')) ? 'bg-white/10 text-white' : 'bg-white/[0.03] text-[#808080] hover:text-white')}>
                    {id === 'letra' ? 'Letra' : 'Cifra'}
                  </button>
                ))}
              </div>
              <div className="flex-1 min-h-0 min-h-[60vh] lg:min-h-0">
                {tab === 'cifra' ? <CifrasPanel /> : <LyricsPanel />}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

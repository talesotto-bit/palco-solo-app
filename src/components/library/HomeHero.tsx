/**
 * Topo da tela inicial: saudação, sequência de ensaios 🔥 e um "Toque agora" com a música
 * para continuar (ou a música do dia) — um toque e já está tocando.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Play, Pause, Flame, Music2, Trophy, ChevronRight } from 'lucide-react'
import { useShowsStore, type Show } from '@/store/showsStore'
import { useProgressStore, songStatus, ACHIEVEMENTS } from '@/store/progressStore'
import { AchievementsSheet } from '@/components/progress/ProgressUI'
import { useInTrial, DEMO_IDS, isLocked } from '@/lib/trial'
import { usePlayerStore } from '@/store/playerStore'
import { usePrefsStore } from '@/store/prefsStore'
import { usePracticeStore, practiceStats } from '@/store/practiceStore'
import { getArtistScore } from '@/lib/featuredArtists'
import { CoverImg } from '@/components/shows/CoverImg'
import { audioEngine } from '@/audio/AudioEngine'
import { tap } from '@/lib/haptics'
import type { Track } from '@/types/track'

/** Mesma "música do dia" para todo mundo no mesmo dia, entre as de artistas conhecidos */
function songOfDay(tracks: Track[]): Track | undefined {
  const pool = tracks.filter(t => getArtistScore(t.artist) > 0 && !t.id.startsWith('local-'))
  if (!pool.length) return tracks[0]
  const d = new Date()
  const seed = d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate()
  return pool[(seed * 2654435761) % pool.length]
}

/** Próximo show: o de data mais próxima (hoje em diante); sem data, o ativo ou o último mexido */
function pickNextShow(shows: Show[], activeId: string | null): Show | undefined {
  const withSongs = shows.filter(s => s.songs.length)
  const today = new Date().toISOString().slice(0, 10)
  const dated = withSongs.filter(s => s.date && s.date >= today).sort((a, b) => a.date!.localeCompare(b.date!))
  return dated[0] || withSongs.find(s => s.id === activeId) || [...withSongs].sort((a, b) => b.updatedAt - a.updatedAt)[0]
}

function whenLabel(date?: string): string {
  if (!date) return ''
  const d = new Date(date + 'T12:00:00'), t = new Date(); t.setHours(12, 0, 0, 0)
  const days = Math.round((d.getTime() - t.getTime()) / 86400000)
  if (days === 0) return 'hoje'
  if (days === 1) return 'amanhã'
  if (days > 1 && days < 7) return d.toLocaleDateString('pt-BR', { weekday: 'long' })
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export function HomeHero({ tracks, byId }: { tracks: Track[]; byId: Map<string, Track> }) {
  const navigate = useNavigate()
  const recent = usePrefsStore(s => s.recent)
  const days = usePracticeStore(s => s.days)
  const current = usePlayerStore(s => s.track)
  const isPlaying = usePlayerStore(s => s.playbackState === 'playing')
  const { streak, todayDone, week } = practiceStats(days)
  const shows = useShowsStore(s => s.shows)
  const activeShowId = useShowsStore(s => s.activeShowId)
  const progress = useProgressStore(s => s.songs)
  const achDone = useProgressStore(s => Object.keys(s.unlocked).length)
  const [achOpen, setAchOpen] = useState(false)
  const nextShow = pickNextShow(shows, activeShowId)
  const ready = nextShow ? nextShow.songs.filter(x => songStatus(progress[x.trackId]) === 'pronta').length : 0

  const trial = useInTrial()
  const demo = useMemo(() => (trial ? [...DEMO_IDS].map(id => byId.get(id)).filter((t): t is Track => !!t) : []), [trial, byId])
  const lastTrack = recent.map(id => byId.get(id)).find(t => !!t && !isLocked(t))
  const featured = useMemo(() => lastTrack || demo[0] || songOfDay(tracks), [lastTrack, demo, tracks])
  const isContinue = !!lastTrack && featured === lastTrack
  const featuredPlaying = isPlaying && current?.id === featured?.id

  const h = new Date().getHours()
  const greeting = h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'

  const playFeatured = async () => {
    if (!featured) return
    tap(12)
    void audioEngine.unlock()
    const s = usePlayerStore.getState()
    if (s.track?.id === featured.id) { s.playbackState === 'playing' ? s.pause() : void s.play(); return }
    navigate('/app/player')
    await s.loadTrack(featured, { autoplay: true })
  }

  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[#141414] p-4 pb-3.5">
      {/* fundo vivo */}
      <div aria-hidden className="pointer-events-none absolute -top-16 -left-10 h-48 w-48 rounded-full bg-[hsl(var(--primary))]/25 blur-3xl animate-blob" />
      <div aria-hidden className="pointer-events-none absolute -bottom-20 right-0 h-52 w-52 rounded-full bg-purple-500/20 blur-3xl animate-blob" style={{ animationDelay: '-6s' }} />

      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-[26px] font-black leading-tight">{greeting} <span className="inline-block origin-[70%_70%] animate-wave">👋</span></h1>
          <p className="text-[13px] text-white/60">O que vamos tocar hoje?</p>
        </div>
        <button onClick={() => navigate('/app/ajuda')} className="mt-1 h-9 px-3 rounded-full bg-white/[0.08] text-xs font-semibold text-white/80 shrink-0 active:scale-95 transition-transform">Ajuda</button>
      </div>

      {/* sequência de ensaios */}
      <div className="relative mt-3 flex flex-wrap gap-1.5">
        {streak > 0 ? (
          <span className="flex items-center gap-1 rounded-full bg-orange-500/15 px-2.5 py-1 text-[12px] font-bold text-orange-200">
            <Flame className="h-3.5 w-3.5 text-orange-400" /> {streak} {streak === 1 ? 'dia' : 'dias seguidos'} ensaiando{!todayDone && ' · toque hoje para manter'}
          </span>
        ) : (
          <span className="flex items-center gap-1 rounded-full bg-white/[0.07] px-2.5 py-1 text-[12px] font-semibold text-white/70">
            <Flame className="h-3.5 w-3.5 text-white/50" /> Toque uma música hoje e comece sua sequência
          </span>
        )}
        {week > 0 && <span className="rounded-full bg-white/[0.07] px-2.5 py-1 text-[12px] font-semibold text-white/70">{week} música{week === 1 ? '' : 's'} esta semana</span>}
        <button onClick={() => setAchOpen(true)} className="flex items-center gap-1 rounded-full bg-amber-400/15 px-2.5 py-1 text-[12px] font-bold text-amber-200 active:scale-95 transition-transform">
          <Trophy className="h-3.5 w-3.5 text-amber-400" /> {achDone}/{ACHIEVEMENTS.length} conquistas
        </button>
      </div>

      {/* prontidão do próximo show */}
      {nextShow && !trial && (
        <button onClick={() => navigate(`/app/shows/${nextShow.id}`)} className="relative mt-2.5 w-full rounded-2xl bg-white/[0.04] border border-white/[0.06] px-3 py-2.5 text-left active:scale-[0.99] transition-transform">
          <span className="flex items-center gap-2 text-[12px]">
            <span className="flex-1 min-w-0 truncate text-white/75">🎤 <b className="text-white">{nextShow.name}</b>{nextShow.date ? ` · ${whenLabel(nextShow.date)}` : ''}</span>
            <span className={ready === nextShow.songs.length ? 'font-bold text-[hsl(var(--primary))]' : 'font-bold text-amber-300'}>{ready}/{nextShow.songs.length} prontas</span>
            <ChevronRight className="h-4 w-4 text-white/40" />
          </span>
          <span className="mt-1.5 block h-1.5 rounded-full bg-white/10 overflow-hidden">
            <span className="block h-full rounded-full bg-[hsl(var(--primary))] transition-all" style={{ width: `${(ready / nextShow.songs.length) * 100}%` }} />
          </span>
          {ready < nextShow.songs.length && <span className="mt-1 block text-[11px] text-white/45">Falta{nextShow.songs.length - ready === 1 ? "" : "m"} {nextShow.songs.length - ready} música{nextShow.songs.length - ready === 1 ? '' : 's'} ficar{nextShow.songs.length - ready === 1 ? '' : 'em'} pronta{nextShow.songs.length - ready === 1 ? '' : 's'}</span>}
        </button>
      )}
      <AchievementsSheet open={achOpen} onClose={() => setAchOpen(false)} />

      {/* modo teste: as 4 músicas liberadas, com tudo funcionando */}
      {demo.length > 0 && (
        <div className="relative mt-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[hsl(var(--primary))]">Liberadas no seu teste · com cifra, letra e Modo Palco</p>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {demo.map(t => (
              <button key={t.id} onClick={() => { tap(10); void audioEngine.unlock(); navigate('/app/player'); void usePlayerStore.getState().loadTrack(t, { autoplay: true }) }}
                className="min-w-0 text-left active:scale-95 transition-transform">
                <CoverImg track={t} className="aspect-square w-full rounded-xl object-cover" />
                <span className="mt-1 block truncate text-[11px] font-bold">{t.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* toque agora */}
      {featured && (
        <button onClick={playFeatured} className="relative mt-3.5 w-full flex items-center gap-3 rounded-2xl bg-white/[0.06] border border-white/[0.07] p-2.5 pr-3 text-left active:scale-[0.99] transition-transform">
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl">
            <CoverImg track={featured} className="h-full w-full object-cover" />
            {featuredPlaying && (
              <span className="absolute inset-0 flex items-end justify-center gap-[3px] bg-black/45 pb-2">
                <span className="eq-bar w-1" /><span className="eq-bar w-1" style={{ animationDuration: '0.7s' }} /><span className="eq-bar w-1" style={{ animationDuration: '0.5s' }} />
              </span>
            )}
          </div>
          <span className="flex-1 min-w-0">
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--primary))]">
              <Music2 className="h-3 w-3" /> {isContinue ? 'Continuar tocando' : 'Música do dia'}
            </span>
            <span className="block truncate text-[16px] font-bold">{featured.title}</span>
            <span className="block truncate text-[12px] text-white/55">{featured.artist}</span>
          </span>
          <span className="h-12 w-12 shrink-0 rounded-full bg-[hsl(var(--primary))] flex items-center justify-center shadow-lg shadow-[hsl(var(--primary))]/30">
            {featuredPlaying ? <Pause className="h-5 w-5 fill-black text-black" /> : <Play className="h-5 w-5 fill-black text-black ml-0.5" />}
          </span>
        </button>
      )}
    </section>
  )
}

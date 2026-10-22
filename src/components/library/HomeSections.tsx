import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Play, Plus, ListMusic } from 'lucide-react'
import { toast } from 'sonner'
import { TrackCard } from './TrackCard'
import { usePrefsStore } from '@/store/prefsStore'
import { useShowsStore, songFromTrack } from '@/store/showsStore'
import { useCatalogStore } from '@/store/catalogStore'
import { getArtistScore } from '@/lib/featuredArtists'
import { loadRepertorios, type Repertorio } from '@/pages/Shows'
import type { Track } from '@/types/track'

interface Props {
  tracks: Track[]
  byId: Map<string, Track>
  onSeeGenre: (genre: string) => void
  onSeeAll: () => void
}

function Row({ title, action, children }: { title: string; action?: { label: string; onClick: () => void }; children: React.ReactNode }) {
  return (
    <section className="mt-6 first:mt-2">
      <div className="flex items-end justify-between mb-2.5">
        <h2 className="text-[19px] font-bold leading-tight">{title}</h2>
        {action && (
          <button onClick={action.onClick} className="flex items-center text-[13px] font-semibold text-[#a8a8a8] active:text-white shrink-0 pl-3">
            {action.label}<ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4 md:-mx-6 md:px-6 snap-x snap-mandatory pb-1">{children}</div>
    </section>
  )
}

const Cell = ({ children }: { children: React.ReactNode }) => <div className="w-[148px] md:w-[172px] shrink-0 snap-start">{children}</div>

/** Tela inicial: o que o músico mais usa logo de cara, sem precisar procurar */
export function HomeSections({ tracks, byId, onSeeGenre, onSeeAll }: Props) {
  const navigate = useNavigate()
  const recent = usePrefsStore(s => s.recent)
  const shows = useShowsStore(s => s.shows)
  const createShow = useShowsStore(s => s.createShow)
  const setActive = useShowsStore(s => s.setActive)
  const genres = useCatalogStore(s => s.genres)
  const [reps, setReps] = useState<Repertorio[]>([])
  useEffect(() => { void loadRepertorios().then(setReps) }, [])

  const recentTracks = useMemo(() => recent.map(id => byId.get(id)).filter(Boolean).slice(0, 12) as Track[], [recent, byId])
  const rows = useMemo(() => {
    const by: Record<string, Track[]> = {}
    for (const t of tracks) {
      for (const tag of t.tags || []) (by[tag] ||= []).push(t)
    }
    const top = (list: Track[]) => [...list].sort((a, b) => getArtistScore(b.artist) - getArtistScore(a.artist) || a.title.localeCompare(b.title)).slice(0, 14)
    return genres.filter(g => by[g.id]?.length).map(g => ({ id: g.id, label: g.label, count: g.count, items: top(by[g.id]) }))
  }, [tracks, genres])

  const greeting = (() => { const h = new Date().getHours(); return h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite' })()

  const fromTemplate = (r: Repertorio) => {
    const list = r.trackIds.map(id => byId.get(id)).filter(Boolean) as Track[]
    if (!list.length) return
    const id = createShow(r.name, list.map(songFromTrack), r.id)
    toast.success('Repertório copiado para os seus shows')
    navigate(`/app/shows/${id}`)
  }

  return (
    <div className="pb-6">
      <h1 className="text-2xl font-black mt-1">{greeting} 👋</h1>
      <p className="text-[13px] text-[#9a9a9a]">O que vamos tocar hoje?</p>

      {recentTracks.length > 0 && (
        <Row title="Continue de onde parou">
          {recentTracks.map(t => <Cell key={t.id}><TrackCard track={t} view="grid" /></Cell>)}
        </Row>
      )}

      <Row title="Seus shows" action={{ label: 'Ver todos', onClick: () => navigate('/app/shows') }}>
        <Cell>
          <button onClick={() => navigate('/app/shows', { state: { create: true } })}
            className="w-full aspect-square rounded-xl border border-dashed border-white/20 flex flex-col items-center justify-center gap-2 text-[#cfcfcf] active:bg-white/5">
            <Plus className="h-7 w-7" /><span className="text-sm font-semibold">Novo show</span>
          </button>
        </Cell>
        {shows.slice(0, 8).map(sh => (
          <Cell key={sh.id}>
            <div className="w-full aspect-square rounded-xl bg-gradient-to-br from-[#1f4a35] to-[#141414] p-3 flex flex-col justify-between">
              <button onClick={() => navigate(`/app/shows/${sh.id}`)} className="text-left">
                <ListMusic className="h-6 w-6 text-[hsl(var(--primary))]" />
                <p className="mt-2 font-bold leading-tight line-clamp-3">{sh.name}</p>
                <p className="text-[11px] text-white/50 mt-0.5">{sh.songs.length} música{sh.songs.length === 1 ? '' : 's'}</p>
              </button>
              <button disabled={!sh.songs.length} onClick={() => { setActive(sh.id); navigate('/app/performance') }}
                className="self-end h-10 w-10 rounded-full bg-[hsl(var(--primary))] flex items-center justify-center disabled:opacity-30" aria-label={`Tocar ${sh.name} no palco`}>
                <Play className="h-5 w-5 fill-black text-black ml-0.5" />
              </button>
            </div>
          </Cell>
        ))}
      </Row>

      {reps.length > 0 && (
        <Row title="Repertórios prontos" action={{ label: 'Ver todos', onClick: () => navigate('/app/shows') }}>
          {reps.map(r => (
            <Cell key={r.id}>
              <button onClick={() => fromTemplate(r)} className="w-full aspect-square rounded-xl bg-gradient-to-br from-[#3a2a12] to-[#141414] p-3 text-left flex flex-col justify-between active:opacity-80">
                <span className="text-3xl leading-none">{r.icon}</span>
                <span>
                  <span className="block font-bold leading-tight">{r.name}</span>
                  <span className="block text-[11px] text-white/50 mt-0.5">{r.trackIds.length} músicas</span>
                </span>
              </button>
            </Cell>
          ))}
        </Row>
      )}

      {rows.map(r => (
        <Row key={r.id} title={r.label} action={{ label: `Ver ${r.count}`, onClick: () => onSeeGenre(r.id) }}>
          {r.items.map(t => <Cell key={t.id}><TrackCard track={t} view="grid" /></Cell>)}
        </Row>
      ))}

      <button onClick={onSeeAll} className="mt-8 w-full h-12 rounded-full bg-white/[0.07] font-semibold">
        Ver toda a biblioteca ({tracks.length.toLocaleString('pt-BR')} músicas)
      </button>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Play, ListMusic, ChevronRight, Copy, Trash2, Sparkles, CalendarDays, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { useShowsStore, songFromTrack, type Show } from '@/store/showsStore'
import { useAllTracks } from '@/hooks/useAllTracks'
import { Sheet } from '@/components/ui/sheet'
import { formatDuration } from '@/lib/showUtils'

export interface Repertorio { id: string; name: string; desc: string; style: string; icon: string; trackIds: string[]; moments?: string[] | null }

let _reps: Promise<Repertorio[]> | null = null
export function loadRepertorios(): Promise<Repertorio[]> {
  if (!_reps) _reps = fetch('/repertorios.json').then(r => (r.ok ? r.json() : [])).catch(() => { _reps = null; return [] })
  return _reps
}

export default function Shows() {
  const navigate = useNavigate()
  const shows = useShowsStore(s => s.shows)
  const createShow = useShowsStore(s => s.createShow)
  const duplicateShow = useShowsStore(s => s.duplicateShow)
  const deleteShow = useShowsStore(s => s.deleteShow)
  const setActive = useShowsStore(s => s.setActive)
  const { byId } = useAllTracks()
  const [reps, setReps] = useState<Repertorio[]>([])
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [menuFor, setMenuFor] = useState<Show | null>(null)

  useEffect(() => { void loadRepertorios().then(setReps) }, [])

  const duration = (sh: Show) => sh.songs.reduce((n, s) => n + (byId.get(s.trackId)?.durationSeconds || 0), 0)

  const create = () => {
    const id = createShow(name || 'Novo show')
    setCreating(false); setName('')
    navigate(`/app/shows/${id}`, { state: { addSongs: true } })
  }

  const applyTemplate = (r: Repertorio, play = false) => {
    const tracks = r.trackIds.map(id => byId.get(id)).filter(Boolean) as NonNullable<ReturnType<typeof byId.get>>[]
    if (!tracks.length) { toast.error('Biblioteca ainda carregando. Tente em instantes.'); return }
    const id = createShow(r.name, tracks.map(songFromTrack), r.id)
    if (play) { setActive(id); navigate('/app/performance') }
    else { navigate(`/app/shows/${id}`); toast.success('Repertório copiado para os seus shows. Ajuste como quiser.') }
  }

  const sorted = useMemo(() => [...shows].sort((a, b) => b.updatedAt - a.updatedAt), [shows])

  return (
    <div className="px-4 md:px-8 py-5 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Seus shows</h1>
          <p className="text-[13px] text-[#9a9a9a]">Monte o repertório, ajuste cada música e toque no palco.</p>
        </div>
        <button onClick={() => setCreating(true)} className="h-11 px-4 rounded-full bg-[hsl(var(--primary))] text-black font-bold flex items-center gap-1.5 shrink-0">
          <Plus className="h-5 w-5" /> Novo
        </button>
      </div>

      {sorted.length === 0 && (
        <div className="mt-6 rounded-2xl bg-gradient-to-br from-[hsl(var(--primary))]/20 to-white/[0.03] p-5">
          <ListMusic className="h-8 w-8 text-[hsl(var(--primary))]" />
          <h2 className="mt-2 text-lg font-bold">Seu primeiro show em 1 minuto</h2>
          <ol className="mt-2 space-y-1 text-sm text-[#d0d0d0] list-decimal list-inside">
            <li>Crie um show ou comece por um repertório pronto abaixo</li>
            <li>Ajuste tom e mixer de cada música (fica salvo)</li>
            <li>Toque <b>Iniciar show</b>: o app passa de uma música para a outra</li>
          </ol>
          <button onClick={() => setCreating(true)} className="mt-4 h-11 px-5 rounded-full bg-white text-black font-bold">Criar meu show</button>
        </div>
      )}

      <div className="mt-5 space-y-2.5">
        {sorted.map(sh => {
          const d = duration(sh)
          return (
            <div key={sh.id} className="flex items-stretch rounded-2xl bg-white/[0.05] overflow-hidden">
              <button onClick={() => navigate(`/app/shows/${sh.id}`)} onContextMenu={e => { e.preventDefault(); setMenuFor(sh) }}
                className="flex-1 min-w-0 text-left px-4 py-3.5 active:bg-white/10">
                <p className="font-bold text-[16px] truncate">{sh.name}</p>
                <p className="mt-0.5 text-xs text-[#9a9a9a] flex flex-wrap gap-x-3 gap-y-0.5">
                  <span>{sh.songs.length} música{sh.songs.length === 1 ? '' : 's'}{d ? ` · ${formatDuration(d)}` : ''}</span>
                  {sh.date && <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{new Date(sh.date + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span>}
                  {sh.venue && <span className="flex items-center gap-1 truncate"><MapPin className="h-3 w-3" />{sh.venue}</span>}
                </p>
              </button>
              <button onClick={() => setMenuFor(sh)} aria-label="Opções do show" className="px-2 text-[#9a9a9a] active:bg-white/10"><ChevronRight className="h-5 w-5 rotate-90" /></button>
              <button disabled={!sh.songs.length} onClick={() => { setActive(sh.id); navigate('/app/performance') }}
                aria-label={`Tocar ${sh.name} no palco`}
                className="w-16 flex flex-col items-center justify-center gap-0.5 bg-[hsl(var(--primary))]/15 text-[hsl(var(--primary))] font-bold text-[10px] disabled:opacity-30 active:bg-[hsl(var(--primary))]/30">
                <Play className="h-6 w-6 fill-current" /> PALCO
              </button>
            </div>
          )
        })}
      </div>

      {reps.length > 0 && (
        <section className="mt-8">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-400" />
            <h2 className="text-lg font-bold">Repertórios prontos</h2>
          </div>
          <p className="text-[13px] text-[#9a9a9a]">Montados com músicas do app, na ordem que funciona no palco. Use como base e ajuste.</p>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {reps.map(r => (
              <div key={r.id} className="rounded-2xl bg-white/[0.05] p-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl leading-none">{r.icon}</span>
                  <div className="min-w-0">
                    <p className="font-bold leading-tight">{r.name}</p>
                    <p className="mt-0.5 text-xs text-[#9a9a9a]">{r.desc}</p>
                    <p className="mt-1 text-[11px] text-[#7a7a7a]">{r.trackIds.length} músicas · {r.style}</p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => applyTemplate(r)} className="flex-1 h-10 rounded-full bg-white/10 text-sm font-semibold">Usar e ajustar</button>
                  <button onClick={() => applyTemplate(r, true)} className="h-10 px-4 rounded-full bg-[hsl(var(--primary))] text-black text-sm font-bold flex items-center gap-1"><Play className="h-4 w-4 fill-current" /> Tocar</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <Sheet open={creating} onClose={() => setCreating(false)} title="Novo show">
        <form className="p-4 space-y-3" onSubmit={e => { e.preventDefault(); create() }} style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}>
          <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Bar do Zé, sábado"
            className="w-full h-12 rounded-xl bg-white/[0.07] px-3 text-base outline-none placeholder:text-[#7a7a7a]" />
          <button type="submit" className="w-full h-12 rounded-full bg-[hsl(var(--primary))] text-black font-bold">Criar e escolher músicas</button>
        </form>
      </Sheet>

      <Sheet open={!!menuFor} onClose={() => setMenuFor(null)} title={menuFor?.name}>
        {menuFor && (
          <div className="p-2" style={{ paddingBottom: 'calc(8px + env(safe-area-inset-bottom, 0px))' }}>
            <button onClick={() => { const id = duplicateShow(menuFor.id); setMenuFor(null); if (id) toast.success('Show duplicado') }}
              className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl active:bg-white/10"><Copy className="h-5 w-5" /> Duplicar show</button>
            <button onClick={() => { if (confirm(`Apagar o show "${menuFor.name}"?`)) { deleteShow(menuFor.id); setMenuFor(null); toast('Show apagado') } }}
              className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl text-red-400 active:bg-white/10"><Trash2 className="h-5 w-5" /> Apagar show</button>
          </div>
        )}
      </Sheet>
    </div>
  )
}

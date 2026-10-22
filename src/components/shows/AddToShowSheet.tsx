import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, ListMusic, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Sheet } from '@/components/ui/sheet'
import { useShowsStore } from '@/store/showsStore'
import type { Track } from '@/types/track'

interface Props {
  track: Track | null
  onClose: () => void
}

/** "Adicionar ao show": escolhe um show existente ou cria um novo na hora */
export function AddToShowSheet({ track, onClose }: Props) {
  const shows = useShowsStore(s => s.shows)
  const addSongs = useShowsStore(s => s.addSongs)
  const createShow = useShowsStore(s => s.createShow)
  const navigate = useNavigate()
  const [newName, setNewName] = useState('')

  if (!track) return null

  const addTo = (id: string, name: string) => {
    const n = addSongs(id, [track])
    onClose()
    toast.success(n ? `Adicionada em "${name}"` : `Já estava em "${name}"`, {
      action: { label: 'Ver show', onClick: () => navigate(`/app/shows/${id}`) },
    })
  }

  const createAndAdd = () => {
    const name = newName.trim() || 'Novo show'
    const id = createShow(name)
    addSongs(id, [track])
    onClose()
    toast.success(`Show "${name}" criado com "${track.title}"`, {
      action: { label: 'Ver show', onClick: () => navigate(`/app/shows/${id}`) },
    })
  }

  return (
    <Sheet open={!!track} onClose={onClose} title={<span>Adicionar ao show<span className="block text-xs font-normal text-[#8a8a8a] truncate">{track.title} · {track.artist}</span></span>}>
      <div className="p-4 space-y-2" style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}>
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); createAndAdd() }}>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nome do novo show (ex.: Bar do Zé, sábado)"
            className="flex-1 h-11 rounded-xl bg-white/[0.07] px-3 text-[15px] outline-none placeholder:text-[#7a7a7a]" />
          <button type="submit" className="h-11 px-4 rounded-xl bg-[hsl(var(--primary))] text-black font-bold flex items-center gap-1"><Plus className="h-4 w-4" /> Criar</button>
        </form>
        {shows.length > 0 && <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-[#8a8a8a]">Seus shows</p>}
        {shows.map(sh => {
          const already = sh.songs.some(s => s.trackId === track.id)
          return (
            <button key={sh.id} onClick={() => addTo(sh.id, sh.name)}
              className="w-full flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-3 text-left active:bg-white/10">
              <ListMusic className="h-5 w-5 text-[hsl(var(--primary))] shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block font-semibold truncate">{sh.name}</span>
                <span className="block text-xs text-[#8a8a8a]">{sh.songs.length} música{sh.songs.length === 1 ? '' : 's'}{sh.date ? ` · ${new Date(sh.date + 'T12:00').toLocaleDateString('pt-BR')}` : ''}</span>
              </span>
              {already && <Check className="h-4 w-4 text-[#8a8a8a]" />}
            </button>
          )
        })}
      </div>
    </Sheet>
  )
}

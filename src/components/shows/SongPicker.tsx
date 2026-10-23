import { useMemo, useState, useRef, useEffect } from 'react'
import { Search, Check, Plus, Heart, Layers, Music, Upload } from 'lucide-react'
import { Sheet } from '@/components/ui/sheet'
import { useAllTracks, isMedley } from '@/hooks/useAllTracks'
import { useFavoritesStore } from '@/store/favoritesStore'
import { matchesSearch, cn } from '@/lib/utils'
import { CoverImg } from './CoverImg'
import type { Track } from '@/types/track'

type Tab = 'todas' | 'favoritas' | 'blocos' | 'minhas'

interface Props {
  open: boolean
  onClose: () => void
  /** ids que já estão no show (aparecem marcados) */
  existing: string[]
  onAdd: (tracks: Track[]) => void
  title?: string
}

const PAGE = 60

/** Escolher várias músicas de uma vez para o show (busca, favoritas e blocos prontos) */
export function SongPicker({ open, onClose, existing, onAdd, title = 'Adicionar músicas' }: Props) {
  const { all, loading } = useAllTracks()
  const favIds = useFavoritesStore(s => s.ids)
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<Tab>('todas')
  const [picked, setPicked] = useState<Track[]>([])
  const [limit, setLimit] = useState(PAGE)
  const inputRef = useRef<HTMLInputElement>(null)
  const have = useMemo(() => new Set(existing), [existing])

  useEffect(() => { if (open) { setPicked([]); setQ(''); setLimit(PAGE); setTimeout(() => inputRef.current?.focus(), 150) } }, [open])
  useEffect(() => setLimit(PAGE), [q, tab])

  const list = useMemo(() => {
    let l = all
    if (tab === 'favoritas') { const f = new Set(favIds); l = l.filter(t => f.has(t.id)) }
    if (tab === 'blocos') l = l.filter(isMedley)
    if (tab === 'minhas') l = l.filter(t => t.id.startsWith('local-'))
    if (q.trim()) l = l.filter(t => matchesSearch(q, [t.title, t.artist, t.genreLabel]))
    return l
  }, [all, tab, favIds, q])

  const pickedIds = new Set(picked.map(t => t.id))
  const toggle = (t: Track) => setPicked(p => (p.some(x => x.id === t.id) ? p.filter(x => x.id !== t.id) : [...p, t]))
  const done = () => { if (picked.length) onAdd(picked); onClose() }

  return (
    <Sheet open={open} onClose={onClose} variant="full" title={title}
      footer={
        <button onClick={done} className={cn('w-full h-12 rounded-full text-base font-bold transition-colors',
          picked.length ? 'bg-[hsl(var(--primary))] text-black' : 'bg-white/10 text-white')}>
          {picked.length ? `Adicionar ${picked.length} música${picked.length > 1 ? 's' : ''}` : 'Fechar'}
        </button>
      }>
      <div className="sticky top-0 z-10 bg-[#161616] px-4 pt-3 pb-2 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#808080]" />
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar música ou artista"
            className="w-full h-11 rounded-xl bg-white/[0.07] pl-10 pr-3 text-[15px] outline-none placeholder:text-[#7a7a7a] focus:ring-1 focus:ring-white/20" />
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {([['todas', 'Todas', Music], ['minhas', 'Minhas', Upload], ['favoritas', 'Favoritas', Heart], ['blocos', 'Blocos', Layers]] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)}
              className={cn('h-9 px-3 rounded-full text-[13px] font-semibold flex items-center gap-1.5', tab === id ? 'bg-white text-black' : 'bg-white/[0.07] text-[#cfcfcf]')}>
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="px-4 py-8 text-center text-sm text-[#8a8a8a]">Carregando biblioteca...</p>}
      {!loading && list.length === 0 && (
        <p className="px-6 py-10 text-center text-sm text-[#8a8a8a]">
          {tab === 'favoritas' ? 'Você ainda não favoritou músicas. Toque no ♥ na biblioteca.' : 'Nada encontrado. Tente outro nome.'}
        </p>
      )}

      <ul className="pb-4">
        {list.slice(0, limit).map(t => {
          const inShow = have.has(t.id)
          const sel = pickedIds.has(t.id)
          return (
            <li key={t.id}>
              <button disabled={inShow} onClick={() => toggle(t)}
                className={cn('w-full flex items-center gap-3 px-4 py-2.5 text-left active:bg-white/10', sel && 'bg-[hsl(var(--primary))]/10')}>
                <CoverImg track={t} className="h-11 w-11 rounded-md" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium truncate">{t.title}</span>
                  <span className="block text-xs text-[#8a8a8a] truncate">{t.artist}{t.version ? ` · ${t.version}` : ''}{t.keyNote ? ` · Tom ${t.keyNote}` : ''}</span>
                </span>
                {inShow ? (
                  <span className="text-[11px] font-semibold text-[#8a8a8a] shrink-0">No show</span>
                ) : (
                  <span className={cn('h-8 w-8 rounded-full flex items-center justify-center shrink-0', sel ? 'bg-[hsl(var(--primary))] text-black' : 'bg-white/10')}>
                    {sel ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
      {list.length > limit && (
        <div className="px-4 pb-6">
          <button onClick={() => setLimit(l => l + PAGE)} className="w-full h-11 rounded-full bg-white/[0.07] text-sm font-semibold">
            Mostrar mais ({list.length - limit})
          </button>
        </div>
      )}
    </Sheet>
  )
}

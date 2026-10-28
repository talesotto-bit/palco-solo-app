import { useEffect, useMemo, useRef, useState } from 'react'
import { songArtist } from '@/lib/lyricsMatch'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, GripVertical, Plus, Play, Trash2, StickyNote, ArrowUp, ArrowDown, SlidersHorizontal, WifiOff, CheckCircle2, Loader2, CalendarDays, MapPin, Users, Scissors } from 'lucide-react'
import { useProgressStore, songStatus, STATUS_INFO } from '@/store/progressStore'
import { toast } from 'sonner'
import { useShowsStore } from '@/store/showsStore'
import { usePlayerStore } from '@/store/playerStore'
import { useTrackSettingsStore } from '@/store/trackSettingsStore'
import { useAllTracks } from '@/hooks/useAllTracks'
import { audioEngine } from '@/audio/AudioEngine'
import { Sheet } from '@/components/ui/sheet'
import { SongPicker } from '@/components/shows/SongPicker'
import { CoverImg } from '@/components/shows/CoverImg'
import { formatTons } from '@/lib/musicTheory'
import { prefetchLyrics } from '@/store/lyricsStore'
import { prefetchCifra } from '@/store/cifraStore'
import { formatDuration, isTrackOffline, trackAudioUrls } from '@/lib/showUtils'
import { buildSharedShow, encodeShow, showAsText } from '@/lib/shareShow'
import { cn, formatTime } from '@/lib/utils'
import type { Track } from '@/types/track'

const ROW_H = 64

/** "1:05" → 65 s; vazio → undefined */
function parseTime(v: string): number | undefined {
  const t = v.trim()
  if (!t) return undefined
  const m = t.match(/^(\d+)(?::(\d{1,2}))?$/)
  if (!m) return undefined
  return m[2] !== undefined ? Number(m[1]) * 60 + Number(m[2]) : Number(m[1])
}

export default function ShowEditor() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const show = useShowsStore(s => s.shows.find(x => x.id === id))
  const { updateShow, addSongs, removeSong, moveSong, setNote, setRange, setActive } = useShowsStore.getState()
  const progress = useProgressStore(s => s.songs)
  const [rangeIdx, setRangeIdx] = useState<number | null>(null)
  const [rangeDraft, setRangeDraft] = useState({ start: '', end: '' })
  const settings = useTrackSettingsStore(s => s.settings)
  const { byId, loading } = useAllTracks()
  const [picker, setPicker] = useState(false)
  const [menu, setMenu] = useState<number | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [editingNote, setEditingNote] = useState<number | null>(null)
  const [offline, setOffline] = useState<{ done: number; total: number } | null>(null)
  const [, force] = useState(0)

  useEffect(() => {
    if ((location.state as any)?.addSongs) { setPicker(true); navigate(location.pathname, { replace: true, state: null }) }
  }, [location, navigate])

  // ── arrastar para reordenar (dedo ou mouse) ──
  const drag = useRef<{ from: number; startY: number; pointerId: number } | null>(null)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragDy, setDragDy] = useState(0)
  const onHandleDown = (i: number) => (e: React.PointerEvent) => {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { from: i, startY: e.clientY, pointerId: e.pointerId }
    setDragIdx(i); setDragDy(0)
    try { navigator.vibrate?.(10) } catch {}
  }
  const onHandleMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || !show) return
    const dy = e.clientY - d.startY
    const steps = Math.round(dy / ROW_H)
    const to = Math.max(0, Math.min(show.songs.length - 1, d.from + steps))
    if (to !== d.from) {
      moveSong(id, d.from, to)
      d.startY += (to - d.from) * ROW_H
      d.from = to
      setDragIdx(to)
      setDragDy(e.clientY - d.startY)
    } else setDragDy(dy)
  }
  const onHandleUp = () => { drag.current = null; setDragIdx(null); setDragDy(0) }

  const tracks = useMemo(() => (show?.songs || []).map(s => byId.get(s.trackId)), [show?.songs, byId])
  const totalDur = tracks.reduce((n, t) => n + (t?.durationSeconds || 0), 0)
  const offlineCount = tracks.filter(t => t && isTrackOffline(t)).length

  if (!show) {
    return (
      <div className="p-6 text-center">
        <p className="text-[#9a9a9a]">Show não encontrado.</p>
        <button onClick={() => navigate('/app/shows')} className="mt-3 h-10 px-4 rounded-full bg-white/10 font-semibold">Ver meus shows</button>
      </div>
    )
  }

  const start = (index = 0) => {
    setActive(show.id)
    navigate('/app/performance', { state: { startIndex: index } })
  }

  const openInPlayer = async (t: Track) => {
    const avail = show.songs.map(s => byId.get(s.trackId)).filter(Boolean) as Track[]
    const idx = avail.findIndex(x => x.id === t.id)
    navigate('/app/player')
    await usePlayerStore.getState().setQueue(avail, Math.max(0, idx))
  }

  const prepareOffline = async () => {
    const all = tracks.filter((t): t is Track => !!t)
    const list = all.filter(t => !isTrackOffline(t))
    // letras e cifras também ficam no aparelho (no palco sem sinal o músico precisa delas)
    const texts = (async () => {
      let ok = 0
      for (const t of all) {
        const [a, b] = await Promise.all([
          prefetchLyrics(songArtist(t), t.title, t.id, t.lrclibId, t.durationSeconds, t.lyricsUrl),
          t.genre === 'importado' ? Promise.resolve(true) : prefetchCifra(t.id, songArtist(t), t.title),
        ])
        if (a && b) ok++
      }
      return ok
    })()
    const urls = list.flatMap(trackAudioUrls)
    setOffline({ done: 0, total: urls.length })
    const ok = urls.length ? await audioEngine.prefetch(urls, (done, total) => setOffline({ done, total })) : 0
    const textOk = await texts
    setOffline(null); force(x => x + 1)
    if (ok === urls.length && textOk === all.length) toast.success('Pronto! Músicas, letras e cifras deste show funcionam sem internet.')
    else if (ok < urls.length) toast.warning(`${urls.length - ok} arquivo(s) não baixaram. Tente de novo com uma conexão melhor.`)
    else toast.warning('O som já está no aparelho, mas algumas letras/cifras não baixaram. Toque de novo com internet.')
  }

  const shareWithBand = async () => {
    const data = buildSharedShow(show, byId, settings)
    const url = `${window.location.origin}/s#${await encodeShow(data)}`
    const text = `${showAsText(data)}

Abra com tom e cifras: ${url}`
    try {
      if (navigator.share) { await navigator.share({ title: show.name, text: `🎤 Setlist "${show.name}" (${show.songs.length} músicas)`, url }); return }
    } catch (e: any) { if (e?.name === 'AbortError') return }
    try { await navigator.clipboard.writeText(text); toast.success('Setlist copiado! Cole no grupo da banda.') } catch { window.open(url, '_blank') }
  }

  const menuSong = menu !== null ? show.songs[menu] : null
  const menuTrack = menuSong ? byId.get(menuSong.trackId) : undefined

  return (
    <div className="max-w-3xl mx-auto pb-28">
      {/* Cabeçalho */}
      <div className="sticky top-0 z-20 bg-[#1a1a1a]/95 backdrop-blur px-3 pt-3 pb-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/app/shows')} aria-label="Voltar" className="h-10 w-10 flex items-center justify-center rounded-full active:bg-white/10"><ArrowLeft className="h-5 w-5" /></button>
          <input value={show.name} onChange={e => updateShow(id, { name: e.target.value })} aria-label="Nome do show"
            className="flex-1 min-w-0 bg-transparent text-xl font-bold outline-none focus:bg-white/5 rounded-lg px-1 py-1" />
        </div>
        <div className="mt-1 flex gap-2 pl-12 pr-1">
          <label className="flex items-center gap-1.5 h-9 rounded-lg bg-white/[0.06] px-2 text-xs text-[#cfcfcf] min-w-0">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
            <input type="date" value={show.date || ''} onChange={e => updateShow(id, { date: e.target.value || undefined })} className="bg-transparent outline-none w-[112px] [color-scheme:dark]" />
          </label>
          <label className="flex flex-1 items-center gap-1.5 h-9 rounded-lg bg-white/[0.06] px-2 text-xs text-[#cfcfcf] min-w-0">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <input value={show.venue || ''} onChange={e => updateShow(id, { venue: e.target.value || undefined })} placeholder="Local" className="bg-transparent outline-none flex-1 min-w-0 placeholder:text-[#6a6a6a]" />
          </label>
        </div>
        <div className="mt-2 pl-12 text-xs text-[#9a9a9a] flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>{show.songs.length} música{show.songs.length === 1 ? '' : 's'}{totalDur ? ` · ${formatDuration(totalDur)}` : ''}</span>
          {show.songs.length > 0 && (() => {
            const ready = show.songs.filter(x => songStatus(progress[x.trackId]) === 'pronta').length
            return <span className={cn('font-semibold', ready === show.songs.length ? 'text-[hsl(var(--primary))]' : 'text-amber-300')}>✅ {ready} de {show.songs.length} prontas</span>
          })()}
          {show.songs.length > 0 && <button onClick={() => void shareWithBand()} className="flex items-center gap-1 text-[hsl(var(--primary))] font-semibold"><Users className="h-3.5 w-3.5" /> Compartilhar com a banda</button>}
          {show.songs.length > 0 && (offlineCount === show.songs.length
            ? <span className="flex items-center gap-1 text-[hsl(var(--primary))]"><CheckCircle2 className="h-3.5 w-3.5" /> Toca sem internet</span>
            : offline
              ? <span className="flex items-center gap-1"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Baixando {offline.done}/{offline.total}</span>
              : <button onClick={prepareOffline} className="flex items-center gap-1 text-amber-400 font-semibold"><WifiOff className="h-3.5 w-3.5" /> Preparar para tocar sem internet</button>)}
        </div>
      </div>

      {/* Músicas */}
      {show.songs.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <p className="text-[#9a9a9a]">Nenhuma música ainda.</p>
          <button onClick={() => setPicker(true)} className="mt-3 h-12 px-6 rounded-full bg-[hsl(var(--primary))] text-black font-bold inline-flex items-center gap-2"><Plus className="h-5 w-5" /> Adicionar músicas</button>
        </div>
      ) : (
        <ul className="px-2 pt-2 select-none">
          {show.songs.map((s, i) => {
            const t = byId.get(s.trackId)
            const st = settings[s.trackId]
            const dragging = dragIdx === i
            return (
              <li key={s.trackId} style={{ height: ROW_H, transform: dragging ? `translateY(${dragDy}px)` : undefined, zIndex: dragging ? 10 : undefined }}
                className={cn('relative flex items-center gap-2 rounded-xl pr-1', dragging ? 'bg-[#2a2a2a] shadow-xl' : 'active:bg-white/5')}>
                <span
                  onPointerDown={onHandleDown(i)} onPointerMove={onHandleMove} onPointerUp={onHandleUp} onPointerCancel={onHandleUp}
                  style={{ touchAction: 'none' }} aria-label="Arrastar para mudar a ordem"
                  className="h-full w-10 flex items-center justify-center text-[#6a6a6a] cursor-grab active:cursor-grabbing shrink-0">
                  <GripVertical className="h-5 w-5" />
                </span>
                <span className="w-5 text-center text-xs font-bold text-[#7a7a7a] tabular-nums shrink-0">{i + 1}</span>
                <button onClick={() => setMenu(i)} className="flex-1 min-w-0 flex items-center gap-3 text-left h-full">
                  <CoverImg artist={s.artist} title={s.title} coverUrl={s.coverUrl} className="h-11 w-11 rounded-md" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium truncate">{s.title}</span>
                    <span className="block text-xs text-[#8a8a8a] truncate">
                      {s.artist}
                      {st && Math.round(st.pitch) !== 0 && <span className="text-[hsl(var(--primary))]"> · {formatTons(Math.round(st.pitch))}</span>}
                      {st && st.speed !== 1 && <span className="text-amber-400"> · {Math.round(st.speed * 100)}%</span>}
                      {!t && !loading && <span className="text-red-400"> · indisponível</span>}
                      {(() => { const ss = songStatus(progress[s.trackId]); return ss ? <span title={STATUS_INFO[ss].label}> · {STATUS_INFO[ss].emoji}</span> : null })()}
                    </span>
                    {(s.note || s.start || s.end) && (
                      <span className="block text-[11px] text-amber-300/90 truncate">
                        {(s.start || s.end) && <span className="text-sky-300">✂️ {formatTime(s.start || 0)}–{s.end ? formatTime(s.end) : 'fim'}{s.note ? ' · ' : ''}</span>}
                        {s.note && `📝 ${s.note}`}
                      </span>
                    )}
                  </span>
                </button>
                <button onClick={() => start(i)} aria-label={`Começar o show por ${s.title}`} disabled={!t}
                  className="h-10 w-10 flex items-center justify-center rounded-full text-[#bdbdbd] active:bg-white/10 disabled:opacity-30 shrink-0">
                  <Play className="h-4 w-4 fill-current" />
                </button>
              </li>
            )
          })}
          <li className="pt-2 px-2">
            <button onClick={() => setPicker(true)} className="w-full h-12 rounded-xl border border-dashed border-white/15 text-[#cfcfcf] font-semibold flex items-center justify-center gap-2 active:bg-white/5">
              <Plus className="h-5 w-5" /> Adicionar músicas
            </button>
          </li>
        </ul>
      )}

      {/* Botão principal fixo */}
      {show.songs.length > 0 && (
        <div className="fixed left-0 right-0 md:left-auto md:right-8 md:w-[420px] z-30 px-4" style={{ bottom: 'calc(62px + env(safe-area-inset-bottom, 0px))' }}>
          <button onClick={() => start(0)} className="w-full h-14 rounded-full bg-[hsl(var(--primary))] text-black text-lg font-bold shadow-[0_10px_30px_rgba(0,0,0,.5)] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
            <Play className="h-6 w-6 fill-current" /> Iniciar show no palco
          </button>
        </div>
      )}

      <SongPicker open={picker} onClose={() => setPicker(false)} existing={show.songs.map(s => s.trackId)}
        onAdd={ts => { const n = addSongs(id, ts); toast.success(`${n} música${n === 1 ? '' : 's'} adicionada${n === 1 ? '' : 's'}`) }} />

      {/* Opções da música */}
      <Sheet open={menu !== null && editingNote === null} onClose={() => setMenu(null)} title={menuSong ? <span>{menuSong.title}<span className="block text-xs font-normal text-[#8a8a8a]">{menuSong.artist}</span></span> : ''}>
        {menuSong && menu !== null && (
          <div className="p-2" style={{ paddingBottom: 'calc(8px + env(safe-area-inset-bottom, 0px))' }}>
            {menuTrack && <MenuItem icon={Play} label="Começar o show por esta música" onClick={() => { setMenu(null); start(menu) }} />}
            {menuTrack && <MenuItem icon={SlidersHorizontal} label="Ajustar tom, velocidade e mixer" hint="Fica salvo e o palco usa do mesmo jeito" onClick={() => { setMenu(null); void openInPlayer(menuTrack) }} />}
            <MenuItem icon={StickyNote} label={menuSong.note ? 'Editar observação' : 'Adicionar observação'} hint='Ex.: “pedir palmas no refrão”' onClick={() => { setNoteDraft(menuSong.note || ''); setEditingNote(menu) }} />
            <MenuItem icon={Scissors} label={menuSong.start || menuSong.end ? 'Editar trecho (medley)' : 'Tocar só um trecho (medley)'} hint="Começa e termina onde você quiser"
              onClick={() => { setRangeDraft({ start: menuSong.start ? formatTime(menuSong.start) : '', end: menuSong.end ? formatTime(menuSong.end) : '' }); setRangeIdx(menu); setMenu(null) }} />
            <div className="flex">
              <MenuItem icon={ArrowUp} label="Subir" disabled={menu === 0} onClick={() => { moveSong(id, menu, menu - 1); setMenu(menu - 1) }} />
              <MenuItem icon={ArrowDown} label="Descer" disabled={menu === show.songs.length - 1} onClick={() => { moveSong(id, menu, menu + 1); setMenu(menu + 1) }} />
            </div>
            <MenuItem icon={Trash2} label="Tirar do show" danger onClick={() => { removeSong(id, menu); setMenu(null); toast('Música retirada do show') }} />
          </div>
        )}
      </Sheet>

      <Sheet open={rangeIdx !== null} onClose={() => setRangeIdx(null)} title="Trecho da música (medley)">
        <form className="p-4 space-y-3" style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}
          onSubmit={e => {
            e.preventDefault()
            if (rangeIdx === null) return
            const start = parseTime(rangeDraft.start), end = parseTime(rangeDraft.end)
            if ((rangeDraft.start.trim() && start === undefined) || (rangeDraft.end.trim() && end === undefined)) { toast.error('Use minutos:segundos, ex.: 1:05'); return }
            if (start !== undefined && end !== undefined && end <= start + 5) { toast.error('O fim precisa ser pelo menos 5 s depois do começo'); return }
            setRange(id, rangeIdx, { start, end })
            toast.success(start || end ? 'Trecho salvo. No palco a música toca só essa parte.' : 'A música volta a tocar inteira.')
            setRangeIdx(null)
          }}>
          <p className="text-sm text-[#b3b3b3]">No Modo Palco a música começa e termina nesses pontos. Com "Pausa 0s" e "Final: fade", vira um medley emendado.</p>
          <div className="flex gap-3">
            <label className="flex-1 text-xs text-[#9a9a9a]">Começar em
              <input inputMode="numeric" value={rangeDraft.start} onChange={e => setRangeDraft(d => ({ ...d, start: e.target.value }))} placeholder="0:00 (início)"
                className="mt-1 w-full h-12 rounded-xl bg-white/[0.07] px-3 text-base text-white outline-none placeholder:text-[#6a6a6a]" />
            </label>
            <label className="flex-1 text-xs text-[#9a9a9a]">Terminar em
              <input inputMode="numeric" value={rangeDraft.end} onChange={e => setRangeDraft(d => ({ ...d, end: e.target.value }))} placeholder="fim da música"
                className="mt-1 w-full h-12 rounded-xl bg-white/[0.07] px-3 text-base text-white outline-none placeholder:text-[#6a6a6a]" />
            </label>
          </div>
          <p className="text-xs text-[#8a8a8a]">Dica: no player, as partes da música (intro, verso, refrão) mostram o tempo de cada uma.</p>
          <div className="flex gap-2">
            {(rangeDraft.start || rangeDraft.end) && <button type="button" onClick={() => setRangeDraft({ start: '', end: '' })} className="h-12 px-4 rounded-full bg-white/10 font-semibold">Música inteira</button>}
            <button type="submit" className="flex-1 h-12 rounded-full bg-[hsl(var(--primary))] text-black font-bold">Salvar</button>
          </div>
        </form>
      </Sheet>

      <Sheet open={editingNote !== null} onClose={() => setEditingNote(null)} title="Observação">
        <form className="p-4 space-y-3" onSubmit={e => { e.preventDefault(); if (editingNote !== null) setNote(id, editingNote, noteDraft.trim()); setEditingNote(null); setMenu(null) }}
          style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}>
          <textarea autoFocus value={noteDraft} onChange={e => setNoteDraft(e.target.value)} rows={3} placeholder="Aparece no palco quando esta música tocar"
            className="w-full rounded-xl bg-white/[0.07] p-3 text-base outline-none placeholder:text-[#7a7a7a]" />
          <button type="submit" className="w-full h-12 rounded-full bg-[hsl(var(--primary))] text-black font-bold">Salvar</button>
        </form>
      </Sheet>
    </div>
  )
}

function MenuItem({ icon: Icon, label, hint, onClick, danger, disabled }: { icon: any; label: string; hint?: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={cn('flex-1 w-full flex items-center gap-3 px-3 py-3.5 rounded-xl text-left active:bg-white/10 disabled:opacity-30', danger && 'text-red-400')}>
      <Icon className="h-5 w-5 shrink-0" />
      <span className="min-w-0"><span className="block font-medium">{label}</span>{hint && <span className="block text-xs text-[#8a8a8a]">{hint}</span>}</span>
    </button>
  )
}

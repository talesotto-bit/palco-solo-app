import { useEffect, useState, useRef, useCallback } from 'react'
import { Loader2, Search, Music, ArrowDownToLine, ClipboardPaste, ExternalLink, Pencil, Trash2, Minus, Plus, X, Check } from 'lucide-react'
import { toast } from 'sonner'
import { usePlayerStore } from '@/store/playerStore'
import { useCifraStore, cachedCifra, type CifraData } from '@/store/cifraStore'
import { useLyricsStore } from '@/store/lyricsStore'
import { cifraIsOtherSong, songArtist } from '@/lib/lyricsMatch'
import { useAutoScroll } from '@/hooks/useAutoScroll'
import { transposeKey, formatTons } from '@/lib/musicTheory'
import { parseSheet, countChords } from '@/lib/chordSheet'
import { cn } from '@/lib/utils'
import { ChordSheet } from './ChordSheet'

const FONT_SIZES = [13, 15, 17, 20, 24]

function slug(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function cifraClubUrl(artist: string, title: string) {
  return artist ? `https://www.cifraclub.com.br/${slug(artist)}/${slug(title)}/` : `https://www.cifraclub.com.br/?q=${encodeURIComponent(title)}`
}

/** Busca a cifra (servidor → cópia no aparelho) e mantém a cópia para o show sem internet */
export function useCifra(trackId: string | undefined, artist: string, title: string) {
  const own = useCifraStore(s => (trackId ? s.own[trackId] : undefined))
  const setCached = useCifraStore(s => s.setCached)
  const [remote, setRemote] = useState<CifraData | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'not_found' | 'error' | 'ok'>('idle')
  const abortRef = useRef<AbortController | null>(null)

  const fetchCifra = useCallback(async (a: string, t: string, force = false) => {
    if (!trackId) return
    if (!force) {
      const c = cachedCifra(trackId)
      if (c) { setRemote(c); setState('ok'); return }
      if (c === null) { setRemote(null); setState('not_found'); return }
    }
    abortRef.current?.abort()
    const ctrl = new AbortController(); abortRef.current = ctrl
    setState('loading'); setRemote(null)
    try {
      const params = new URLSearchParams({ title: t })
      if (a) params.set('artist', a)
      const res = await fetch(`/api/cifra?${params}`, { signal: ctrl.signal })
      if (ctrl.signal.aborted) return
      if (res.status === 404) { setState('not_found'); setCached(trackId, null); return }
      if (!res.ok) { setState('error'); return }
      const data: CifraData = await res.json()
      setRemote(data); setState('ok'); setCached(trackId, data)
    } catch (err: any) {
      if (err?.name === 'AbortError') return
      setState(navigator.onLine ? 'error' : 'not_found')
    }
  }, [trackId, setCached])

  useEffect(() => {
    if (!trackId || own) return
    void fetchCifra(artist, title)
    return () => abortRef.current?.abort()
  }, [trackId, own, artist, title, fetchCifra])

  // a cifra encontrada pelo nome pode ser de outra música com o mesmo título: confere com a letra verificada
  const lyrics = useLyricsStore(s => (s.trackId === trackId ? s.plainLyrics || s.syncedLines?.map(l => l.text).join('\n') || null : null))
  const otherSong = !!remote && cifraIsOtherSong(remote.content, lyrics)
  const lyricsTrack = useLyricsStore(s => s.trackId)
  useEffect(() => {
    // aba Cifra aberta sem a Letra: carrega a letra para conferir
    const t = usePlayerStore.getState().track
    if (!remote || !t || t.id !== trackId || lyricsTrack === trackId) return
    void useLyricsStore.getState().fetchLyrics(songArtist(t), t.title, t.id, t.lrclibId, t.durationSeconds)
  }, [remote, trackId, lyricsTrack])

  return { own, remote: otherSong ? null : remote, state: otherSong ? 'not_found' as const : state, fetchCifra }
}

export function CifrasPanel() {
  const track = usePlayerStore(s => s.track)
  const pitch = usePlayerStore(s => Math.round(s.pitch))
  const offset = useCifraStore(s => (track ? s.offset[track.id] ?? 0 : 0))
  const setOffset = useCifraStore(s => s.setOffset)
  const setOwn = useCifraStore(s => s.setOwn)
  const removeOwn = useCifraStore(s => s.removeOwn)
  const { own, remote, state, fetchCifra } = useCifra(track?.id, track ? songArtist(track) : '', track?.title || '')

  const [autoScroll, setAutoScroll] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  useAutoScroll(scrollRef, autoScroll)
  const [fontIdx, setFontIdx] = useState(1)
  const [manualQuery, setManualQuery] = useState('')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  if (!track) return null
  const content = own?.text ?? remote?.content ?? ''
  const hasSheet = !!content
  const transpose = pitch + offset
  const keyInfo = remote?.capo && !/^\d+$/.test(remote.capo) && !own ? remote.capo : null

  const startEdit = (initial: string) => { setDraft(initial); setEditing(true) }
  const saveDraft = () => {
    const lines = parseSheet(draft)
    if (!draft.trim()) { toast.error('Cole o texto da cifra antes de salvar.'); return }
    if (countChords(lines) === 0) toast.warning('Não encontrei acordes no texto. Salvei mesmo assim como letra.')
    setOwn(track.id, draft)
    setEditing(false)
    toast.success('Cifra salva neste aparelho. Ela muda de tom junto com a música.')
  }
  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text.trim()) { startEdit(text); return }
    } catch {}
    startEdit('')
  }

  return (
    <div className="flex flex-col min-h-[300px] lg:h-full rounded-lg bg-white/5 overflow-hidden">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 shrink-0 border-b border-white/5">
        <div className="min-w-0">
          <p className="text-sm font-bold text-white">Cifra</p>
          {hasSheet && (
            <p className="text-[10px] text-[#9a9a9a] truncate">
              {own ? 'Sua cifra (salva no aparelho)' : remote ? `Fonte: ${remote.source}` : ''}
            </p>
          )}
        </div>
        {hasSheet && !editing && (
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => setAutoScroll(v => !v)} aria-pressed={autoScroll} title="Rolagem automática"
              className={cn('h-8 px-2 rounded flex items-center gap-1 text-[11px] font-bold transition-colors',
                autoScroll ? 'bg-amber-400/20 text-amber-400' : 'bg-white/5 text-[#b3b3b3]')}>
              <ArrowDownToLine className="h-3.5 w-3.5" /> Rolar
            </button>
            <button onClick={() => setFontIdx(i => Math.max(0, i - 1))} disabled={fontIdx === 0} aria-label="Diminuir letra"
              className="h-8 w-8 rounded text-xs font-bold text-[#b3b3b3] bg-white/5 disabled:opacity-30">A-</button>
            <button onClick={() => setFontIdx(i => Math.min(FONT_SIZES.length - 1, i + 1))} disabled={fontIdx === FONT_SIZES.length - 1} aria-label="Aumentar letra"
              className="h-8 w-8 rounded text-sm font-bold text-[#b3b3b3] bg-white/5 disabled:opacity-30">A+</button>
          </div>
        )}
      </div>

      {/* Ajuste do tom da cifra (para casar com o playback) */}
      {hasSheet && !editing && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 shrink-0 bg-black/20 text-[11px]">
          <div className="text-[#b3b3b3] leading-tight">
            {keyInfo && <span>Tom: <b className="text-white">{transpose ? keyInfo.replace(/[A-G][#b]?m?/g, k => transposeKey(k, transpose)) : keyInfo}</b> · </span>}
            {pitch !== 0 && <span className="text-amber-400 font-semibold">acompanha {formatTons(pitch)} · </span>}
            <span>Cifra {offset === 0 ? 'no tom original' : formatTons(offset)}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[#808080] mr-0.5 hidden min-[380px]:inline">Ajustar</span>
            <button onClick={() => setOffset(track.id, offset - 1)} aria-label="Descer meio tom na cifra" className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center"><Minus className="h-3.5 w-3.5" /></button>
            <button onClick={() => setOffset(track.id, offset + 1)} aria-label="Subir meio tom na cifra" className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center"><Plus className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 pb-4" style={{ WebkitOverflowScrolling: 'touch' }}>
        {/* Editor: colar/editar cifra */}
        {editing && (
          <div className="py-3 space-y-2">
            <p className="text-xs text-[#b3b3b3]">
              Cole a cifra de qualquer site (ou digite). O app reconhece os acordes e muda o tom junto com a música.
            </p>
            <textarea value={draft} onChange={e => setDraft(e.target.value)} autoFocus spellCheck={false}
              placeholder={'Ex.:\n       C            G/B\nParece que cê sente cheiro de bebida'}
              className="w-full min-h-[320px] rounded-lg bg-black/40 p-3 font-mono text-[13px] text-white outline-none focus:ring-1 focus:ring-amber-400/50" />
            {draft.trim() && <p className="text-[11px] text-[#9a9a9a]">{countChords(parseSheet(draft))} acordes reconhecidos</p>}
            <div className="flex gap-2">
              <button onClick={saveDraft} className="flex-1 h-11 rounded-full bg-amber-400 text-black text-sm font-bold flex items-center justify-center gap-1.5"><Check className="h-4 w-4" /> Salvar cifra</button>
              <button onClick={() => setEditing(false)} className="h-11 px-4 rounded-full bg-white/10 text-sm font-semibold flex items-center gap-1"><X className="h-4 w-4" /> Cancelar</button>
            </div>
          </div>
        )}

        {!editing && !own && state === 'loading' && (
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
            <p className="text-sm text-[#b3b3b3]">Buscando cifra...</p>
          </div>
        )}

        {/* Não achou: o músico resolve em 2 toques */}
        {!editing && !own && (state === 'not_found' || state === 'error') && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Music className="h-8 w-8 text-[#535353]" />
            <p className="text-sm text-white font-semibold">{state === 'error' ? 'Sem conexão para buscar a cifra' : 'Ainda não temos a cifra desta música'}</p>
            <p className="text-xs text-[#9a9a9a] max-w-xs">Abra no Cifra Club, copie a cifra e cole aqui. Ela fica salva no aparelho e muda de tom junto com a música.</p>
            <div className="flex flex-col gap-2 w-full max-w-xs">
              <a href={cifraClubUrl(track.artist, track.title)} target="_blank" rel="noopener noreferrer"
                className="h-11 rounded-full bg-white/10 text-sm font-semibold flex items-center justify-center gap-2">
                <ExternalLink className="h-4 w-4" /> Abrir no Cifra Club
              </a>
              <button onClick={pasteFromClipboard} className="h-11 rounded-full bg-amber-400 text-black text-sm font-bold flex items-center justify-center gap-2">
                <ClipboardPaste className="h-4 w-4" /> Colar cifra
              </button>
            </div>
            <form className="w-full max-w-xs mt-2" onSubmit={(e) => {
              e.preventDefault()
              const q = manualQuery.trim(); if (!q) return
              const parts = q.split(/\s*[-–]\s*/)
              const a = parts.length > 1 ? parts[0] : track.artist
              const t = parts.length > 1 ? parts[1] : q
              void fetchCifra(a, t, true)
            }}>
              <p className="text-[11px] text-[#808080] mb-1">ou busque com outro nome</p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#808080]" />
                <input type="text" value={manualQuery} onChange={(e) => setManualQuery(e.target.value)} placeholder="Artista - Música"
                  className="w-full h-10 rounded-lg bg-[#2a2a2a] pl-9 pr-3 text-sm text-white placeholder:text-[#606060] outline-none focus:ring-1 focus:ring-white/20" />
              </div>
              {state === 'error' && <button type="button" onClick={() => fetchCifra(songArtist(track), track.title, true)} className="mt-2 text-xs text-[#b3b3b3] underline">Tentar de novo</button>}
            </form>
          </div>
        )}

        {!editing && hasSheet && (
          <div className="py-3">
            <ChordSheet content={content} transpose={transpose} fontSize={FONT_SIZES[fontIdx]} />
            <div className="flex flex-wrap justify-center gap-2 pt-6">
              <button onClick={() => startEdit(content.replace(/⟨([^⟩]*)⟩/g, '$1'))}
                className="flex items-center gap-1.5 text-xs font-medium text-[#b3b3b3] bg-white/5 px-3 py-2 rounded-lg"><Pencil className="h-3.5 w-3.5" /> Editar cifra</button>
              {own ? (
                <button onClick={() => { removeOwn(track.id); toast('Cifra removida.') }}
                  className="flex items-center gap-1.5 text-xs font-medium text-[#b3b3b3] bg-white/5 px-3 py-2 rounded-lg"><Trash2 className="h-3.5 w-3.5" /> Remover minha cifra</button>
              ) : (
                <button onClick={pasteFromClipboard}
                  className="flex items-center gap-1.5 text-xs font-medium text-[#b3b3b3] bg-white/5 px-3 py-2 rounded-lg"><ClipboardPaste className="h-3.5 w-3.5" /> Colar outra cifra</button>
              )}
              <a href={cifraClubUrl(track.artist, track.title)} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs font-medium text-[#b3b3b3] bg-white/5 px-3 py-2 rounded-lg"><ExternalLink className="h-3.5 w-3.5" /> Cifra Club</a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

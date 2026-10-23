/**
 * Editar uma música adicionada pelo músico: nome, artista, tom, BPM, capa e pistas
 * (renomear, tirar, acrescentar). Tudo fica no aparelho.
 */
import { useEffect, useRef, useState } from 'react'
import { Camera, Plus, Trash2, Loader2, ImageOff } from 'lucide-react'
import { toast } from 'sonner'
import { Sheet } from '@/components/ui/sheet'
import { useLocalTracksStore } from '@/store/localTracksStore'
import { usePlayerStore } from '@/store/playerStore'
import { generateCover } from '@/store/catalogStore'
import { AudioCache, isCacheUrl, urlToKey } from '@/lib/audioCache'
import { checkPlayable, storeExtraStem, isAudioName } from '@/lib/importer'
import { toCoverDataUrl, isCustomCover } from '@/lib/image'
import { detectInstrument } from '@/lib/stemDetection'
import { INSTRUMENT_ICONS, type Stem, type Track } from '@/types/track'
import { cn } from '@/lib/utils'

const inputCls = 'w-full h-11 rounded-xl bg-white/[0.07] border border-white/10 px-3 text-[15px] outline-none placeholder:text-[#6f6f6f] focus:border-white/30'

export function EditTrackSheet({ track, open, onClose }: { track: Track; open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState(track.title)
  const [artist, setArtist] = useState(track.artist)
  const [keyNote, setKeyNote] = useState(track.keyNote || '')
  const [bpm, setBpm] = useState(track.bpm ? String(track.bpm) : '')
  const [cover, setCover] = useState(track.coverUrl || '')
  const [stems, setStems] = useState<Stem[]>(track.stems.filter(s => !s.derive))
  const [adding, setAdding] = useState(false)
  const added = useRef<Stem[]>([])   // pistas novas já guardadas (apagadas se cancelar)
  const saved = useRef(false)
  const photoRef = useRef<HTMLInputElement>(null)
  const stemsRef = useRef<HTMLInputElement>(null)

  // reabre sempre com os dados atuais da música
  useEffect(() => {
    if (!open) return
    setTitle(track.title); setArtist(track.artist); setKeyNote(track.keyNote || ''); setBpm(track.bpm ? String(track.bpm) : '')
    setCover(track.coverUrl || ''); setStems(track.stems.filter(s => !s.derive)); added.current = []; saved.current = false
  }, [open, track])

  const cancel = () => {
    if (!saved.current) for (const s of added.current) if (isCacheUrl(s.audioUrl)) void AudioCache.remove(urlToKey(s.audioUrl))
    added.current = []
    onClose()
  }

  const pickPhoto = async (f?: File) => {
    if (!f) return
    const url = await toCoverDataUrl(f)
    if (url) setCover(url); else toast.error('Não consegui abrir essa imagem.')
  }

  const addStems = async (files: File[]) => {
    const audio = files.filter(f => isAudioName(f.name))
    if (!audio.length) return
    setAdding(true)
    let bad = 0
    const out: Stem[] = []
    for (const f of audio) {
      if ((await checkPlayable(f)) === null) { bad++; continue }
      try { out.push(await storeExtraStem(track.id, f, f.name, stems.length + out.length)) } catch { bad++ }
    }
    added.current.push(...out)
    setStems(s => [...s, ...out])
    setAdding(false)
    if (out.length) toast.success(out.length === 1 ? 'Pista adicionada' : `${out.length} pistas adicionadas`)
    if (bad) toast.warning(`${bad} arquivo(s) em formato que este aparelho não toca. Prefira MP3 ou WAV.`)
  }

  const save = async () => {
    if (!stems.length) { toast.error('A música precisa de pelo menos uma pista.'); return }
    const original = track.stems.filter(s => !s.derive)
    const kept = new Set(stems.map(s => s.audioUrl))
    // pistas tiradas (inclusive as acrescentadas agora e tiradas antes de salvar)
    const removed = [...original, ...added.current].filter(s => !kept.has(s.audioUrl))
    const stemsChanged = removed.length > 0 || added.current.length > 0 || stems.some((s, i) => s.id !== original[i]?.id)
    const finalStems: Stem[] = stems.map((s, i) => ({ ...s, label: s.label.trim() || 'Pista', isPrimary: i === 0 }))
    // música inteira continua com "tirar a voz"; se virou multipista, a opção sai
    const derive = track.stems.find(s => s.derive)
    if (derive && finalStems.length === 1) finalStems.push({ ...derive, audioUrl: finalStems[0].audioUrl })
    const t = title.trim() || 'Minha música', a = artist.trim()
    const patch: Partial<Track> = {
      title: t, artist: a, keyNote: keyNote.trim(), bpm: Number(bpm) || 0,
      coverUrl: isCustomCover(cover) ? cover : generateCover(t, a, 0),
      stems: finalStems, hasStems: stems.length > 1, previewUrl: finalStems[0].audioUrl,
    }
    saved.current = true
    useLocalTracksStore.getState().updateTrack(track.id, patch)
    for (const s of removed) if (isCacheUrl(s.audioUrl)) void AudioCache.remove(urlToKey(s.audioUrl))
    const player = usePlayerStore.getState()
    if (player.track?.id === track.id) {
      const updated = { ...player.track, ...patch } as Track
      if (stemsChanged) { player.stop(); void player.loadTrack(updated) }
      else usePlayerStore.setState({ track: updated })
    }
    toast.success('Música atualizada')
    onClose()
  }

  return (
    <Sheet open={open} onClose={cancel} variant="full" title="Editar música"
      footer={<button onClick={save} disabled={adding} className="w-full h-14 rounded-full bg-[hsl(var(--primary))] text-black text-lg font-black disabled:opacity-50">Salvar alterações</button>}>
      <div className="px-4 py-4 space-y-5 max-w-xl mx-auto">
        <div className="flex gap-4 items-center">
          <button onClick={() => photoRef.current?.click()} className="relative h-28 w-28 shrink-0 rounded-2xl overflow-hidden bg-white/10 active:scale-95 transition-transform" aria-label="Trocar capa">
            {cover ? <img src={cover} alt="" className="h-full w-full object-cover" /> : null}
            <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/70 py-1.5 text-[11px] font-bold"><Camera className="h-3.5 w-3.5" /> Trocar capa</span>
          </button>
          <div className="flex-1 min-w-0 text-sm text-white/60">
            Use uma foto do seu show, da banda ou a capa do álbum.
            {isCustomCover(cover) && <button onClick={() => setCover(generateCover(title, artist, 0))} className="mt-2 flex items-center gap-1 text-xs font-semibold text-white/70"><ImageOff className="h-3.5 w-3.5" /> Tirar foto</button>}
          </div>
        </div>
        <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={e => { void pickPhoto(e.target.files?.[0]); e.target.value = '' }} />

        <div className="grid gap-2">
          <label className="text-xs font-bold uppercase tracking-wider text-white/50">Música</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Nome da música" className={cn(inputCls, 'h-12 text-lg font-bold')} />
          <input value={artist} onChange={e => setArtist(e.target.value)} placeholder="Artista (ajuda a achar letra e cifra)" className={inputCls} />
          <div className="grid grid-cols-2 gap-2">
            <input value={keyNote} onChange={e => setKeyNote(e.target.value)} placeholder="Tom (ex.: G)" className={inputCls} />
            <input inputMode="numeric" value={bpm} onChange={e => setBpm(e.target.value.replace(/\D/g, ''))} placeholder="BPM" className={inputCls} />
          </div>
        </div>

        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-white/50">{stems.length === 1 ? 'Faixa' : `${stems.length} pistas`}</label>
          <ul className="mt-2 space-y-1.5">
            {stems.map(s => (
              <li key={s.audioUrl} className="flex items-center gap-2 rounded-2xl bg-white/[0.04] px-2.5 py-2">
                <span className="text-lg w-7 text-center">{INSTRUMENT_ICONS[detectInstrument(s.label)] || '🎵'}</span>
                <input value={s.label} onChange={e => setStems(list => list.map(x => (x.audioUrl === s.audioUrl ? { ...x, label: e.target.value } : x)))}
                  aria-label="Nome da pista" className="flex-1 min-w-0 bg-transparent text-[15px] font-medium outline-none focus:bg-white/5 rounded px-1 py-1" />
                {stems.length > 1 && (
                  <button onClick={() => setStems(list => list.filter(x => x.audioUrl !== s.audioUrl))} aria-label={`Tirar ${s.label}`}
                    className="h-9 w-9 flex items-center justify-center rounded-full text-white/45 active:bg-white/10"><Trash2 className="h-4 w-4" /></button>
                )}
              </li>
            ))}
          </ul>
          <button onClick={() => stemsRef.current?.click()} disabled={adding}
            className="mt-2 w-full h-12 rounded-2xl border border-dashed border-white/20 text-sm font-semibold flex items-center justify-center gap-2 active:bg-white/5 disabled:opacity-50">
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} {adding ? 'Guardando pistas...' : 'Acrescentar pistas'}
          </button>
          <input ref={stemsRef} type="file" multiple accept="audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg" className="hidden"
            onChange={e => { void addStems([...(e.target.files || [])]); e.target.value = '' }} />
          <p className="mt-2 text-xs text-white/45">Ex.: click, voz guia ou outro instrumento. Volume e mudo de cada pista você ajusta no Mixer. As alterações ficam só neste aparelho.</p>
        </div>
      </div>
    </Sheet>
  )
}

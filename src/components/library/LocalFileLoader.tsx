/**
 * LocalFileLoader — importa pastas de stems para a biblioteca permanente
 *
 * PASTA  → uma faixa com múltiplos stems (cada arquivo = um instrumento)
 * ARQUIVO → uma faixa simples (mix estéreo)
 *
 * Persistência:
 *   - Metadados: localStorage via Zustand
 *   - Áudio: IndexedDB via AudioCache
 *   - Blob URLs são recriados na hora de tocar (não ficam em memória)
 */

import { useRef, useState } from 'react'
import { FolderOpen, Music2, Upload, CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLocalTracksStore } from '@/store/localTracksStore'
import { AudioCache, CACHE_PREFIX, cacheKey } from '@/lib/audioCache'
import { detectInstrument, stemLabel, parseFolderName } from '@/lib/stemDetection'
import { cn } from '@/lib/utils'
import type { Track, Stem } from '@/types/track'

const AUDIO_EXT = new Set(['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.opus', '.wma'])

function isAudio(name: string) {
  return AUDIO_EXT.has(name.slice(name.lastIndexOf('.')).toLowerCase())
}

// ─── Leitura recursiva de diretório via DataTransfer ───────────────────────

interface FolderEntry { folderName: string; files: File[] }

async function readDirectory(entry: FileSystemDirectoryEntry, depth = 0): Promise<FolderEntry[]> {
  const results: FolderEntry[] = []
  const directFiles: File[] = []

  await new Promise<void>((resolve) => {
    const reader = entry.createReader()
    const readBatch = () => {
      reader.readEntries(async (entries) => {
        if (!entries.length) { resolve(); return }
        for (const e of entries) {
          if (e.isFile && isAudio(e.name)) {
            await new Promise<void>(r => (e as FileSystemFileEntry).file(f => { directFiles.push(f); r() }))
          } else if (e.isDirectory && depth < 3) {
            results.push(...await readDirectory(e as FileSystemDirectoryEntry, depth + 1))
          }
        }
        readBatch()
      })
    }
    readBatch()
  })

  if (directFiles.length > 0) results.unshift({ folderName: entry.name, files: directFiles })
  return results
}

// ─── Conversão pasta → faixa com cache no IndexedDB ───────────────────────

const STEM_ORDER: Record<string, number> = {
  drums: 1, bass: 2, guitar: 3, acoustic: 4,
  keys: 5, brass: 6, strings: 7, choir: 8, voice: 9, main: 10,
}

async function folderToTrack(entry: FolderEntry): Promise<Track> {
  const { artist, title } = parseFolderName(entry.folderName)
  const trackId = `local-${entry.folderName.replace(/\s+/g, '-')}-${Date.now()}`

  // Ordena arquivos por instrumento
  const sorted = [...entry.files].sort((a, b) => {
    const ia = STEM_ORDER[detectInstrument(a.name)] ?? 10
    const ib = STEM_ORDER[detectInstrument(b.name)] ?? 10
    return ia !== ib ? ia - ib : a.name.localeCompare(b.name)
  })

  // Guarda cada arquivo no IndexedDB e cria stems com cache:// URL
  const stems: Stem[] = await Promise.all(sorted.map(async (file) => {
    const instrument = detectInstrument(file.name)
    const stemId = instrument === 'main'
      ? `stem-${file.name.replace(/\.[^/.]+$/, '').replace(/\W+/g, '-').toLowerCase()}`
      : instrument

    const key = cacheKey(trackId, stemId)
    await AudioCache.store(key, file)

    return {
      id: stemId,
      label: stemLabel(file.name, instrument),
      audioUrl: `${CACHE_PREFIX}${key}`,
      isPrimary: false,
    } satisfies Stem
  }))

  return {
    id: trackId,
    title,
    artist,
    genre: 'sertanejo',
    genreLabel: '📂 Importado',
    bpm: 0,
    keyNote: '?',
    keyScale: 'major',
    durationSeconds: 0,
    coverUrl: `https://placehold.co/400x400/0f172a/1351AA?text=${encodeURIComponent(title.charAt(0).toUpperCase())}`,
    previewUrl: `${CACHE_PREFIX}${cacheKey(trackId, stems[0]?.id ?? 'main')}`,
    hasStems: stems.length > 1,
    stems,
    hasLyrics: false,
    tags: ['importado', ...(stems.length > 1 ? ['multipista'] : [])],
    isNew: true,
  }
}

async function singleFileToTrack(file: File): Promise<Track> {
  const { artist, title } = parseFolderName(file.name)
  const trackId = `local-file-${file.name.replace(/\W+/g, '-')}-${Date.now()}`
  const stemId = 'main'
  const key = cacheKey(trackId, stemId)

  await AudioCache.store(key, file)

  return {
    id: trackId,
    title,
    artist,
    genre: 'sertanejo',
    genreLabel: '📂 Importado',
    bpm: 0,
    keyNote: '?',
    keyScale: 'major',
    durationSeconds: 0,
    coverUrl: `https://placehold.co/400x400/0f172a/1351AA?text=${encodeURIComponent(title.charAt(0).toUpperCase())}`,
    previewUrl: `${CACHE_PREFIX}${key}`,
    hasStems: false,
    stems: [{ id: stemId, label: 'Mix Completo', audioUrl: `${CACHE_PREFIX}${key}`, isPrimary: true }],
    hasLyrics: false,
    tags: ['importado'],
    isNew: true,
  }
}

// ─── Extração de DataTransfer ───────────────────────────────────────────────

async function extractFromDrop(dt: DataTransfer): Promise<Track[]> {
  const tracks: Track[] = []
  for (const item of Array.from(dt.items)) {
    const entry = item.webkitGetAsEntry?.()
    if (!entry) continue
    if (entry.isDirectory) {
      const folders = await readDirectory(entry as FileSystemDirectoryEntry)
      for (const f of folders) tracks.push(await folderToTrack(f))
    } else if (entry.isFile && isAudio(entry.name)) {
      await new Promise<void>(r =>
        (entry as FileSystemFileEntry).file(async f => { tracks.push(await singleFileToTrack(f)); r() })
      )
    }
  }
  return tracks
}

// ─── Drop Zone Principal ────────────────────────────────────────────────────

export function LocalFileLoader() {
  const folderRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle')
  const [result, setResult] = useState<{ tracks: number; stems: number } | null>(null)
  const addTracks = useLocalTracksStore(s => s.addTracks)

  const process = async (tracks: Track[]) => {
    if (!tracks.length) { setStatus('idle'); return }
    addTracks(tracks)
    setResult({
      tracks: tracks.length,
      stems: tracks.reduce((acc, t) => acc + t.stems.length, 0),
    })
    setStatus('done')
    setTimeout(() => { setStatus('idle'); setResult(null) }, 5000)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    setStatus('loading')
    const tracks = await extractFromDrop(e.dataTransfer)
    await process(tracks)
  }

  const handleFolderInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setStatus('loading')
    const files = Array.from(e.target.files ?? []).filter(f => isAudio(f.name))
    if (!files.length) { setStatus('idle'); return }

    const byFolder = new Map<string, File[]>()
    for (const file of files) {
      const parts = (file.webkitRelativePath || file.name).split('/')
      const folder = parts.length > 1 ? parts[0] : '__root__'
      if (!byFolder.has(folder)) byFolder.set(folder, [])
      byFolder.get(folder)!.push(file)
    }

    const tracks: Track[] = []
    for (const [folderName, fs] of byFolder.entries()) {
      tracks.push(await folderToTrack({ folderName, files: fs }))
    }
    await process(tracks)
    e.target.value = ''
  }

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setStatus('loading')
    const files = Array.from(e.target.files ?? []).filter(f => isAudio(f.name))
    const tracks: Track[] = []
    for (const file of files) tracks.push(await singleFileToTrack(file))
    await process(tracks)
    e.target.value = ''
  }

  return (
    <div>
      <input ref={fileRef} type="file" accept="audio/*" multiple className="hidden" onChange={handleFileInput} />
      <input
        ref={folderRef}
        type="file"
        // @ts-expect-error — webkitdirectory não está nos tipos padrão
        webkitdirectory=""
        multiple
        className="hidden"
        onChange={handleFolderInput}
      />

      <div
        onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false) }}
        onDrop={handleDrop}
        className={cn(
          'border-2 border-dashed rounded-xl transition-all',
          isDragging
            ? 'border-brand bg-brand/10 scale-[1.005] shadow-lg shadow-brand/10 cursor-copy'
            : status === 'done'
              ? 'border-emerald-500/50 bg-emerald-500/5 cursor-default'
              : 'border-border hover:border-brand/40 hover:bg-secondary/20 cursor-pointer'
        )}
        onClick={() => status === 'idle' && folderRef.current?.click()}
      >
        <div className="flex flex-col items-center gap-3 py-6 md:py-8 px-4 md:px-6 text-center">
          {status === 'loading' && (
            <>
              <Loader2 className="h-10 w-10 text-brand animate-spin" />
              <div>
                <p className="text-sm font-semibold text-foreground">Salvando na biblioteca...</p>
                <p className="text-xs text-muted-foreground mt-1">Detectando instrumentos e guardando os arquivos</p>
              </div>
            </>
          )}

          {status === 'done' && result && (
            <>
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {result.tracks === 1 ? '1 faixa adicionada' : `${result.tracks} faixas adicionadas`} à biblioteca!
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {result.stems > result.tracks
                    ? `${result.stems} pistas de instrumento detectadas · ficará salva mesmo ao fechar o app`
                    : 'Ficará salva mesmo ao fechar o app'}
                </p>
              </div>
            </>
          )}

          {status === 'idle' && (
            <>
              <div className={cn(
                'flex h-14 w-14 items-center justify-center rounded-2xl transition-colors',
                isDragging ? 'bg-brand/20' : 'bg-secondary'
              )}>
                <Upload className={cn('h-7 w-7', isDragging ? 'text-brand' : 'text-muted-foreground')} />
              </div>

              <div>
                <p className="text-base font-semibold text-foreground">
                  {isDragging ? 'Solte para adicionar à biblioteca!' : 'Adicionar músicas à biblioteca'}
                </p>
                <p className="text-xs text-muted-foreground mt-1.5 max-w-sm leading-relaxed">
                  Arraste uma <strong className="text-foreground">pasta com os stems</strong> (cada arquivo = um instrumento) ou um arquivo de mix.
                  Fica salvo automaticamente.
                </p>
              </div>

              {!isDragging && (
                <div className="flex items-center gap-2 mt-1" onClick={e => e.stopPropagation()}>
                  <Button variant="brand" size="sm" className="gap-2 shadow shadow-brand/20"
                    onClick={() => folderRef.current?.click()}>
                    <FolderOpen className="h-4 w-4" />
                    Selecionar pasta
                  </Button>
                  <Button variant="outline" size="sm" className="gap-2"
                    onClick={() => fileRef.current?.click()}>
                    <Music2 className="h-4 w-4" />
                    Arquivo único
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

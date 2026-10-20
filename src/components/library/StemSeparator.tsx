import { useState, useRef, useCallback, useEffect } from 'react'
import { Upload, Wand2, Music2, CheckCircle2, AlertCircle, X, Loader2, Clock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { separateToLibrary, getDailyUsage, DAILY_LIMIT, type SeparationStatus } from '@/lib/stemSeparation'
import { usePlayerStore } from '@/store/playerStore'
import { useLocalTracksStore } from '@/store/localTracksStore'
import { cn } from '@/lib/utils'
import type { Track } from '@/types/track'

const ACCEPTED = '.mp3,.wav,.ogg,.m4a,.flac,.aac'
const MAX_SIZE_MB = 50

interface StemSeparatorProps {
  onClose?: () => void
}

export function StemSeparator({ onClose }: StemSeparatorProps) {
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<SeparationStatus>('idle')
  const [message, setMessage] = useState('')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Track | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [limitAllowed, setLimitAllowed] = useState<boolean | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const loadTrack = usePlayerStore(s => s.loadTrack)
  const addTracks = useLocalTracksStore(s => s.addTracks)
  const navigate = useNavigate()

  useEffect(() => {
    setLimitAllowed(getDailyUsage().allowed)
  }, [result])

  const handleFile = useCallback((f: File) => {
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`Arquivo muito grande. Máximo ${MAX_SIZE_MB}MB.`)
      return
    }
    setFile(f)
    setError(null)
    setResult(null)
    setStatus('idle')
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [handleFile])

  const handleStart = async () => {
    if (!file) return
    setError(null)
    setResult(null)

    try {
      const track = await separateToLibrary(file, (s, msg, pct) => {
        setStatus(s)
        setMessage(msg)
        if (pct !== undefined) setProgress(pct)
      })
      addTracks([track])
      setResult(track)
    } catch (err: any) {
      setError(err.message || 'Erro desconhecido')
      setStatus('error')
    }
  }

  const handlePlay = () => {
    if (!result) return
    loadTrack(result)
    navigate('/app/player')
  }

  const isProcessing = ['uploading', 'starting', 'processing', 'saving'].includes(status)

  return (
    <div className="rounded-xl bg-[#181818] border border-white/5 p-4 md:p-6 space-y-4 md:space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-500/20">
            <Wand2 className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Separar Pistas com IA</h3>
            <p className="text-xs text-[#b3b3b3]">Envie qualquer música e a IA separa em Voz, Bateria, Baixo, Guitarra/Violão, Teclado e Outros</p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-[#b3b3b3] hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Rate limit reached */}
      {limitAllowed === false && status === 'idle' && !result && (
        <div className="flex items-center gap-3 rounded-lg bg-amber-500/10 border border-amber-500/20 p-4">
          <Clock className="h-5 w-5 text-amber-400 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-300">
              Você já usou as {DAILY_LIMIT} separações de hoje
            </p>
            <p className="text-xs text-amber-400/70 mt-0.5">
              Libera de novo amanhã. As músicas que você já separou continuam na sua biblioteca.
            </p>
          </div>
        </div>
      )}

      {/* Upload area */}
      {status === 'idle' && !result && limitAllowed !== false && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={cn(
            'flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-5 md:p-8 cursor-pointer transition-all',
            dragOver
              ? 'border-purple-400 bg-purple-500/10'
              : file
                ? 'border-[hsl(var(--primary))]/40 bg-[hsl(var(--primary))]/5'
                : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
            }}
          />

          {file ? (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--primary))]/20">
                <Music2 className="h-6 w-6 text-[hsl(var(--primary))]" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-white">{file.name}</p>
                <p className="text-xs text-[#b3b3b3] mt-1">
                  {(file.size / 1024 / 1024).toFixed(1)} MB — Clique para trocar
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5">
                <Upload className="h-6 w-6 text-[#b3b3b3]" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-white">Arraste um arquivo de áudio aqui</p>
                <p className="text-xs text-[#b3b3b3] mt-1">
                  MP3, WAV, OGG, M4A, FLAC — até {MAX_SIZE_MB}MB
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Processing state */}
      {isProcessing && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-purple-400" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">{message}</p>
              {status === 'processing' && (
                <p className="text-xs text-[#b3b3b3] mt-0.5">
                  Não feche esta página. A IA está processando o áudio.
                </p>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-purple-500 to-[hsl(var(--primary))] transition-all duration-1000"
              style={{ width: `${progress}%` }}
            />
          </div>

          {file && (
            <p className="text-xs text-[#535353] text-center">
              {file.name} — {(file.size / 1024 / 1024).toFixed(1)} MB
            </p>
          )}
        </div>
      )}

      {/* Success */}
      {status === 'done' && result && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-[hsl(var(--primary))]" />
            <p className="text-sm font-semibold text-white">
              {result.stems.length} pistas separadas e salvas na sua biblioteca
            </p>
          </div>

          {/* Stems list */}
          <div className="grid grid-cols-2 gap-2">
            {result.stems.map((stem) => (
              <div
                key={stem.id}
                className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2.5"
              >
                <Music2 className="h-4 w-4 text-[hsl(var(--primary))] shrink-0" />
                <p className="text-xs font-semibold text-white truncate">{stem.label}</p>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={handlePlay}
              className="flex-1 h-10 rounded-full text-sm font-bold bg-[hsl(var(--primary))] text-black hover:scale-[1.02] active:scale-[0.98] transition-transform"
            >
              Abrir no Player
            </button>
            <button
              onClick={() => {
                setFile(null)
                setResult(null)
                setStatus('idle')
                setProgress(0)
              }}
              className="h-10 rounded-full px-5 text-sm font-bold border border-white/20 text-white hover:border-white/40 transition-colors"
            >
              Separar outra
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 rounded-lg bg-red-500/10 border border-red-500/20 p-4">
          <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-300">{error}</p>
            <button
              onClick={() => { setError(null); setStatus('idle') }}
              className="text-xs text-red-400 hover:text-red-300 mt-1 underline"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      {/* Start button */}
      {status === 'idle' && file && !result && limitAllowed !== false && (
        <button
          onClick={handleStart}
          className="w-full h-12 rounded-full text-sm font-bold bg-gradient-to-r from-purple-500 to-[hsl(var(--primary))] text-black hover:scale-[1.02] active:scale-[0.98] transition-transform"
        >
          Separar Pistas com IA
        </button>
      )}

      {/* Info */}
      {status === 'idle' && !file && limitAllowed !== false && (
        <div className="flex items-center gap-2 text-[10px] text-[#535353]">
          <Wand2 className="h-3 w-3" />
          <span>IA Demucs (Meta) · 6 pistas · até {DAILY_LIMIT} separações por dia · as pistas ficam salvas no seu aparelho</span>
        </div>
      )}
    </div>
  )
}

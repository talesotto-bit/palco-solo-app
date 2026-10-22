import { useState } from 'react'
import { useCoverArt } from '@/hooks/useCoverArt'
import { cn } from '@/lib/utils'

interface Props {
  track?: { artist: string; title: string; coverUrl?: string }
  artist?: string
  title?: string
  coverUrl?: string
  className?: string
}

function initials(title: string) {
  return (title.trim()[0] || '♪').toUpperCase()
}

/** Capa da música (busca a capa real; enquanto isso mostra um quadrado com a inicial) */
export function CoverImg({ track, artist, title, coverUrl, className }: Props) {
  const a = track?.artist ?? artist ?? ''
  const t = track?.title ?? title ?? ''
  const url = useCoverArt(a, t, track?.coverUrl ?? coverUrl ?? '')
  const [failed, setFailed] = useState<string | null>(null)
  if (!url || failed === url) {
    return (
      <span className={cn('shrink-0 flex items-center justify-center bg-gradient-to-br from-[#2a3a5a] to-[#1a1a1a] text-white/40 font-black', className)}>
        {initials(t)}
      </span>
    )
  }
  return <img src={url} alt="" loading="lazy" onError={() => setFailed(url)} className={cn('shrink-0 object-cover bg-white/5', className)} />
}

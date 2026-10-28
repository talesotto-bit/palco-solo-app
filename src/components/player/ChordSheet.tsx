import { memo, useMemo } from 'react'
import { parseSheet, pairSegments } from '@/lib/chordSheet'
import { transposeChord } from '@/lib/musicTheory'
import { cn } from '@/lib/utils'

interface Props {
  content: string
  transpose: number
  fontSize: number
  /** palco: fundo preto, letras maiores e acordes mais fortes */
  stage?: boolean
}

/**
 * Mostra a cifra com cada acorde em cima da sílaba certa. Em tela estreita a linha quebra
 * junto com o acorde (não desalinha como texto com espaços).
 */
/** linha que está tocando (data-active, posto pela rolagem que acompanha a música) */
const LINE = 'rounded-md -mx-1.5 px-1.5 transition-colors duration-300 data-[active=true]:bg-amber-400/15'

export const ChordSheet = memo(function ChordSheet({ content, transpose, fontSize, stage }: Props) {
  const lines = useMemo(() => parseSheet(content), [content])
  const chordCls = cn('font-bold whitespace-pre', stage ? 'text-amber-300' : 'text-amber-400')
  const t = (c: string) => transposeChord(c, transpose)

  return (
    <div className="font-sans" style={{ fontSize, lineHeight: 1.35 }}>
      {lines.map((l, i) => {
        if (l.type === 'blank') return <div key={i} data-l={i} data-skip="" className="h-3" />
        if (l.type === 'section') {
          return <p key={i} data-l={i} data-skip="" className={cn('mt-3 mb-1 font-bold uppercase tracking-wide', stage ? 'text-white/60' : 'text-white/50')} style={{ fontSize: fontSize * 0.75 }}>{l.text}</p>
        }
        if (l.type === 'text') return <p key={i} data-l={i} className={cn('whitespace-pre-wrap', LINE, stage ? 'text-white' : 'text-[#e6e6e6]')}>{l.text}</p>
        if (l.type === 'chords') {
          return (
            <p key={i} data-l={i} className={cn('flex flex-wrap gap-x-3 gap-y-0.5 my-0.5', LINE)}>
              {l.chords.map((c, k) => <span key={k} className={chordCls}>{t(c.chord)}</span>)}
            </p>
          )
        }
        // par acorde + letra: cada pedaço é um bloco com o acorde em cima
        const segs = pairSegments(l.chords, l.lyric)
        return (
          <p key={i} data-l={i} className={cn('flex flex-wrap items-end my-1', LINE)}>
            {segs.map((s, k) => (
              <span key={k} className="inline-flex flex-col max-w-full">
                <span className={chordCls} style={{ minHeight: '1.2em', paddingRight: s.chord ? '0.35em' : 0 }}>{s.chord ? t(s.chord) : ' '}</span>
                <span className={cn('whitespace-pre-wrap break-words', stage ? 'text-white' : 'text-[#e6e6e6]')}>{s.text || ' '}</span>
              </span>
            ))}
          </p>
        )
      })}
    </div>
  )
})

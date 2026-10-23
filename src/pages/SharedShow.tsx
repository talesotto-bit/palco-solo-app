/** Setlist compartilhado com a banda (abre sem o app, rápido no 4G) */
import { useEffect, useState } from 'react'
import { Copy, Check, ExternalLink, ListMusic, CalendarDays, MapPin } from 'lucide-react'
import { decodeShow, showAsText, type SharedShowData } from '@/lib/shareShow'
import { cifraClubUrl } from '@/components/player/CifrasPanel'

export default function SharedShow() {
  const [d, setD] = useState<SharedShowData | null | undefined>(undefined)
  const [copied, setCopied] = useState(false)
  useEffect(() => { void decodeShow(location.hash.slice(1)).then(setD) }, [])
  useEffect(() => { if (d) document.title = `${d.n} · Setlist` }, [d])

  if (d === undefined) return <div className="min-h-dvh bg-black" />
  if (!d) return <div className="min-h-dvh bg-black text-white flex items-center justify-center p-6 text-center">Link de setlist inválido.</div>

  const copy = async () => {
    try { await navigator.clipboard.writeText(showAsText(d)) } catch {}
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-[#12241a] via-[#0b0b0b] to-[#0b0b0b] text-white">
      <div className="max-w-xl mx-auto px-4 pb-12" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 20px)' }}>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[hsl(var(--primary))] flex items-center gap-1.5"><ListMusic className="h-4 w-4" /> Setlist</p>
        <h1 className="mt-1 text-3xl font-black leading-tight">{d.n}</h1>
        <p className="mt-1 text-sm text-white/60 flex flex-wrap gap-x-3">
          <span>{d.s.length} músicas</span>
          {d.d && <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{new Date(d.d + 'T12:00').toLocaleDateString('pt-BR')}</span>}
          {d.l && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{d.l}</span>}
        </p>
        <button onClick={copy} className="mt-4 h-11 px-4 rounded-full bg-white/10 text-sm font-bold flex items-center gap-2">
          {copied ? <><Check className="h-4 w-4" /> Copiado</> : <><Copy className="h-4 w-4" /> Copiar lista em texto</>}
        </button>
        <ol className="mt-5 space-y-2">
          {d.s.map(([t, a, k, b, n], i) => (
            <li key={i} className="rounded-2xl bg-white/[0.05] border border-white/[0.06] px-4 py-3">
              <div className="flex items-start gap-3">
                <span className="w-7 text-xl font-black text-white/30 tabular-nums">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-bold leading-tight">{t}</p>
                  {a && <p className="text-sm text-white/55">{a}</p>}
                  <div className="mt-1.5 flex flex-wrap gap-1.5 text-[12px]">
                    {k && <span className="rounded-md bg-[hsl(var(--primary))]/20 px-2 py-0.5 font-bold text-[hsl(var(--primary))]">Tom: {k}</span>}
                    {b ? <span className="rounded-md bg-white/10 px-2 py-0.5 font-semibold">{b} BPM</span> : null}
                  </div>
                  {n && <p className="mt-1.5 text-sm text-amber-200">📝 {n}</p>}
                </div>
                <a href={cifraClubUrl(a || '', t)} target="_blank" rel="noopener noreferrer" className="h-9 px-3 rounded-full bg-white/10 text-xs font-bold flex items-center gap-1 shrink-0"><ExternalLink className="h-3.5 w-3.5" /> Cifra</a>
              </div>
            </li>
          ))}
        </ol>
        <a href="https://powertom.com.br/?utm_source=setlist&utm_medium=app&utm_campaign=banda" target="_blank" rel="noopener noreferrer" className="mt-10 block text-center text-xs text-white/40">
          Setlist feito no <b className="text-white/70">Power Tom</b> · a banda completa no celular do músico
        </a>
      </div>
    </div>
  )
}

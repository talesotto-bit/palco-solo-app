/**
 * Página do público (abre pelo QR code do músico): escolher música, pedir pelo WhatsApp e mandar gorjeta no Pix.
 * Não usa nada do app (rápida de abrir no 4G do bar) e funciona sem cadastro.
 */
import { useEffect, useMemo, useState } from 'react'
import { Search, Send, Copy, Check, Heart, Music2 } from 'lucide-react'
import { decodeRequestPage, type RequestPage } from '@/lib/requestLink'
import { pixPayload } from '@/lib/pix'
import { QRCode } from '@/components/QRCode'
import { matchesSearch, cn } from '@/lib/utils'

const TIPS = [5, 10, 20, 50]

export default function PublicRequest() {
  const [page, setPage] = useState<RequestPage | null | undefined>(undefined)
  const [q, setQ] = useState('')
  const [song, setSong] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [tip, setTip] = useState<number | null>(null)
  const [custom, setCustom] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const load = () => void decodeRequestPage(location.hash.slice(1)).then(setPage)
    load()
    window.addEventListener('hashchange', load)
    return () => window.removeEventListener('hashchange', load)
  }, [])
  useEffect(() => { if (page) document.title = `Pedidos · ${page.n}` }, [page])

  const songs = useMemo(() => (page?.s || []).map(x => { const [t, a] = x.split('|'); return { key: x, title: t, artist: a || '' } }), [page])
  const list = useMemo(() => (q.trim() ? songs.filter(s => matchesSearch(q, [s.title, s.artist])) : songs), [songs, q])
  const amount = tip ?? (Number(custom.replace(',', '.')) || 0)
  const pix = page?.k ? pixPayload({ key: page.k, name: page.pn || page.n, city: page.c || 'BRASIL', amount: amount > 0 ? amount : undefined, message: 'Gorjeta show' }) : ''
  const picked = songs.find(s => s.key === song)

  if (page === undefined) return <div className="min-h-dvh bg-[#0d0d0d]" />
  if (!page) {
    return (
      <div className="min-h-dvh bg-[#0d0d0d] text-white flex items-center justify-center p-6 text-center">
        <div><Music2 className="h-10 w-10 mx-auto text-white/40" /><p className="mt-3 text-lg font-semibold">Link de pedidos inválido</p><p className="text-white/50 text-sm mt-1">Peça ao artista para mostrar o QR code de novo.</p></div>
      </div>
    )
  }

  const sendRequest = () => {
    if (!page.w) return
    const lines = [
      picked ? `🎵 Pedido: ${picked.title}${picked.artist ? ` — ${picked.artist}` : ''}` : '🎵 Oi! Tenho um pedido',
      name && `De: ${name}`,
      note && `Recado: ${note}`,
      amount > 0 && `💸 Mandei R$ ${amount.toFixed(2).replace('.', ',')} de gorjeta no Pix`,
    ].filter(Boolean)
    window.open(`https://wa.me/${page.w}?text=${encodeURIComponent(lines.join('\n'))}`, '_blank')
  }

  const copyPix = async () => {
    try { await navigator.clipboard.writeText(pix) } catch {
      const ta = document.createElement('textarea'); ta.value = pix; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove()
    }
    setCopied(true); setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-[#16241c] via-[#0d0d0d] to-[#0d0d0d] text-white">
      <div className="max-w-md mx-auto px-4 pb-10" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 20px)' }}>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[hsl(var(--primary))]">Ao vivo agora</p>
        <h1 className="mt-1 text-3xl font-black leading-tight">{page.n}</h1>
        {page.m && <p className="mt-1 text-white/70">{page.m}</p>}

        {/* 1. Escolher a música */}
        <section className="mt-6">
          <h2 className="text-lg font-bold">1. Escolha sua música</h2>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder={`Buscar entre ${songs.length} músicas`}
              className="w-full h-12 rounded-xl bg-white/[0.08] pl-10 pr-3 text-base outline-none placeholder:text-white/40 focus:ring-1 focus:ring-white/20" />
          </div>
          <ul className="mt-2 max-h-[42vh] overflow-y-auto rounded-xl bg-white/[0.03] divide-y divide-white/5 overscroll-contain">
            {list.map(s => (
              <li key={s.key}>
                <button onClick={() => setSong(song === s.key ? null : s.key)}
                  className={cn('w-full flex items-center gap-3 px-3 py-3 text-left active:bg-white/10', song === s.key && 'bg-[hsl(var(--primary))]/15')}>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold truncate">{s.title}</span>
                    {s.artist && <span className="block text-xs text-white/50 truncate">{s.artist}</span>}
                  </span>
                  <span className={cn('h-7 w-7 rounded-full border flex items-center justify-center shrink-0', song === s.key ? 'bg-[hsl(var(--primary))] border-transparent text-black' : 'border-white/25')}>
                    {song === s.key && <Check className="h-4 w-4" />}
                  </span>
                </button>
              </li>
            ))}
            {!list.length && <li className="px-3 py-6 text-center text-sm text-white/50">Não está no repertório de hoje. Mande o pedido assim mesmo que o artista vê!</li>}
          </ul>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Seu nome (opcional)"
            className="mt-3 w-full h-11 rounded-xl bg-white/[0.08] px-3 outline-none placeholder:text-white/40" />
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Recado ou dedicatória (opcional)"
            className="mt-2 w-full h-11 rounded-xl bg-white/[0.08] px-3 outline-none placeholder:text-white/40" />
        </section>

        {/* 2. Gorjeta */}
        {page.k && (
          <section className="mt-7">
            <h2 className="text-lg font-bold flex items-center gap-2">2. Mande uma gorjeta <Heart className="h-4 w-4 text-red-400 fill-red-400" /></h2>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {TIPS.map(v => (
                <button key={v} onClick={() => { setTip(tip === v ? null : v); setCustom('') }}
                  className={cn('h-12 rounded-xl font-bold', tip === v ? 'bg-[hsl(var(--primary))] text-black' : 'bg-white/[0.08]')}>R$ {v}</button>
              ))}
            </div>
            <input inputMode="decimal" value={custom} onChange={e => { setCustom(e.target.value); setTip(null) }} placeholder="Outro valor (R$)"
              className="mt-2 w-full h-11 rounded-xl bg-white/[0.08] px-3 outline-none placeholder:text-white/40" />
            <div className="mt-3 rounded-2xl bg-white/[0.05] p-4">
              <button onClick={copyPix} className="w-full h-12 rounded-full bg-white text-black font-bold flex items-center justify-center gap-2">
                {copied ? <><Check className="h-5 w-5" /> Código copiado! Cole no app do banco</> : <><Copy className="h-5 w-5" /> Copiar Pix {amount > 0 ? `de R$ ${amount.toFixed(2).replace('.', ',')}` : ''}</>}
              </button>
              <p className="mt-2 text-center text-xs text-white/50">No app do seu banco: Pix → Pix Copia e Cola. O valor vai direto para {page.pn || page.n}.</p>
              <details className="mt-2">
                <summary className="text-center text-xs text-white/60 cursor-pointer">Pagar com QR code (de outro celular)</summary>
                <QRCode value={pix} className="mt-3 mx-auto w-48 rounded-lg overflow-hidden" />
              </details>
            </div>
          </section>
        )}

        {/* 3. Enviar */}
        {page.w && (
          <button onClick={sendRequest} className="mt-7 w-full h-14 rounded-full bg-[hsl(var(--primary))] text-black text-lg font-bold flex items-center justify-center gap-2 shadow-[0_10px_30px_rgba(0,0,0,.4)]">
            <Send className="h-5 w-5" /> {picked ? 'Enviar pedido pelo WhatsApp' : 'Falar com o artista no WhatsApp'}
          </button>
        )}

        <a href="https://powertom.com.br/?utm_source=pedidos&utm_medium=app&utm_campaign=rodape" target="_blank" rel="noopener noreferrer"
          className="mt-10 block text-center text-xs text-white/35">
          Feito com <b className="text-white/60">Power Tom</b> · a banda completa no celular do músico
        </a>
      </div>
    </div>
  )
}

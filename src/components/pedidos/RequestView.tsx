/**
 * O que o público vê ao escanear o QR do músico: pedir música, mandar gorjeta no Pix e seguir no Instagram.
 * Também é usado como prévia ao vivo na tela do músico (preview = true: nada abre de verdade).
 */
import { useMemo, useState } from 'react'
import { Search, Send, Copy, Check, Instagram, Music2, Sparkles, ChevronRight, PartyPopper } from 'lucide-react'
import type { RequestPage } from '@/lib/requestLink'
import { pixPayload } from '@/lib/pix'
import { QRCode } from '@/components/QRCode'
import { confetti } from '@/lib/confetti'
import { matchesSearch, cn } from '@/lib/utils'
import { themeOf } from './themes'

const TIPS = [
  { v: 5, e: '☕', l: 'Um café' },
  { v: 10, e: '🍺', l: 'Uma gelada' },
  { v: 20, e: '🎸', l: 'Pro artista' },
  { v: 50, e: '🔥', l: 'Show demais' },
]
const DEDICATIONS = ['🎂 Aniversário', '❤️ Para meu amor', '🍻 Para os amigos', '🙏 Em gratidão', '🎉 Comemorando']

function initials(n: string) {
  return n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '♪'
}

export function RequestView({ page, preview = false }: { page: RequestPage; preview?: boolean }) {
  const th = themeOf(page.t)
  const [q, setQ] = useState('')
  const [song, setSong] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [tip, setTip] = useState<number | null>(null)
  const [custom, setCustom] = useState('')
  const [copied, setCopied] = useState(false)
  const [sent, setSent] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const songs = useMemo(() => (page.s || []).map(x => { const [t, a] = x.split('|'); return { key: x, title: t, artist: a || '' } }), [page.s])
  const filtered = useMemo(() => (q.trim() ? songs.filter(s => matchesSearch(q, [s.title, s.artist])) : songs), [songs, q])
  const list = showAll || q.trim() ? filtered : filtered.slice(0, 12)
  const amount = tip ?? (Number(custom.replace(',', '.')) || 0)
  const pix = page.k ? pixPayload({ key: page.k, name: page.pn || page.n, city: page.c || 'BRASIL', amount: amount > 0 ? amount : undefined, message: 'Gorjeta show' }) : ''
  const picked = songs.find(s => s.key === song)
  const money = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`
  const vars = { '--a': th.accent, '--a2': th.accent2, '--bg': th.bg } as React.CSSProperties

  const copyPix = async () => {
    if (preview) { setCopied(true); setTimeout(() => setCopied(false), 1500); return }
    try { await navigator.clipboard.writeText(pix) } catch {
      const ta = document.createElement('textarea'); ta.value = pix; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove()
    }
    setCopied(true); confetti([th.accent, th.accent2, '#ffffff', '#facc15'])
    setTimeout(() => setCopied(false), 3500)
  }

  const send = () => {
    const lines = [
      picked ? `🎵 Pedido: ${picked.title}${picked.artist ? ` — ${picked.artist}` : ''}` : '🎵 Oi! Tenho um pedido',
      name && `De: ${name}`,
      note && `Recado: ${note}`,
      amount > 0 && `💸 Mandei ${money(amount)} de gorjeta no Pix`,
    ].filter(Boolean)
    if (!preview && page.w) window.open(`https://wa.me/${page.w}?text=${encodeURIComponent(lines.join('\n'))}`, '_blank')
    setSent(true)
    if (!preview) confetti([th.accent, th.accent2, '#ffffff'])
  }

  if (sent) {
    return (
      <div className="min-h-full flex items-center justify-center p-6 text-center text-white" style={{ ...vars, background: `radial-gradient(circle at 50% 20%, color-mix(in srgb, var(--a) 35%, transparent), var(--bg) 65%)` }}>
        <div className="animate-pop-in">
          <PartyPopper className="h-16 w-16 mx-auto" style={{ color: th.accent }} />
          <h2 className="mt-4 text-3xl font-black">Pedido enviado!</h2>
          <p className="mt-2 text-white/75">{picked ? `“${picked.title}” chegou para ${page.n}.` : `Sua mensagem chegou para ${page.n}.`}{amount > 0 ? ' Obrigado pela gorjeta! 💛' : ''}</p>
          <button onClick={() => { setSent(false); setSong(null); setNote(''); setTip(null); setCustom('') }}
            className="mt-6 h-12 px-6 rounded-full font-bold" style={{ background: th.accent, color: th.ink }}>Pedir outra música</button>
          {page.ig && <a href={preview ? undefined : `https://instagram.com/${page.ig}`} target="_blank" rel="noopener noreferrer" className="mt-3 flex items-center justify-center gap-2 text-sm text-white/80"><Instagram className="h-4 w-4" /> Seguir @{page.ig}</a>}
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-full text-white overflow-hidden" style={{ ...vars, background: 'var(--bg)' }}>
      {/* fundo animado */}
      <div aria-hidden className="pointer-events-none absolute -top-24 -left-20 h-72 w-72 rounded-full blur-3xl opacity-50 animate-blob" style={{ background: th.accent }} />
      <div aria-hidden className="pointer-events-none absolute top-10 -right-24 h-72 w-72 rounded-full blur-3xl opacity-40 animate-blob [animation-delay:-4s]" style={{ background: th.accent2 }} />

      <div className="relative max-w-md mx-auto px-4 pb-36" style={{ paddingTop: preview ? 18 : 'calc(env(safe-area-inset-top, 0px) + 22px)' }}>
        {/* Cabeçalho do artista */}
        <div className="flex items-center gap-3">
          <div className="relative h-16 w-16 shrink-0 rounded-full p-[3px]" style={{ background: `conic-gradient(from 0deg, ${th.accent}, ${th.accent2}, ${th.accent})` }}>
            <div className="h-full w-full rounded-full flex items-center justify-center text-xl font-black" style={{ background: th.bg }}>{initials(page.n)}</div>
          </div>
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-black uppercase tracking-wider text-red-300">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" /></span>
              Ao vivo agora
            </span>
            <h1 className="mt-1 text-[28px] font-black leading-none truncate">{page.n}</h1>
          </div>
        </div>
        {page.m && <p className="mt-3 text-[15px] text-white/80">{page.m}</p>}

        {/* Atalhos */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <a href="#musicas" className="rounded-2xl p-3 border border-white/10 bg-white/[0.06] backdrop-blur active:scale-[0.98] transition-transform">
            <Music2 className="h-5 w-5" style={{ color: th.accent }} /><p className="mt-1.5 font-bold leading-tight">Pedir música</p><p className="text-[11px] text-white/55">{songs.length} no repertório</p>
          </a>
          {page.k ? (
            <a href="#gorjeta" className="rounded-2xl p-3 border border-white/10 bg-white/[0.06] backdrop-blur active:scale-[0.98] transition-transform">
              <Sparkles className="h-5 w-5" style={{ color: th.accent2 }} /><p className="mt-1.5 font-bold leading-tight">Mandar gorjeta</p><p className="text-[11px] text-white/55">Pix na hora</p>
            </a>
          ) : page.ig ? (
            <a href={preview ? undefined : `https://instagram.com/${page.ig}`} target="_blank" rel="noopener noreferrer" className="rounded-2xl p-3 border border-white/10 bg-white/[0.06]">
              <Instagram className="h-5 w-5" style={{ color: th.accent2 }} /><p className="mt-1.5 font-bold leading-tight">Instagram</p><p className="text-[11px] text-white/55">@{page.ig}</p>
            </a>
          ) : <div />}
        </div>

        {/* Músicas */}
        <section id="musicas" className="mt-7 scroll-mt-4">
          <h2 className="text-xl font-black">Qual música você quer ouvir?</h2>
          <div className="relative mt-2.5">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/45" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar música ou artista"
              className="w-full h-12 rounded-2xl bg-white/[0.08] border border-white/10 pl-10 pr-3 text-base outline-none placeholder:text-white/40 focus:border-[color:var(--a)]" />
          </div>
          <div className="mt-2.5 space-y-1.5">
            {list.map(s => {
              const on = song === s.key
              return (
                <button key={s.key} onClick={() => setSong(on ? null : s.key)}
                  className={cn('w-full flex items-center gap-3 rounded-2xl px-3.5 py-3 text-left border transition-all active:scale-[0.99]', on ? 'border-transparent shadow-lg' : 'border-white/[0.07] bg-white/[0.04]')}
                  style={on ? { background: `linear-gradient(135deg, ${th.accent}, ${th.accent2})`, color: th.ink } : undefined}>
                  <span className={cn('h-9 w-9 shrink-0 rounded-xl flex items-center justify-center', on ? 'bg-black/15' : 'bg-white/[0.07]')}>
                    {on ? <Check className="h-5 w-5" /> : <Music2 className="h-4 w-4 opacity-70" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold truncate">{s.title}</span>
                    {s.artist && <span className={cn('block text-xs truncate', on ? 'opacity-80' : 'text-white/50')}>{s.artist}</span>}
                  </span>
                </button>
              )
            })}
            {!filtered.length && <p className="rounded-2xl bg-white/[0.04] px-4 py-5 text-center text-sm text-white/60">Não achou? Escreva no recado abaixo: o artista recebe do mesmo jeito.</p>}
            {!showAll && !q.trim() && filtered.length > 12 && (
              <button onClick={() => setShowAll(true)} className="w-full h-11 rounded-2xl bg-white/[0.06] text-sm font-semibold flex items-center justify-center gap-1">Ver todas as {filtered.length} músicas <ChevronRight className="h-4 w-4" /></button>
            )}
          </div>

          <div className="mt-4">
            <p className="text-sm font-bold">É para alguém especial?</p>
            <div className="mt-2 flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4">
              {DEDICATIONS.map(d => (
                <button key={d} onClick={() => setNote(n => (n.startsWith(d) ? n : `${d}${n ? ' — ' + n : ''}`))}
                  className="h-9 shrink-0 rounded-full px-3 text-[13px] font-semibold bg-white/[0.07] border border-white/10 active:bg-white/15">{d}</button>
              ))}
            </div>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Seu nome"
              className="mt-2.5 w-full h-12 rounded-2xl bg-white/[0.08] border border-white/10 px-3.5 outline-none placeholder:text-white/40" />
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Recado ou dedicatória (aparece para o artista)"
              className="mt-2 w-full h-12 rounded-2xl bg-white/[0.08] border border-white/10 px-3.5 outline-none placeholder:text-white/40" />
          </div>
        </section>

        {/* Gorjeta */}
        {page.k && (
          <section id="gorjeta" className="mt-8 scroll-mt-4">
            <h2 className="text-xl font-black">Mande uma gorjeta 💛</h2>
            <p className="text-sm text-white/60">Cai direto no Pix de {page.pn || page.n}.</p>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {TIPS.map(t => {
                const on = tip === t.v
                return (
                  <button key={t.v} onClick={() => { setTip(on ? null : t.v); setCustom('') }}
                    className={cn('rounded-2xl py-3 border flex flex-col items-center transition-all active:scale-95', on ? 'border-transparent scale-[1.04] shadow-lg' : 'border-white/10 bg-white/[0.05]')}
                    style={on ? { background: `linear-gradient(135deg, ${th.accent}, ${th.accent2})`, color: th.ink } : undefined}>
                    <span className="text-2xl leading-none">{t.e}</span>
                    <span className="mt-1 text-[15px] font-black">R$ {t.v}</span>
                    <span className={cn('text-[10px]', on ? 'opacity-80' : 'text-white/45')}>{t.l}</span>
                  </button>
                )
              })}
            </div>
            <input inputMode="decimal" value={custom} onChange={e => { setCustom(e.target.value); setTip(null) }} placeholder="Outro valor (R$)"
              className="mt-2 w-full h-12 rounded-2xl bg-white/[0.08] border border-white/10 px-3.5 outline-none placeholder:text-white/40" />
            <button onClick={copyPix}
              className="mt-3 w-full h-14 rounded-2xl font-black text-[17px] flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
              style={{ background: copied ? '#ffffff' : `linear-gradient(135deg, ${th.accent}, ${th.accent2})`, color: copied ? '#111' : th.ink }}>
              {copied ? <><Check className="h-5 w-5" /> Pix copiado! Abra o banco e cole</> : <><Copy className="h-5 w-5" /> Copiar Pix{amount > 0 ? ` de ${money(amount)}` : ''}</>}
            </button>
            <p className="mt-2 text-center text-xs text-white/50">No app do banco: Pix → <b>Pix Copia e Cola</b></p>
            <details className="mt-1">
              <summary className="text-center text-xs text-white/55 cursor-pointer py-1">Pagar com QR code de outro celular</summary>
              <QRCode value={pix} className="mt-2 mx-auto w-44 rounded-xl overflow-hidden" />
            </details>
          </section>
        )}

        {page.ig && (
          <a href={preview ? undefined : `https://instagram.com/${page.ig}`} target="_blank" rel="noopener noreferrer"
            className="mt-8 flex items-center gap-3 rounded-2xl p-3.5 border border-white/10 bg-gradient-to-r from-[#833ab4]/40 via-[#fd1d1d]/30 to-[#fcb045]/30">
            <Instagram className="h-6 w-6" /><span className="flex-1"><span className="block font-bold">Siga @{page.ig}</span><span className="block text-xs text-white/70">Agenda dos próximos shows</span></span><ChevronRight className="h-5 w-5" />
          </a>
        )}

        <a href={preview ? undefined : 'https://powertom.com.br/?utm_source=pedidos&utm_medium=app&utm_campaign=rodape'} target="_blank" rel="noopener noreferrer"
          className="mt-10 block text-center text-xs text-white/35">Feito com <b className="text-white/60">Power Tom</b> · a banda completa no celular do músico</a>
      </div>

      {/* Barra fixa: resumo + enviar */}
      {(page.w || preview) && (
        <div className={cn('left-0 right-0 bottom-0 z-20 px-4 pt-3 bg-gradient-to-t from-black via-black/90 to-transparent', preview ? 'absolute' : 'fixed')}
          style={{ paddingBottom: preview ? 14 : 'calc(14px + env(safe-area-inset-bottom, 0px))' }}>
          <div className="max-w-md mx-auto">
            {(picked || amount > 0) && (
              <p className="mb-2 text-center text-xs text-white/70 truncate">
                {picked ? <>🎵 <b className="text-white">{picked.title}</b></> : null}{picked && amount > 0 ? ' · ' : ''}{amount > 0 ? <>💸 <b className="text-white">{money(amount)}</b></> : null}
              </p>
            )}
            <button onClick={send}
              className="w-full h-14 rounded-full font-black text-[17px] flex items-center justify-center gap-2 shadow-[0_10px_40px_rgba(0,0,0,.5)] active:scale-[0.98] transition-transform"
              style={{ background: `linear-gradient(135deg, ${th.accent}, ${th.accent2})`, color: th.ink }}>
              <Send className="h-5 w-5" /> {picked ? 'Enviar meu pedido' : 'Falar com o artista'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Pedidos e Gorjeta via Pix (recurso pago): o músico monta o "cardápio" com prévia ao vivo e gera QR e artes.
 * Quem ainda não comprou vê a oferta com uma demonstração interativa.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, QrCode, Share2, Copy, Maximize, ExternalLink, Check, Wallet, MessageCircle, ListMusic, Sparkles, Heart, Instagram, Image as ImageIcon, Printer, Smartphone, Loader2, BadgeCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useUnlocks, CHECKOUT, PRICE } from '@/lib/unlocks'
import { usePedidosStore } from '@/store/pedidosStore'
import { useShowsStore } from '@/store/showsStore'
import { useFavoritesStore } from '@/store/favoritesStore'
import { useAllTracks } from '@/hooks/useAllTracks'
import { normalizePixKey, pixPayload } from '@/lib/pix'
import { encodeRequestPage, requestUrl, type RequestPage } from '@/lib/requestLink'
import { renderArt, shareOrDownload, type ArtKind } from '@/lib/posterArt'
import { confetti } from '@/lib/confetti'
import { QRCode } from '@/components/QRCode'
import { StageQR } from '@/components/StageQR'
import { PhonePreview } from '@/components/pedidos/PhonePreview'
import { THEMES, themeOf } from '@/components/pedidos/themes'
import { cn } from '@/lib/utils'

const MAX_SONGS = 80
const inputCls = 'w-full h-12 rounded-xl bg-white/[0.07] border border-white/10 px-3 text-base outline-none placeholder:text-[#6f6f6f] focus:border-white/30'

const DEMO: RequestPage = {
  v: 1, n: 'Zé da Viola', m: 'Peça sua música! Gorjetas são muito bem-vindas 🎤', k: '+5511999998888', pn: 'José da Silva', c: 'São Paulo', w: '5511999998888', ig: 'zedaviola', t: 1,
  s: ['Evidências|Chitãozinho & Xororó', 'Arranhão|Henrique e Juliano', 'Tempo Perdido|Legião Urbana', 'Ai Se Eu Te Pego|Michel Teló', 'Deixa Acontecer|Revelação', 'Garota Nacional|Skank', 'Cheia de Manias|Raça Negra', 'Sorte Grande|Ivete Sangalo'],
}

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-white/[0.04] border border-white/[0.07] p-4">
      <div className="flex items-center gap-2.5 mb-3">
        <span className={cn('h-7 w-7 rounded-full flex items-center justify-center text-sm font-black', done ? 'bg-[hsl(var(--primary))] text-black' : 'bg-white/10')}>{done ? <Check className="h-4 w-4" /> : n}</span>
        <h2 className="text-[17px] font-bold">{title}</h2>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function Label({ text, hint, children }: { text: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[13px] font-semibold text-white/90">{text}</span>
      {hint && <span className="ml-1.5 text-xs text-[#8f8f8f]">{hint}</span>}
      <div className="mt-1">{children}</div>
    </label>
  )
}

export default function Pedidos() {
  const navigate = useNavigate()
  const unlocked = useUnlocks(s => s.features.includes('pedidos'))
  const activate = useUnlocks(s => s.activate)
  const { profile, link, setProfile, setLink } = usePedidosStore()
  const theme = profile.theme
  const ig = profile.instagram || ''
  const shows = useShowsStore(s => s.shows)
  const favIds = useFavoritesStore(s => s.ids)
  const { byId } = useAllTracks()
  const [code, setCode] = useState('')
  const [stage, setStage] = useState(false)
  const [art, setArt] = useState<ArtKind | null>(null)
  const firstLink = useRef(!link)

  const pix = normalizePixKey(profile.pixKey)
  const songs = useMemo(() => {
    const ids: string[] = []
    for (const sh of shows) if (profile.showIds.includes(sh.id)) for (const s of sh.songs) ids.push(s.trackId)
    if (profile.includeFavorites) ids.push(...favIds)
    const seen = new Set<string>(); const out: string[] = []
    for (const id of ids) {
      if (seen.has(id)) continue; seen.add(id)
      const t = byId.get(id); const sh = shows.flatMap(x => x.songs).find(x => x.trackId === id)
      const title = t?.title || sh?.title; const artist = t?.artist || sh?.artist || ''
      if (title) out.push(`${title}|${artist}`)
    }
    return out.slice(0, MAX_SONGS)
  }, [shows, profile.showIds, profile.includeFavorites, favIds, byId])

  const wa = (() => { let w = profile.whatsapp.replace(/\D/g, ''); if (w && !w.startsWith('55')) w = '55' + w; return w })()
  const page: RequestPage = useMemo(() => ({
    v: 1, n: profile.artist.trim() || 'Seu nome aqui', w: wa || undefined, k: pix?.key,
    pn: profile.payeeName.trim() || undefined, c: profile.city.trim() || undefined, m: profile.message.trim() || undefined,
    s: songs.length ? songs : ['Sua música|Artista'], t: theme, ig: ig.replace(/^@/, '').trim() || undefined,
  }), [profile, wa, pix?.key, songs, theme, ig])

  const ok1 = !!profile.artist.trim()
  const ok2 = (!!wa || !!pix) && (!profile.pixKey.trim() || (!!pix && !!profile.payeeName.trim() && !!profile.city.trim()))
  const ok3 = songs.length > 0
  const ready = ok1 && ok2 && ok3

  // QR sempre atualizado com o que está preenchido
  useEffect(() => {
    if (!unlocked || !ready) return
    const t = setTimeout(async () => {
      const enc = await encodeRequestPage(page)
      const url = requestUrl(enc)
      if (url !== link) {
        setLink(url)
        if (firstLink.current) { firstLink.current = false; confetti(); toast.success('Seu QR de pedidos está pronto! 🎉') }
      }
    }, 500)
    return () => clearTimeout(t)
  }, [page, ready, unlocked]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!profile.showIds.length && shows[0]) setProfile({ showIds: [shows[0].id] }) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const set = setProfile

  const share = async () => {
    if (!link) return
    const text = `🎤 Peça sua música para ${profile.artist} e mande uma gorjeta no Pix:`
    try { if (navigator.share) { await navigator.share({ title: 'Pedidos', text, url: link }); return } } catch { return }
    await navigator.clipboard.writeText(`${text} ${link}`).catch(() => {}); toast.success('Link copiado')
  }

  const makeArt = async (kind: ArtKind) => {
    if (!link) return
    setArt(kind)
    try {
      const blob = await renderArt(kind, { link, artist: profile.artist, theme: themeOf(theme), hasPix: !!pix })
      await shareOrDownload(blob, `pedidos-${kind}.png`)
    } finally { setArt(null) }
  }

  const testPix = async () => {
    if (!pix) return
    const code = pixPayload({ key: pix.key, name: profile.payeeName || profile.artist, city: profile.city || 'BRASIL', amount: 1, message: 'Teste' })
    await navigator.clipboard.writeText(code).catch(() => {})
    toast.success('Pix de teste (R$ 1) copiado. Cole no app do seu banco: deve aparecer o seu nome.')
  }

  // ── Oferta com demonstração interativa ──
  if (!unlocked) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-4 pb-12">
        <button onClick={() => navigate(-1)} className="h-10 -ml-2 px-2 flex items-center gap-2 text-[#b3b3b3]"><ArrowLeft className="h-5 w-5" /> Voltar</button>
        <div className="grid md:grid-cols-[1fr_auto] gap-8 items-start mt-1">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--primary))]/15 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-[hsl(var(--primary))]"><Sparkles className="h-3.5 w-3.5" /> Recurso extra</span>
            <h1 className="mt-3 text-[34px] md:text-5xl font-black leading-[1.02]">Seu show vira <span className="bg-gradient-to-r from-[#22c55e] to-[#facc15] bg-clip-text text-transparent">gorjeta no Pix</span></h1>
            <p className="mt-3 text-[17px] text-white/75">Um QR code na mesa. O público escolhe a música do seu repertório, manda o pedido no seu WhatsApp e a gorjeta cai na hora na sua chave Pix.</p>
            <div className="md:hidden mt-6 flex flex-col items-center">
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-white/50 flex items-center gap-1.5"><Smartphone className="h-4 w-4" /> Toque e teste: é isso que o público vê</p>
              <PhonePreview page={DEMO} width={260} />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              {[
                [Wallet, 'Gorjeta na hora', 'Direto na sua chave, valor pronto'],
                [MessageCircle, 'Pedidos no WhatsApp', 'Com nome e dedicatória'],
                [ImageIcon, 'Arte para story', 'Divulgue antes do show'],
                [Printer, 'Cartaz da mesa', 'Pronto para imprimir'],
              ].map(([I, t, d], i) => { const Icon = I as any; return (
                <div key={i} className="rounded-2xl bg-white/[0.05] border border-white/[0.07] p-3.5">
                  <Icon className="h-5 w-5 text-[hsl(var(--primary))]" /><p className="mt-2 font-bold leading-tight">{t as string}</p><p className="text-xs text-white/55 mt-0.5">{d as string}</p>
                </div>) })}
            </div>
            <div className="mt-5 rounded-2xl bg-gradient-to-r from-[#22c55e]/15 to-transparent border border-[#22c55e]/25 p-4">
              <p className="font-bold">Faça a conta</p>
              <p className="text-sm text-white/75 mt-0.5">5 gorjetas de R$ 10 por noite, 8 shows no mês = <b className="text-white">R$ 400 a mais por mês</b>. O recurso custa menos que uma gorjeta.</p>
            </div>
            <button onClick={() => { if (CHECKOUT.pedidos) window.open(CHECKOUT.pedidos, '_blank'); else toast('Disponível em breve. Fale com o suporte.') }}
              className="mt-5 w-full h-14 rounded-full bg-gradient-to-r from-[#22c55e] to-[#14b8a6] text-black text-lg font-black shadow-[0_12px_40px_rgba(34,197,94,.35)] active:scale-[0.98] transition-transform">Quero ganhar gorjeta no Pix · {PRICE.pedidos}</button>
            <form className="mt-4 rounded-2xl bg-white/[0.04] p-4" onSubmit={e => {
              e.preventDefault()
              const raw = code.trim().split('/').pop() || ''
              if (activate(raw)) { confetti(); toast.success('Ativado! Vamos montar seu QR 🎉') } else toast.error('Código não reconhecido. Confira o e-mail da compra.')
            }}>
              <p className="font-semibold text-sm">Já comprei</p>
              <div className="mt-2 flex gap-2">
                <input value={code} onChange={e => setCode(e.target.value)} placeholder="Cole o código do e-mail" className={cn(inputCls, 'flex-1')} />
                <button type="submit" className="h-12 px-4 rounded-xl bg-white text-black font-bold">Ativar</button>
              </div>
            </form>
          </div>
          <div className="hidden md:flex flex-col items-center">
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-white/50 flex items-center gap-1.5"><Smartphone className="h-4 w-4" /> Toque e teste: é isso que o público vê</p>
            <PhonePreview page={DEMO} width={280} />
          </div>
        </div>
      </div>
    )
  }

  // ── Montagem com prévia ao vivo ──
  return (
    <div className="max-w-5xl mx-auto px-4 py-4 pb-16">
      <button onClick={() => navigate(-1)} className="h-10 -ml-2 px-2 flex items-center gap-2 text-[#b3b3b3]"><ArrowLeft className="h-5 w-5" /> Voltar</button>
      <div className="flex items-center gap-2">
        <h1 className="text-[28px] font-black leading-tight">Pedidos e Gorjeta</h1>
        <BadgeCheck className="h-6 w-6 text-[hsl(var(--primary))]" />
      </div>
      <p className="text-sm text-[#9a9a9a]">Monte uma vez. Tudo que você muda aparece na prévia e o QR se atualiza sozinho.</p>

      <div className="mt-5 grid md:grid-cols-[1fr_300px] gap-6 items-start">
        <div className="space-y-4">
          {/* Prévia no celular (no topo, só no celular) */}
          <div className="md:hidden">
            <PhonePreview page={page} width={230} />
            <p className="mt-2 text-center text-xs text-white/45">Prévia ao vivo · toque para testar</p>
          </div>

          <Step n={1} title="Seu perfil" done={ok1}>
            <Label text="Nome artístico"><input value={profile.artist} onChange={e => set({ artist: e.target.value })} placeholder="Ex.: Zé da Viola" className={inputCls} /></Label>
            <Label text="Instagram" hint="opcional"><div className="relative"><Instagram className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" /><input value={ig} onChange={e => set({ instagram: e.target.value })} placeholder="seuperfil" className={cn(inputCls, 'pl-9')} /></div></Label>
            <Label text="Recado para o público"><input value={profile.message} onChange={e => set({ message: e.target.value })} className={inputCls} /></Label>
            <div>
              <p className="text-[13px] font-semibold text-white/90">Visual</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {THEMES.map((t, i) => (
                  <button key={t.name} onClick={() => set({ theme: i })}
                    className={cn('rounded-2xl p-2 text-left border transition-all', (theme ?? 0) === i ? 'border-white scale-[1.03]' : 'border-white/10')}
                    style={{ background: `linear-gradient(135deg, ${t.accent}55, ${t.accent2}33), ${t.bg}` }}>
                    <span className="block h-6 rounded-lg" style={{ background: `linear-gradient(90deg, ${t.accent}, ${t.accent2})` }} />
                    <span className="mt-1.5 block text-[11px] font-bold">{t.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </Step>

          <Step n={2} title="Onde chegam pedidos e gorjetas" done={ok2}>
            <Label text="WhatsApp" hint="recebe os pedidos"><input inputMode="tel" value={profile.whatsapp} onChange={e => set({ whatsapp: e.target.value })} placeholder="(11) 99999-8888" className={inputCls} /></Label>
            <Label text="Chave Pix" hint={pix ? `✓ ${pix.type}` : 'CPF, celular, e-mail ou aleatória'}>
              <input value={profile.pixKey} onChange={e => set({ pixKey: e.target.value })} placeholder="Sua chave Pix" className={cn(inputCls, profile.pixKey && !pix && 'border-red-500/60')} />
            </Label>
            {(pix || profile.pixKey) && (
              <div className="grid grid-cols-2 gap-2">
                <Label text="Nome no banco"><input value={profile.payeeName} onChange={e => set({ payeeName: e.target.value })} placeholder="José da Silva" className={inputCls} /></Label>
                <Label text="Cidade"><input value={profile.city} onChange={e => set({ city: e.target.value })} placeholder="São Paulo" className={inputCls} /></Label>
              </div>
            )}
            {pix && profile.payeeName && profile.city && (
              <button onClick={testPix} className="w-full h-11 rounded-xl bg-white/[0.07] border border-white/10 text-sm font-semibold flex items-center justify-center gap-2"><Wallet className="h-4 w-4" /> Testar meu Pix com R$ 1</button>
            )}
          </Step>

          <Step n={3} title="Repertório que o público vê" done={ok3}>
            <div className="flex flex-wrap gap-2">
              {shows.map(sh => {
                const on = profile.showIds.includes(sh.id)
                return (
                  <button key={sh.id} onClick={() => set({ showIds: on ? profile.showIds.filter(x => x !== sh.id) : [...profile.showIds, sh.id] })}
                    className={cn('h-10 px-3 rounded-full text-sm font-semibold flex items-center gap-1.5', on ? 'bg-[hsl(var(--primary))] text-black' : 'bg-white/[0.08]')}>
                    {on ? <Check className="h-4 w-4" /> : <ListMusic className="h-4 w-4" />}{sh.name} <span className="opacity-60 text-xs">{sh.songs.length}</span>
                  </button>
                )
              })}
              <button onClick={() => set({ includeFavorites: !profile.includeFavorites })}
                className={cn('h-10 px-3 rounded-full text-sm font-semibold flex items-center gap-1.5', profile.includeFavorites ? 'bg-[hsl(var(--primary))] text-black' : 'bg-white/[0.08]')}>
                <Heart className="h-4 w-4" /> Favoritas <span className="opacity-60 text-xs">{favIds.length}</span>
              </button>
            </div>
            {!shows.length && <button onClick={() => navigate('/app/shows')} className="text-sm text-[hsl(var(--primary))] font-semibold">Montar um show primeiro →</button>}
            <p className="text-xs text-[#9a9a9a]">{songs.length} música{songs.length === 1 ? '' : 's'} no cardápio (até {MAX_SONGS})</p>
          </Step>

          {/* Resultado */}
          <section className={cn('rounded-3xl p-5 border', ready ? 'border-white/10' : 'border-dashed border-white/15 bg-white/[0.02]')}
            style={ready ? { background: `radial-gradient(circle at 20% 0%, ${themeOf(theme).accent}40, transparent 60%), radial-gradient(circle at 100% 100%, ${themeOf(theme).accent2}30, transparent 60%), #111` } : undefined}>
            {!ready ? (
              <div className="text-center py-4">
                <QrCode className="h-10 w-10 mx-auto text-white/30" />
                <p className="mt-2 font-semibold">Seu QR aparece aqui</p>
                <p className="text-sm text-white/50">Complete os passos 1, 2 e 3.</p>
              </div>
            ) : !link ? (
              <div className="py-10 flex justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>
            ) : (
              <>
                <div className="flex flex-col items-center">
                  <span className="text-[11px] font-black uppercase tracking-[0.25em] text-white/70">Seu QR está pronto</span>
                  <div className="mt-3 rounded-[26px] bg-white p-3 animate-qr-glow" style={{ ['--glow' as any]: themeOf(theme).accent }}>
                    <QRCode value={link} ecc="L" className="w-56" />
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button onClick={() => setStage(true)} className="h-14 rounded-2xl bg-white text-black font-black flex flex-col items-center justify-center leading-tight"><Maximize className="h-5 w-5" /><span className="text-xs mt-0.5">Mostrar no palco</span></button>
                  <button onClick={() => makeArt('story')} disabled={!!art} className="h-14 rounded-2xl bg-gradient-to-br from-[#833ab4] via-[#fd1d1d] to-[#fcb045] font-black flex flex-col items-center justify-center leading-tight disabled:opacity-60">
                    {art === 'story' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Instagram className="h-5 w-5" />}<span className="text-xs mt-0.5">Story Instagram</span></button>
                  <button onClick={() => makeArt('cartaz')} disabled={!!art} className="h-14 rounded-2xl bg-white/10 font-bold flex flex-col items-center justify-center leading-tight disabled:opacity-60">
                    {art === 'cartaz' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Printer className="h-5 w-5" />}<span className="text-xs mt-0.5">Cartaz da mesa</span></button>
                  <button onClick={share} className="h-14 rounded-2xl bg-white/10 font-bold flex flex-col items-center justify-center leading-tight"><Share2 className="h-5 w-5" /><span className="text-xs mt-0.5">Enviar link</span></button>
                </div>
                <div className="mt-2 flex gap-2">
                  <a href={link} target="_blank" rel="noopener noreferrer" className="flex-1 h-10 rounded-xl text-sm text-white/80 flex items-center justify-center gap-1.5 bg-white/[0.05]"><ExternalLink className="h-4 w-4" /> Abrir como o público</a>
                  <button onClick={async () => { await navigator.clipboard.writeText(link).catch(() => {}); toast.success('Link copiado') }} className="flex-1 h-10 rounded-xl text-sm text-white/80 flex items-center justify-center gap-1.5 bg-white/[0.05]"><Copy className="h-4 w-4" /> Copiar link</button>
                </div>
              </>
            )}
          </section>
        </div>

        {/* Prévia fixa no computador */}
        <div className="hidden md:block sticky top-4">
          <p className="mb-3 text-center text-xs font-bold uppercase tracking-widest text-white/50">Prévia ao vivo</p>
          <PhonePreview page={page} width={300} />
        </div>
      </div>

      {stage && link && <StageQR link={link} artist={profile.artist} theme={theme} onClose={() => setStage(false)} />}
    </div>
  )
}

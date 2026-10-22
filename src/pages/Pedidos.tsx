/**
 * Pedidos e Gorjeta via Pix (recurso pago): o músico configura o perfil e gera o QR code do público.
 * Quem ainda não comprou vê a oferta e pode ativar com o código que chega no e-mail.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, QrCode, Share2, Copy, Printer, Maximize, ExternalLink, Check, Wallet, MessageCircle, ListMusic, Sparkles, Heart } from 'lucide-react'
import { toast } from 'sonner'
import { useUnlocks, CHECKOUT } from '@/lib/unlocks'
import { usePedidosStore } from '@/store/pedidosStore'
import { useShowsStore } from '@/store/showsStore'
import { useFavoritesStore } from '@/store/favoritesStore'
import { useAllTracks } from '@/hooks/useAllTracks'
import { normalizePixKey } from '@/lib/pix'
import { encodeRequestPage, requestUrl } from '@/lib/requestLink'
import { QRCode } from '@/components/QRCode'
import { StageQR } from '@/components/StageQR'
import { cn } from '@/lib/utils'

const MAX_SONGS = 80

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      {hint && <span className="block text-xs text-[#9a9a9a]">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  )
}
const inputCls = 'w-full h-12 rounded-xl bg-white/[0.07] px-3 text-base outline-none placeholder:text-[#6f6f6f] focus:ring-1 focus:ring-white/25'

export default function Pedidos() {
  const navigate = useNavigate()
  const unlocked = useUnlocks(s => s.features.includes('pedidos'))
  const activate = useUnlocks(s => s.activate)
  const { profile, link, setProfile, setLink } = usePedidosStore()
  const shows = useShowsStore(s => s.shows)
  const favIds = useFavoritesStore(s => s.ids)
  const { byId } = useAllTracks()
  const [code, setCode] = useState('')
  const [stage, setStage] = useState(false)
  const [busy, setBusy] = useState(false)

  const pix = normalizePixKey(profile.pixKey)
  const songs = useMemo(() => {
    const ids: string[] = []
    for (const sh of shows) if (profile.showIds.includes(sh.id)) for (const s of sh.songs) ids.push(s.trackId)
    if (profile.includeFavorites) ids.push(...favIds)
    const seen = new Set<string>(); const out: string[] = []
    for (const id of ids) {
      if (seen.has(id)) continue; seen.add(id)
      const t = byId.get(id)
      const sh = shows.flatMap(x => x.songs).find(x => x.trackId === id)
      const title = t?.title || sh?.title; const artist = t?.artist || sh?.artist || ''
      if (title) out.push(`${title}|${artist}`)
    }
    return out
  }, [shows, profile.showIds, profile.includeFavorites, favIds, byId])

  useEffect(() => { if (!profile.showIds.length && shows[0]) setProfile({ showIds: [shows[0].id] }) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const generate = async () => {
    if (!profile.artist.trim()) { toast.error('Coloque seu nome artístico.'); return }
    if (!profile.whatsapp.replace(/\D/g, '') && !pix) { toast.error('Coloque pelo menos o WhatsApp ou a chave Pix.'); return }
    if (profile.pixKey.trim() && !pix) { toast.error('Chave Pix inválida. Confira e tente de novo.'); return }
    if (pix && (!profile.payeeName.trim() || !profile.city.trim())) { toast.error('Para o Pix, informe o nome do recebedor e a cidade.'); return }
    setBusy(true)
    let w = profile.whatsapp.replace(/\D/g, '')
    if (w && !w.startsWith('55')) w = '55' + w
    const enc = await encodeRequestPage({
      v: 1, n: profile.artist.trim(), w: w || undefined, k: pix?.key, pn: profile.payeeName.trim() || undefined,
      c: profile.city.trim() || undefined, m: profile.message.trim() || undefined, s: songs.slice(0, MAX_SONGS),
    })
    setLink(requestUrl(enc)); setBusy(false)
    toast.success('QR code pronto!')
  }

  const share = async () => {
    if (!link) return
    const text = `🎤 Peça sua música para ${profile.artist} e mande uma gorjeta no Pix:`
    try { if (navigator.share) { await navigator.share({ title: 'Pedidos', text, url: link }); return } } catch { return }
    await navigator.clipboard.writeText(`${text} ${link}`).catch(() => {}); toast.success('Link copiado')
  }

  // ── Oferta (ainda não comprou) ──
  if (!unlocked) {
    return (
      <div className="max-w-xl mx-auto px-4 py-5 pb-10">
        <button onClick={() => navigate(-1)} className="h-10 -ml-2 px-2 flex items-center gap-2 text-[#b3b3b3]"><ArrowLeft className="h-5 w-5" /> Voltar</button>
        <div className="mt-2 rounded-3xl bg-gradient-to-br from-[hsl(var(--primary))]/25 via-[#16241c] to-[#141414] p-6">
          <span className="inline-flex items-center gap-1 rounded-full bg-black/30 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[hsl(var(--primary))]"><Sparkles className="h-3.5 w-3.5" /> Recurso extra</span>
          <h1 className="mt-3 text-3xl font-black leading-tight">Ganhe gorjeta e pedidos em todo show</h1>
          <p className="mt-2 text-white/75">Coloque um QR code na mesa. O público escolhe a música do seu repertório, manda o pedido no seu WhatsApp e a gorjeta cai direto no seu Pix.</p>
          <ul className="mt-4 space-y-2 text-[15px]">
            {[
              [Wallet, 'Gorjeta direto na sua chave Pix, com valor pronto (R$ 5, 10, 20...)'],
              [MessageCircle, 'Pedidos chegam no seu WhatsApp com nome e dedicatória'],
              [ListMusic, 'O público vê o seu repertório de verdade, montado nos seus shows'],
              [Printer, 'Cartaz pronto para imprimir e QR em tela cheia no palco'],
            ].map(([Icon, t], i) => { const I = Icon as any; return <li key={i} className="flex gap-2.5"><I className="h-5 w-5 text-[hsl(var(--primary))] shrink-0 mt-0.5" /><span>{t as string}</span></li> })}
          </ul>
          <p className="mt-5 text-sm text-white/60">Uma gorjeta de R$ 20 já paga o recurso. O resto é lucro, em todo show.</p>
          <button onClick={() => { if (CHECKOUT.pedidos) window.open(CHECKOUT.pedidos, '_blank'); else toast('Disponível em breve. Fale com o suporte.') }}
            className="mt-5 w-full h-14 rounded-full bg-[hsl(var(--primary))] text-black text-lg font-bold">Quero ativar</button>
        </div>
        <form className="mt-6 rounded-2xl bg-white/[0.05] p-4" onSubmit={e => {
          e.preventDefault()
          const raw = code.trim().split('/').pop() || ''
          if (activate(raw)) toast.success('Pedidos e Gorjeta ativado! 🎉'); else toast.error('Código não reconhecido. Confira o e-mail da compra.')
        }}>
          <p className="font-semibold">Já comprei</p>
          <p className="text-xs text-[#9a9a9a]">Toque no link que chegou no seu e-mail ou cole o código aqui.</p>
          <div className="mt-2 flex gap-2">
            <input value={code} onChange={e => setCode(e.target.value)} placeholder="Código de ativação" className={cn(inputCls, 'flex-1')} />
            <button type="submit" className="h-12 px-4 rounded-xl bg-white text-black font-bold">Ativar</button>
          </div>
        </form>
      </div>
    )
  }

  // ── Configuração ──
  return (
    <div className="max-w-xl mx-auto px-4 py-5 pb-12">
      <button onClick={() => navigate(-1)} className="h-10 -ml-2 px-2 flex items-center gap-2 text-[#b3b3b3] print:hidden"><ArrowLeft className="h-5 w-5" /> Voltar</button>
      <div className="print:hidden">
        <h1 className="text-2xl font-black">Pedidos e Gorjeta via Pix</h1>
        <p className="text-sm text-[#9a9a9a]">Preencha uma vez. O QR code fica salvo e vale para todos os shows.</p>

        <div className="mt-5 space-y-4">
          <Field label="Nome artístico"><input value={profile.artist} onChange={e => setProfile({ artist: e.target.value })} placeholder="Ex.: Zé da Viola" className={inputCls} /></Field>
          <Field label="WhatsApp para receber os pedidos" hint="Com DDD"><input inputMode="tel" value={profile.whatsapp} onChange={e => setProfile({ whatsapp: e.target.value })} placeholder="(11) 99999-8888" className={inputCls} /></Field>
          <Field label="Chave Pix para as gorjetas" hint={pix ? `Chave reconhecida: ${pix.type}` : 'CPF, celular, e-mail ou chave aleatória'}>
            <input value={profile.pixKey} onChange={e => setProfile({ pixKey: e.target.value })} placeholder="Sua chave Pix" className={cn(inputCls, profile.pixKey && !pix && 'ring-1 ring-red-500/60')} />
          </Field>
          {(pix || profile.pixKey) && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nome no banco" hint="Como aparece no Pix"><input value={profile.payeeName} onChange={e => setProfile({ payeeName: e.target.value })} placeholder="José da Silva" className={inputCls} /></Field>
              <Field label="Cidade" hint="Exigida pelo Pix"><input value={profile.city} onChange={e => setProfile({ city: e.target.value })} placeholder="São Paulo" className={inputCls} /></Field>
            </div>
          )}
          <Field label="Recado para o público"><input value={profile.message} onChange={e => setProfile({ message: e.target.value })} className={inputCls} /></Field>

          <div>
            <p className="text-sm font-semibold">Repertório que o público vai ver</p>
            <p className="text-xs text-[#9a9a9a]">Escolha seus shows (até {MAX_SONGS} músicas).</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {shows.map(sh => {
                const on = profile.showIds.includes(sh.id)
                return (
                  <button key={sh.id} onClick={() => setProfile({ showIds: on ? profile.showIds.filter(x => x !== sh.id) : [...profile.showIds, sh.id] })}
                    className={cn('h-10 px-3 rounded-full text-sm font-semibold flex items-center gap-1.5', on ? 'bg-[hsl(var(--primary))] text-black' : 'bg-white/[0.08]')}>
                    {on && <Check className="h-4 w-4" />}{sh.name} <span className="opacity-60 text-xs">{sh.songs.length}</span>
                  </button>
                )
              })}
              <button onClick={() => setProfile({ includeFavorites: !profile.includeFavorites })}
                className={cn('h-10 px-3 rounded-full text-sm font-semibold flex items-center gap-1.5', profile.includeFavorites ? 'bg-[hsl(var(--primary))] text-black' : 'bg-white/[0.08]')}>
                <Heart className="h-4 w-4" /> Favoritas <span className="opacity-60 text-xs">{favIds.length}</span>
              </button>
            </div>
            {!shows.length && <button onClick={() => navigate('/app/shows')} className="mt-2 text-sm text-[hsl(var(--primary))] font-semibold">Montar um show primeiro →</button>}
            <p className="mt-2 text-xs text-[#9a9a9a]">{Math.min(songs.length, MAX_SONGS)} música(s) no cardápio{songs.length > MAX_SONGS ? ` (as primeiras ${MAX_SONGS})` : ''}</p>
          </div>

          <button onClick={generate} disabled={busy} className="w-full h-14 rounded-full bg-[hsl(var(--primary))] text-black text-lg font-bold flex items-center justify-center gap-2 disabled:opacity-60">
            <QrCode className="h-5 w-5" /> {link ? 'Atualizar QR code' : 'Gerar meu QR code'}
          </button>
        </div>

        {link && (
          <div className="mt-6 rounded-3xl bg-white/[0.05] p-5">
            <QRCode value={link} ecc="L" className="mx-auto w-64 rounded-xl overflow-hidden" />
            <p className="mt-3 text-center text-sm text-[#bdbdbd]">Mostre no palco, imprima ou mande o link no seu Instagram e WhatsApp.</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => setStage(true)} className="h-12 rounded-xl bg-white text-black font-bold flex items-center justify-center gap-2"><Maximize className="h-4 w-4" /> Tela cheia</button>
              <button onClick={share} className="h-12 rounded-xl bg-white/10 font-semibold flex items-center justify-center gap-2"><Share2 className="h-4 w-4" /> Compartilhar</button>
              <button onClick={() => window.print()} className="h-12 rounded-xl bg-white/10 font-semibold flex items-center justify-center gap-2"><Printer className="h-4 w-4" /> Cartaz</button>
              <a href={link} target="_blank" rel="noopener noreferrer" className="h-12 rounded-xl bg-white/10 font-semibold flex items-center justify-center gap-2"><ExternalLink className="h-4 w-4" /> Ver como público</a>
            </div>
            <button onClick={async () => { await navigator.clipboard.writeText(link).catch(() => {}); toast.success('Link copiado') }} className="mt-2 w-full h-10 text-sm text-[#bdbdbd] flex items-center justify-center gap-2"><Copy className="h-4 w-4" /> Copiar link</button>
          </div>
        )}
      </div>

      {/* Cartaz para imprimir (só aparece na impressão) */}
      {link && (
        <div className="hidden print:flex print:fixed print:inset-0 bg-white text-black flex-col items-center justify-center p-10">
          <p className="text-2xl font-bold uppercase tracking-[0.25em]">Peça sua música</p>
          <p className="text-6xl font-black mt-3 text-center">{profile.artist}</p>
          <QRCode value={link} ecc="L" className="mt-8 w-[150mm]" />
          <p className="mt-8 text-3xl font-bold text-center">Aponte a câmera do celular</p>
          <p className="mt-2 text-2xl text-center">Escolha a música e mande uma gorjeta no Pix 💸</p>
        </div>
      )}

      {stage && link && <StageQR link={link} artist={profile.artist} onClose={() => setStage(false)} />}
    </div>
  )
}

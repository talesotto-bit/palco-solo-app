/**
 * Modo teste: barra no topo, tela de compra (ao tocar numa música trancada) e o show de teste já montado.
 */
import { useEffect } from 'react'
import { Lock, Check, ShieldCheck, X } from 'lucide-react'
import { useTrial, useInTrial, APP_CHECKOUT, DEMO_IDS } from '@/lib/trial'
import { useShowsStore } from '@/store/showsStore'
import { CoverImg } from '@/components/shows/CoverImg'

const DEMO_SHOW = 'Show de teste'

/** Barra fina no topo: lembra que é teste e leva para a compra */
export function TrialBanner() {
  const trial = useInTrial()
  const open = useTrial(s => s.openPaywall)
  if (!trial) return null
  return (
    <div className="shrink-0 flex items-center gap-2 bg-gradient-to-r from-[#14532d] to-[#1f2937] px-3 py-1.5 text-[12px]" style={{ paddingTop: 'calc(6px + env(safe-area-inset-top, 0px))' }}>
      <span className="flex-1 min-w-0 truncate"><b>Modo teste</b> · 4 músicas liberadas com tudo: cifra, letra, mixer, Modo Palco</span>
      <button onClick={() => open()} className="h-7 shrink-0 rounded-full bg-[hsl(var(--primary))] px-3 font-black text-black">Liberar tudo</button>
    </div>
  )
}

/**
 * No teste não há show pronto: o músico monta o dele com as 4 músicas (um show pronto confundia).
 * Apaga o "Show de teste" que versões anteriores criavam sozinhas.
 */
export function TrialSetup() {
  const trial = useInTrial()
  useEffect(() => {
    if (!trial) return
    const st = useShowsStore.getState()
    st.shows.filter(s => s.name === DEMO_SHOW && s.songs.every(x => DEMO_IDS.has(x.trackId))).forEach(s => st.deleteShow(s.id))
  }, [trial])
  return null
}

/** Tela de compra: aparece ao tocar numa música trancada ou em "Liberar tudo" */
export function Paywall() {
  const paywall = useTrial(s => s.paywall)
  const close = useTrial(s => s.closePaywall)
  if (!paywall) return null
  const track = paywall === 'geral' ? null : paywall
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={close}>
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl border border-white/10 bg-[#141414] p-5" onClick={e => e.stopPropagation()}
        style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }}>
        <div className="flex items-start gap-3">
          {track ? (
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl">
              <CoverImg track={track} className="h-full w-full object-cover" />
              <span className="absolute inset-0 flex items-center justify-center bg-black/50"><Lock className="h-6 w-6" /></span>
            </div>
          ) : <span className="h-12 w-12 shrink-0 rounded-full bg-[hsl(var(--primary))]/15 flex items-center justify-center"><Lock className="h-6 w-6 text-[hsl(var(--primary))]" /></span>}
          <div className="min-w-0 flex-1">
            <p className="text-[19px] font-black leading-tight">{track ? `"${track.title}" está no app completo` : 'Libere o app completo'}</p>
            <p className="mt-1 text-[13px] text-white/60">{track ? 'Libere agora e toque ela do seu jeito, com tudo que você testou.' : 'Tudo que você está testando, com a biblioteca inteira.'}</p>
          </div>
          <button onClick={close} aria-label="Fechar" className="h-9 w-9 shrink-0 rounded-full bg-white/10 flex items-center justify-center"><X className="h-4 w-4" /></button>
        </div>
        <ul className="mt-4 space-y-2 text-[14px]">
          {['Milhares de músicas de todos os gêneros mais tocados', 'Tire a voz ou o seu instrumento e mude o tom em um toque', 'Cifra e letra no seu tom, Modo Palco com o show emendado', 'Grave você tocando e poste nos Stories', 'Seus próprios VS com todas as funções'].map(t => (
            <li key={t} className="flex gap-2"><Check className="h-5 w-5 shrink-0 text-[hsl(var(--primary))]" />{t}</li>
          ))}
        </ul>
        <a href={APP_CHECKOUT} className="mt-5 flex h-14 items-center justify-center rounded-2xl bg-[hsl(var(--primary))] text-[17px] font-black text-black shadow-[0_10px_30px_rgba(34,197,94,.25)]">Liberar tudo · R$ 47 vitalício</a>
        <p className="mt-2 flex items-center justify-center gap-1.5 text-[12px] text-white/55"><ShieldCheck className="h-4 w-4" /> Pagamento único · 7 dias de garantia</p>
        <button onClick={close} className="mt-3 w-full h-11 rounded-full bg-white/[0.06] text-sm font-semibold text-white/80">Continuar testando</button>
        <p className="mt-3 text-center text-[11px] text-white/40">Já comprou? Abra o link de ativação que chegou no seu e-mail.</p>
      </div>
    </div>
  )
}

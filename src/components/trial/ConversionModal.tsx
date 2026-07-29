import { useEffect } from 'react'
import { Check, ArrowRight, Clock, Music, Mic2, Sliders, Zap } from 'lucide-react'
import { useTrialStore } from '@/store/trialStore'
import { usePlayerStore } from '@/store/playerStore'

const CHECKOUT_URL = 'https://go.use-dice.com/cgAaPj19Lv5Mj_6K8kDwiGUs7n5k7nJL'
const SALES_PAGE = 'https://powertom.com.br'

function fireFbEvent(name: string, data?: Record<string, unknown>) {
  if (typeof window !== 'undefined' && (window as any).fbq) {
    (window as any).fbq('track', name, data)
  }
}

export function ConversionModal() {
  const isTrialMode = useTrialStore(s => s.isTrialMode)
  const expired = useTrialStore(s => s.expired)
  const extended = useTrialStore(s => s.extended)
  const extend = useTrialStore(s => s.extend)
  const pause = usePlayerStore(s => s.pause)

  useEffect(() => {
    if (expired && isTrialMode) {
      pause()
      fireFbEvent('TrialExpired', { extended })
    }
  }, [expired, isTrialMode, extended, pause])

  if (!isTrialMode || !expired) return null

  const handleCheckout = () => {
    fireFbEvent('InitiateCheckout', {
      content_name: 'Trial Conversion',
      currency: 'BRL',
      value: 97,
    })
    const isMobile = window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    if (isMobile) {
      window.location.href = CHECKOUT_URL
    } else {
      window.open(CHECKOUT_URL, '_blank', 'noopener,noreferrer')
    }
  }

  const handleExtend = () => {
    extend()
    fireFbEvent('TrialExtended')
  }

  const canExtend = !extended

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />

      <div className="relative w-full max-w-md rounded-2xl bg-gradient-to-b from-[#1a1a1a] to-[#0d0d0d] border border-white/10 shadow-2xl overflow-hidden">
        {/* Accent strip */}
        <div className="h-1 bg-gradient-to-r from-[hsl(var(--primary))] via-amber-400 to-[hsl(var(--primary))]" />

        <div className="p-6 sm:p-8">
          {/* Icon */}
          <div className="flex justify-center mb-5">
            <div className="h-16 w-16 rounded-full bg-[hsl(var(--primary))]/10 flex items-center justify-center">
              <Music className="h-8 w-8 text-[hsl(var(--primary))]" />
            </div>
          </div>

          {/* Title */}
          <h2 className="text-xl sm:text-2xl font-bold text-white text-center mb-2">
            {canExtend
              ? 'Seu teste grátis acabou'
              : 'Agora você conhece o Power Tom'
            }
          </h2>
          <p className="text-sm text-[#b3b3b3] text-center mb-6 leading-relaxed">
            {canExtend
              ? 'Você experimentou apenas uma pequena parte. Imagine ter acesso ilimitado a tudo isso.'
              : 'Músicos profissionais em todo o Brasil já usam. Faça parte.'
            }
          </p>

          {/* Benefits */}
          <div className="space-y-3 mb-7">
            {[
              { icon: Music, text: '100.000+ faixas profissionais' },
              { icon: Sliders, text: 'Mixer multipista — remova qualquer instrumento' },
              { icon: Mic2, text: 'Tom e velocidade em tempo real' },
              { icon: Zap, text: 'Letra sincronizada na tela' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-[hsl(var(--primary))]/10 flex items-center justify-center shrink-0">
                  <Icon className="h-4 w-4 text-[hsl(var(--primary))]" />
                </div>
                <span className="text-sm text-white/90">{text}</span>
              </div>
            ))}
          </div>

          {/* Primary CTA */}
          <button
            onClick={handleCheckout}
            className="w-full h-14 rounded-xl bg-[hsl(var(--primary))] hover:brightness-110 active:scale-[0.98] text-black font-bold text-base flex items-center justify-center gap-2 transition-all shadow-lg shadow-[hsl(var(--primary))]/20"
          >
            QUERO ACESSO COMPLETO
            <ArrowRight className="h-5 w-5" />
          </button>

          {/* Social proof */}
          <div className="flex items-center justify-center gap-1.5 mt-3 mb-4">
            {[...Array(5)].map((_, i) => (
              <svg key={i} className="h-3.5 w-3.5 text-amber-400 fill-amber-400" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            ))}
            <span className="text-[11px] text-[#808080] ml-1">4.9 — usado por 3.000+ músicos</span>
          </div>

          {/* Extension button (one-time) */}
          {canExtend && (
            <button
              onClick={handleExtend}
              className="w-full h-10 rounded-lg bg-white/5 hover:bg-white/10 text-[#b3b3b3] hover:text-white text-xs font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <Clock className="h-3.5 w-3.5" />
              Quero mais 2 minutos grátis
            </button>
          )}

          {/* See plans link */}
          <a
            href={SALES_PAGE}
            className="block text-center text-[11px] text-[#535353] hover:text-[#808080] mt-3 transition-colors"
          >
            Ver detalhes e planos
          </a>

          {/* Guarantee */}
          <div className="flex items-center justify-center gap-2 mt-4 pt-4 border-t border-white/5">
            <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
            <span className="text-[11px] text-[#808080]">Acesso vitalício · Suporte dedicado · Atualizações grátis</span>
          </div>
        </div>
      </div>
    </div>
  )
}

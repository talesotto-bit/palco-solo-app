import { useEffect, useState } from 'react'
import { Check, ArrowRight, Clock, Music, Mic2, Sliders, Zap, Crown, Star } from 'lucide-react'
import { useTrialStore } from '@/store/trialStore'
import { usePlayerStore } from '@/store/playerStore'
import { cn } from '@/lib/utils'

const PLANS = [
  {
    id: 'essencial',
    name: 'Essencial',
    price: '49,90',
    oldPrice: '97',
    subtitle: 'Para começar',
    url: 'https://go.use-dice.com/jder1kledMt5tBl9icG4t7W_Ac-5XqlM',
    highlight: false,
    icon: Star,
    features: [
      'Acesso vitalício',
      '100 VS Multipista profissionais',
      '100 Playbacks alta qualidade',
      '100 Playbacks com letra',
    ],
  },
  {
    id: 'pro',
    name: 'Plano Pro',
    price: '129,90',
    oldPrice: '247',
    subtitle: 'Intermediário',
    url: 'https://go.use-dice.com/cgAaPj19Lv5Mj_6K8kDwiGUs7n5k7nJL',
    highlight: false,
    icon: Crown,
    features: [
      'Acesso vitalício',
      'App exclusivo iOS/Android',
      'IA que ajusta tom e velocidade',
      '20.000 VS Multipista profissionais',
      '20.000 Playbacks com letra',
      'Atualizações semanais grátis',
    ],
  },
  {
    id: 'pro-max',
    name: 'Pro Max',
    price: '189,90',
    oldPrice: '367',
    subtitle: 'Mais vendido',
    url: 'https://go.use-dice.com/4MLA8IDE2vBDIjPgVc8a-xTEnTUZu4x0',
    highlight: true,
    icon: Zap,
    features: [
      'Acesso vitalício',
      'App exclusivo iOS/Android',
      'IA que ajusta tom e velocidade sem distorção',
      '80.000 VS Multipista profissionais',
      '60.000 Playbacks com letra',
      'Atualizações diárias grátis',
      'Tráfego pago para cantor',
    ],
  },
]

const SALES_PAGE = 'https://powertom.com.br'

function fireFbEvent(name: string, data?: Record<string, unknown>) {
  if (typeof window !== 'undefined' && (window as any).fbq) {
    (window as any).fbq('track', name, data)
  }
}

function openCheckout(url: string, planName: string, value: number) {
  fireFbEvent('InitiateCheckout', {
    content_name: planName,
    currency: 'BRL',
    value,
  })
  const isMobile = window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  if (isMobile) {
    window.location.href = url
  } else {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

export function ConversionModal() {
  const isTrialMode = useTrialStore(s => s.isTrialMode)
  const expired = useTrialStore(s => s.expired)
  const extended = useTrialStore(s => s.extended)
  const extend = useTrialStore(s => s.extend)
  const pause = usePlayerStore(s => s.pause)
  const [showPlans, setShowPlans] = useState(false)

  const handleExtend = () => {
    extend()
    fireFbEvent('TrialExtended')
  }

  useEffect(() => {
    if (expired && isTrialMode) {
      pause()
      fireFbEvent('TrialExpired', { extended })
    }
  }, [expired, isTrialMode, extended, pause])

  useEffect(() => {
    if (!expired) setShowPlans(false)
  }, [expired])

  if (!isTrialMode || !expired) return null

  const canExtend = !extended

  if (showPlans) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3">
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />

        <div className="relative w-full max-w-lg max-h-[90dvh] rounded-2xl bg-gradient-to-b from-[#1a1a1a] to-[#0d0d0d] border border-white/10 shadow-2xl overflow-hidden flex flex-col">
          <div className="h-1 bg-gradient-to-r from-[hsl(var(--primary))] via-amber-400 to-[hsl(var(--primary))] shrink-0" />

          <div className="overflow-y-auto p-5 sm:p-6">
            <h2 className="text-lg sm:text-xl font-bold text-white text-center mb-1">
              Escolha seu plano
            </h2>
            <p className="text-xs text-[#808080] text-center mb-5">
              Pagamento único · Acesso vitalício · Sem mensalidade
            </p>

            <div className="space-y-3">
              {PLANS.map(plan => {
                const Icon = plan.icon
                return (
                  <div
                    key={plan.id}
                    className={cn(
                      'relative rounded-xl border p-4 transition-all',
                      plan.highlight
                        ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5'
                        : 'border-white/10 bg-white/[0.02]'
                    )}
                  >
                    {plan.highlight && (
                      <span className="absolute -top-2.5 left-4 text-[10px] font-bold uppercase tracking-widest bg-[hsl(var(--primary))] text-black px-2.5 py-0.5 rounded-full">
                        {plan.subtitle}
                      </span>
                    )}

                    <div className="flex items-start gap-3">
                      <div className={cn(
                        'h-10 w-10 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
                        plan.highlight ? 'bg-[hsl(var(--primary))]/15' : 'bg-white/5'
                      )}>
                        <Icon className={cn(
                          'h-5 w-5',
                          plan.highlight ? 'text-[hsl(var(--primary))]' : 'text-[#b3b3b3]'
                        )} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2 mb-1">
                          <h3 className="text-sm font-bold text-white">{plan.name}</h3>
                          <div className="text-right shrink-0">
                            <span className="text-base font-extrabold text-white">R${plan.price}</span>
                            <span className="text-[10px] text-[#808080] line-through ml-1.5">R${plan.oldPrice}</span>
                          </div>
                        </div>

                        {!plan.highlight && (
                          <p className="text-[10px] text-[#808080] mb-2">{plan.subtitle}</p>
                        )}

                        <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3">
                          {plan.features.map(f => (
                            <span key={f} className="flex items-center gap-1 text-[11px] text-[#b3b3b3]">
                              <Check className="h-3 w-3 text-green-500 shrink-0" />
                              {f}
                            </span>
                          ))}
                        </div>

                        <button
                          onClick={() => openCheckout(plan.url, plan.name, +plan.price.replace(',', '.'))}
                          className={cn(
                            'w-full h-10 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98]',
                            plan.highlight
                              ? 'bg-[hsl(var(--primary))] text-black hover:brightness-110 shadow-lg shadow-[hsl(var(--primary))]/20'
                              : 'bg-white/10 text-white hover:bg-white/15'
                          )}
                        >
                          Garantir Acesso
                          <ArrowRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="flex items-center justify-center gap-1.5 mt-4">
              {[...Array(5)].map((_, i) => (
                <svg key={i} className="h-3 w-3 text-amber-400 fill-amber-400" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
              <span className="text-[11px] text-[#808080] ml-1">4.9 — usado por 3.000+ músicos</span>
            </div>

            <a
              href={SALES_PAGE}
              className="block text-center text-[11px] text-[#535353] hover:text-[#808080] mt-3 transition-colors"
            >
              Ver mais detalhes no site
            </a>

            <div className="flex items-center justify-center gap-2 mt-3 pt-3 border-t border-white/5">
              <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
              <span className="text-[11px] text-[#808080]">Garantia 30 dias · Suporte dedicado · Atualizações grátis</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />

      <div className="relative w-full max-w-md rounded-2xl bg-gradient-to-b from-[#1a1a1a] to-[#0d0d0d] border border-white/10 shadow-2xl overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-[hsl(var(--primary))] via-amber-400 to-[hsl(var(--primary))]" />

        <div className="p-6 sm:p-8">
          <div className="flex justify-center mb-5">
            <div className="h-16 w-16 rounded-full bg-[hsl(var(--primary))]/10 flex items-center justify-center">
              <Music className="h-8 w-8 text-[hsl(var(--primary))]" />
            </div>
          </div>

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

          <button
            onClick={() => {
              setShowPlans(true)
              fireFbEvent('ViewPlans', { source: 'trial_modal' })
            }}
            className="w-full h-14 rounded-xl bg-[hsl(var(--primary))] hover:brightness-110 active:scale-[0.98] text-black font-bold text-base flex items-center justify-center gap-2 transition-all shadow-lg shadow-[hsl(var(--primary))]/20"
          >
            QUERO ACESSO COMPLETO
            <ArrowRight className="h-5 w-5" />
          </button>

          <div className="flex items-center justify-center gap-1.5 mt-3 mb-4">
            {[...Array(5)].map((_, i) => (
              <svg key={i} className="h-3.5 w-3.5 text-amber-400 fill-amber-400" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            ))}
            <span className="text-[11px] text-[#808080] ml-1">4.9 — usado por 3.000+ músicos</span>
          </div>

          {canExtend && (
            <button
              onClick={handleExtend}
              className="w-full h-10 rounded-lg bg-white/5 hover:bg-white/10 text-[#b3b3b3] hover:text-white text-xs font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <Clock className="h-3.5 w-3.5" />
              Quero mais 2 minutos grátis
            </button>
          )}

          <a
            href={SALES_PAGE}
            className="block text-center text-[11px] text-[#535353] hover:text-[#808080] mt-3 transition-colors"
          >
            Ver detalhes e planos
          </a>

          <div className="flex items-center justify-center gap-2 mt-4 pt-4 border-t border-white/5">
            <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
            <span className="text-[11px] text-[#808080]">Acesso vitalício · Suporte dedicado · Atualizações grátis</span>
          </div>
        </div>
      </div>
    </div>
  )
}

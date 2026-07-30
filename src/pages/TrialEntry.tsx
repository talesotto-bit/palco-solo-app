import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import * as Tone from 'tone'
import { useTrialStore } from '@/store/trialStore'
import { useCatalogStore } from '@/store/catalogStore'
import { Play, Music, Sliders, Mic2, Zap } from 'lucide-react'

export default function TrialEntry() {
  const navigate = useNavigate()
  const startTrial = useTrialStore(s => s.startTrial)
  const isTrialMode = useTrialStore(s => s.isTrialMode)
  const expired = useTrialStore(s => s.expired)
  const loadCatalog = useCatalogStore(s => s.loadCatalog)
  const catalogTracks = useCatalogStore(s => s.tracks)

  useEffect(() => {
    if (catalogTracks.length === 0) loadCatalog()
  }, [])

  useEffect(() => {
    if (isTrialMode && !expired) {
      navigate('/app/library', { replace: true })
    }
  }, [isTrialMode, expired, navigate])

  const handleStart = async () => {
    // Unlock AudioContext on this user gesture — critical for mobile playback
    try {
      await Tone.start()
      const ctx = Tone.getContext().rawContext as AudioContext
      if (ctx.state === 'suspended') await ctx.resume()
    } catch {}

    startTrial()
    if (typeof window !== 'undefined' && (window as any).fbq) {
      (window as any).fbq('track', 'StartTrial')
    }
    navigate('/app/library', { replace: true })
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-[#0d0d0d] to-black flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm text-center">
        {/* Logo/Brand */}
        <div className="mb-8">
          <div className="h-20 w-20 rounded-2xl bg-[hsl(var(--primary))]/10 flex items-center justify-center mx-auto mb-4">
            <Music className="h-10 w-10 text-[hsl(var(--primary))]" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Power Tom</h1>
          <p className="text-sm text-[#b3b3b3]">Teste grátis — 3 minutos, todas as funcionalidades</p>
        </div>

        {/* What they get */}
        <div className="space-y-3 mb-8 text-left">
          {[
            { icon: Play, text: 'Escolha qualquer música do catálogo' },
            { icon: Sliders, text: 'Use o mixer — remova vocais, bateria, baixo' },
            { icon: Mic2, text: 'Altere tom e velocidade em tempo real' },
            { icon: Zap, text: 'Veja a letra sincronizada na tela' },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                <Icon className="h-4 w-4 text-[hsl(var(--primary))]" />
              </div>
              <span className="text-sm text-white/80">{text}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <button
          onClick={handleStart}
          className="w-full h-14 rounded-xl bg-[hsl(var(--primary))] hover:brightness-110 active:scale-[0.98] text-black font-bold text-lg flex items-center justify-center gap-2 transition-all shadow-lg shadow-[hsl(var(--primary))]/25"
        >
          <Play className="h-5 w-5 fill-current" />
          Começar teste grátis
        </button>

        <p className="text-[11px] text-[#535353] mt-3">
          Sem cadastro · Sem cartão · Acesso imediato
        </p>

        {/* Already have account */}
        <button
          onClick={() => navigate('/login')}
          className="mt-6 text-xs text-[#808080] hover:text-white transition-colors"
        >
          Já tenho uma conta →
        </button>
      </div>
    </div>
  )
}

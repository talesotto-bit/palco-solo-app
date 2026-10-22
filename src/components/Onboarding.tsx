import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layers, Gauge, Mic2, ChevronRight, Guitar } from 'lucide-react'
import { InstrumentPicker } from '@/components/InstrumentPicker'
import { cn } from '@/lib/utils'

const KEY = 'onboarding-v1'

const STEPS = [
  {
    icon: Layers,
    title: 'A banda inteira no seu celular',
    text: 'Escolha qualquer música da biblioteca e ligue ou desligue cada instrumento no mixer. Toque junto com o playback do seu jeito.',
  },
  {
    icon: Gauge,
    title: 'No tom da sua voz',
    text: 'Suba ou desça de ½ em ½ tom e ajuste a velocidade sem mudar o tom. A letra e a cifra acompanham. Tudo fica salvo em cada música.',
  },
  {
    icon: Guitar,
    title: 'Você toca algum instrumento?',
    text: 'Marque o que você toca ao vivo. Esses instrumentos já abrem desligados em todas as músicas (dá para ligar quando quiser).',
    picker: true,
  },
  {
    icon: Mic2,
    title: 'Monte o show e suba no palco',
    text: 'Em Shows, monte o repertório (ou use um pronto). No Palco, a letra fica grande e o app passa sozinho para a próxima música.',
  },
]

export function shouldShowOnboarding() {
  try { return !localStorage.getItem(KEY) } catch { return false }
}

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0)
  const navigate = useNavigate()
  const finish = (goShows = false) => {
    try { localStorage.setItem(KEY, String(Date.now())) } catch {}
    onDone()
    if (goShows) navigate('/app/shows')
  }
  const step = STEPS[i]
  const Icon = step.icon
  const last = i === STEPS.length - 1

  return (
    <div className="fixed inset-0 z-[90] bg-black/90 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-3xl bg-gradient-to-b from-[#1f2a22] to-[#141414] border border-white/10 p-6" style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="flex justify-between items-center">
          <div className="flex gap-1.5">
            {STEPS.map((_, k) => <span key={k} className={cn('h-1.5 rounded-full transition-all', k === i ? 'w-6 bg-[hsl(var(--primary))]' : 'w-1.5 bg-white/25')} />)}
          </div>
          <button onClick={() => finish()} className="text-sm text-white/50 px-2 py-1">Pular</button>
        </div>
        <div className="mt-6 h-14 w-14 rounded-2xl bg-[hsl(var(--primary))]/15 flex items-center justify-center">
          <Icon className="h-7 w-7 text-[hsl(var(--primary))]" />
        </div>
        <h2 className="mt-4 text-2xl font-black leading-tight">{step.title}</h2>
        <p className="mt-2 text-[15px] text-white/75 leading-relaxed">{step.text}</p>
        {'picker' in step && step.picker && <div className="mt-4"><InstrumentPicker /></div>}
        <div className="mt-6 flex gap-2">
          {last ? (
            <>
              <button onClick={() => finish(true)} className="flex-1 h-12 rounded-full bg-[hsl(var(--primary))] text-black font-bold">Montar meu show</button>
              <button onClick={() => finish()} className="h-12 px-5 rounded-full bg-white/10 font-semibold">Explorar</button>
            </>
          ) : (
            <button onClick={() => setI(i + 1)} className="flex-1 h-12 rounded-full bg-white text-black font-bold flex items-center justify-center gap-1">Próximo <ChevronRight className="h-5 w-5" /></button>
          )}
        </div>
      </div>
    </div>
  )
}

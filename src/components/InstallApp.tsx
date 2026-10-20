import { useState } from 'react'
import { Download, Share, X, CheckCircle2, Smartphone } from 'lucide-react'
import { useInstallStore, promptInstall, isIOS } from '@/lib/installPrompt'

const DISMISS_KEY = 'install-banner-dismissed-at'
const DISMISS_DAYS = 7

function recentlyDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) || 0)
    return Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000
  } catch {
    return false
  }
}

function IOSSteps() {
  return (
    <span>
      No Safari, toque em <Share className="inline h-3.5 w-3.5 -mt-0.5" /> <strong>Compartilhar</strong> e depois em{' '}
      <strong>Adicionar à Tela de Início</strong>.
    </span>
  )
}

/** Faixa no topo (só celular), some depois de instalado ou fechado */
export function InstallBanner() {
  const deferred = useInstallStore(s => s.deferred)
  const installed = useInstallStore(s => s.installed)
  const [hidden, setHidden] = useState(recentlyDismissed)
  const [showIOS, setShowIOS] = useState(false)

  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  if (installed || hidden || !mobile || (!deferred && !isIOS())) return null

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch {}
    setHidden(true)
  }

  return (
    <div className="flex items-center gap-3 bg-[#1351AA] px-4 py-2.5 text-white text-xs">
      <Smartphone className="h-4 w-4 shrink-0" />
      <p className="flex-1 leading-snug">
        {showIOS ? <IOSSteps /> : <>Instale o app no seu celular: abre direto da tela inicial e toca até sem internet.</>}
      </p>
      {!showIOS && (
        <button
          onClick={async () => { if (!(await promptInstall())) setShowIOS(true) }}
          className="shrink-0 rounded-full bg-white px-3 py-1.5 font-bold text-[#1351AA]"
        >
          Instalar
        </button>
      )}
      <button onClick={dismiss} aria-label="Fechar" className="shrink-0 text-white/80 hover:text-white">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

/** Cartão nas Configurações, sempre disponível */
export function InstallCard() {
  const deferred = useInstallStore(s => s.deferred)
  const installed = useInstallStore(s => s.installed)
  const [showIOS, setShowIOS] = useState(false)

  if (installed) {
    return (
      <div className="flex items-center gap-3 p-4">
        <CheckCircle2 className="h-4 w-4 text-[hsl(var(--primary))]" />
        <p className="text-sm text-foreground">App instalado neste aparelho.</p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-start gap-3">
        <Download className="h-4 w-4 text-muted-foreground mt-0.5" />
        <div>
          <p className="text-sm font-medium text-foreground">Instalar na tela inicial</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Funciona no Android, iPhone e computador. As músicas que você já abriu tocam sem internet.
          </p>
        </div>
      </div>
      {showIOS || (!deferred && isIOS()) ? (
        <p className="text-xs text-foreground bg-white/5 rounded-lg p-3 leading-relaxed"><IOSSteps /></p>
      ) : deferred ? (
        <button
          onClick={async () => { if (!(await promptInstall())) setShowIOS(true) }}
          className="w-full h-9 rounded-full bg-[hsl(var(--primary))] text-black text-sm font-bold"
        >
          Instalar app
        </button>
      ) : (
        <p className="text-xs text-muted-foreground bg-white/5 rounded-lg p-3 leading-relaxed">
          Abra este link no Chrome (Android ou computador) ou no Safari (iPhone) para instalar.
        </p>
      )}
    </div>
  )
}

/**
 * Instalação do app na tela inicial.
 * Android/Chrome/desktop: guarda o evento beforeinstallprompt para abrir o
 * instalador nativo num botão. iPhone/iPad: não há instalador; mostramos o
 * passo a passo (Compartilhar → Adicionar à Tela de Início).
 */
import { create } from 'zustand'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface InstallState {
  deferred: BeforeInstallPromptEvent | null
  installed: boolean
}

export const useInstallStore = create<InstallState>(() => ({
  deferred: null,
  installed: false,
}))

export function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true
}

export function isIOS(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/** Chamar uma vez, cedo (main.tsx), para não perder o evento */
export function setupInstallPrompt() {
  useInstallStore.setState({ installed: isStandalone() })
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    useInstallStore.setState({ deferred: e as BeforeInstallPromptEvent })
  })
  window.addEventListener('appinstalled', () => {
    useInstallStore.setState({ deferred: null, installed: true })
  })
}

/** Abre o instalador nativo. Retorna false se não houver (ex.: iPhone). */
export async function promptInstall(): Promise<boolean> {
  const { deferred } = useInstallStore.getState()
  if (!deferred) return false
  await deferred.prompt()
  const { outcome } = await deferred.userChoice
  useInstallStore.setState({ deferred: null, installed: outcome === 'accepted' })
  return true
}

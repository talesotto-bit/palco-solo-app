import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SheetProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  /** full: ocupa a tela toda (listas longas); bottom: painel que sobe de baixo */
  variant?: 'full' | 'bottom'
  footer?: ReactNode
}

/** Painel simples para celular: fecha no X, no fundo escuro ou no botão voltar do Android */
export function Sheet({ open, onClose, title, children, variant = 'bottom', footer }: SheetProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    // botão "voltar" do celular fecha o painel em vez de sair da tela
    history.pushState({ sheet: true }, '')
    const onPop = () => onClose()
    window.addEventListener('keydown', onKey)
    window.addEventListener('popstate', onPop)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('popstate', onPop)
      document.body.style.overflow = prev
      if (history.state?.sheet) history.back()
    }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 animate-fade-in" onClick={onClose} />
      <div className={cn(
        'relative flex flex-col bg-[#161616] text-white shadow-2xl',
        variant === 'full' ? 'h-full' : 'max-h-[85dvh] rounded-t-2xl',
      )} style={{ paddingTop: variant === 'full' ? 'env(safe-area-inset-top, 0px)' : undefined }}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 shrink-0">
          <div className="flex-1 min-w-0 text-base font-bold truncate">{title}</div>
          <button onClick={onClose} aria-label="Fechar" className="h-10 w-10 -mr-2 flex items-center justify-center rounded-full active:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-white/10 px-4 py-3" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}>{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  )
}

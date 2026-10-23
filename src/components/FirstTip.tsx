import { useState } from 'react'
import { Lightbulb, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Dica curta que aparece só na primeira vez em cada tela */
export function FirstTip({ id, title, items, className }: { id: string; title: string; items: string[]; className?: string }) {
  const key = `tip-${id}`
  const [show, setShow] = useState(() => { try { return !localStorage.getItem(key) } catch { return false } })
  if (!show) return null
  const close = () => { try { localStorage.setItem(key, '1') } catch {} ; setShow(false) }
  return (
    <div className={cn('relative rounded-2xl border border-amber-400/25 bg-amber-400/10 p-3.5 pr-10 animate-fade-in', className)}>
      <button onClick={close} aria-label="Fechar dica" className="absolute right-2 top-2 h-8 w-8 flex items-center justify-center rounded-full text-amber-100/70"><X className="h-4 w-4" /></button>
      <p className="flex items-center gap-1.5 text-sm font-bold text-amber-100"><Lightbulb className="h-4 w-4" /> {title}</p>
      <ul className="mt-1.5 space-y-1 text-[13px] text-amber-50/85 list-disc pl-5">
        {items.map(i => <li key={i}>{i}</li>)}
      </ul>
      <button onClick={close} className="mt-2.5 h-8 px-3 rounded-full bg-amber-400 text-black text-xs font-bold">Entendi</button>
    </div>
  )
}

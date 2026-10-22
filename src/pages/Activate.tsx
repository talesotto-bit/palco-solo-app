import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CheckCircle2, XCircle } from 'lucide-react'
import { useUnlocks } from '@/lib/unlocks'

const DEST: Record<string, { path: string; label: string }> = {
  pedidos: { path: '/app/pedidos', label: 'Pedidos e Gorjeta via Pix' },
}

/** Link do e-mail de compra: app.powertom.com.br/ativar/<código> */
export default function Activate() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const activate = useUnlocks(s => s.activate)
  const [feature, setFeature] = useState<string | null | undefined>(undefined)

  useEffect(() => { setFeature(activate(code)) }, [code, activate])

  return (
    <div className="min-h-dvh bg-[#0d0d0d] text-white flex items-center justify-center p-6 text-center">
      {feature === undefined ? null : feature ? (
        <div className="max-w-sm">
          <CheckCircle2 className="h-14 w-14 mx-auto text-[hsl(var(--primary))]" />
          <h1 className="mt-3 text-2xl font-black">{DEST[feature]?.label} ativado!</h1>
          <p className="mt-2 text-white/70">Já está liberado neste aparelho. Se usar outro celular, abra o link do e-mail nele também.</p>
          <button onClick={() => navigate(DEST[feature]?.path || '/app/library', { replace: true })} className="mt-6 w-full h-12 rounded-full bg-[hsl(var(--primary))] text-black font-bold">Configurar agora</button>
        </div>
      ) : (
        <div className="max-w-sm">
          <XCircle className="h-14 w-14 mx-auto text-red-400" />
          <h1 className="mt-3 text-2xl font-black">Código não reconhecido</h1>
          <p className="mt-2 text-white/70">Abra o link exatamente como chegou no e-mail da compra. Se não funcionar, fale com o suporte.</p>
          <button onClick={() => navigate('/app/library', { replace: true })} className="mt-6 w-full h-12 rounded-full bg-white/10 font-bold">Ir para o app</button>
        </div>
      )}
    </div>
  )
}

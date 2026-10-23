/** Página do público (abre pelo QR do músico). Não carrega o app: abre rápido no 4G do bar. */
import { useEffect, useState } from 'react'
import { Music2 } from 'lucide-react'
import { decodeRequestPage, type RequestPage } from '@/lib/requestLink'
import { RequestView } from '@/components/pedidos/RequestView'

export default function PublicRequest() {
  const [page, setPage] = useState<RequestPage | null | undefined>(undefined)
  useEffect(() => {
    const load = () => void decodeRequestPage(location.hash.slice(1)).then(setPage)
    load()
    window.addEventListener('hashchange', load)
    return () => window.removeEventListener('hashchange', load)
  }, [])
  useEffect(() => { if (page) document.title = `${page.n} · Peça sua música` }, [page])

  if (page === undefined) return <div className="min-h-dvh bg-black" />
  if (!page) {
    return (
      <div className="min-h-dvh bg-[#0d0d0d] text-white flex items-center justify-center p-6 text-center">
        <div><Music2 className="h-10 w-10 mx-auto text-white/40" /><p className="mt-3 text-lg font-semibold">Link de pedidos inválido</p><p className="text-white/50 text-sm mt-1">Peça ao artista para mostrar o QR code de novo.</p></div>
      </div>
    )
  }
  return <div className="min-h-dvh"><RequestView page={page} /></div>
}

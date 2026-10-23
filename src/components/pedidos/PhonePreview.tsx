import { useEffect, useRef, useState } from 'react'
import type { RequestPage } from '@/lib/requestLink'
import { RequestView } from './RequestView'

/** Celular desenhado com a página do público funcionando dentro (prévia ao vivo, interativa) */
export function PhonePreview({ page, width = 250 }: { page: RequestPage; width?: number }) {
  const W = 390, H = 780
  const scale = width / W
  const box = useRef<HTMLDivElement>(null)
  const [key, setKey] = useState(0)
  useEffect(() => { setKey(k => k + 1) }, [page.t])
  return (
    <div className="relative mx-auto" style={{ width, height: H * scale + 16 }}>
      <div className="absolute inset-0 rounded-[36px] bg-[#0a0a0a] shadow-[0_30px_80px_rgba(0,0,0,.6)] ring-1 ring-white/15" />
      <div className="absolute left-1/2 top-[8px] z-10 h-[18px] w-[78px] -translate-x-1/2 rounded-full bg-black" />
      <div ref={box} className="absolute overflow-hidden rounded-[30px]" style={{ left: 8, top: 8, width: width - 16, height: H * scale }}>
        <div className="overflow-y-auto no-scrollbar" style={{ width: W, height: H, transform: `scale(${(width - 16) / W})`, transformOrigin: 'top left' }}>
          <RequestView key={key} page={page} preview />
        </div>
      </div>
    </div>
  )
}

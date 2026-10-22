import { useMemo } from 'react'
import qrcode from 'qrcode-generator'

/** QR code em SVG (nítido em qualquer tamanho, inclusive impresso) */
export function QRCode({ value, className, ecc = 'M' }: { value: string; className?: string; ecc?: 'L' | 'M' | 'Q' | 'H' }) {
  const svg = useMemo(() => {
    const qr = qrcode(0, ecc)
    qr.addData(value)
    qr.make()
    return qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true })
  }, [value, ecc])
  return <div className={className} style={{ background: '#fff', lineHeight: 0 }} dangerouslySetInnerHTML={{ __html: svg }} />
}

import { QRCode } from '@/components/QRCode'

/** QR de pedidos em tela cheia (celular no pedestal, virado para o público) */
export function StageQR({ link, artist, onClose }: { link: string; artist: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[95] bg-white text-black flex flex-col items-center justify-center p-6" onClick={onClose}>
      <p className="text-sm font-bold uppercase tracking-[0.2em] text-black/50">Peça sua música</p>
      <p className="text-3xl font-black text-center mt-1">{artist}</p>
      <QRCode value={link} ecc="L" className="mt-5 w-[min(82vw,70vh)]" />
      <p className="mt-4 text-lg font-bold text-center">Aponte a câmera · pedido e gorjeta via Pix</p>
      <p className="mt-6 text-xs text-black/40">Toque para fechar</p>
    </div>
  )
}

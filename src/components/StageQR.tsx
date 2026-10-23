import { QRCode } from '@/components/QRCode'
import { themeOf } from '@/components/pedidos/themes'

/** QR de pedidos em tela cheia (celular no pedestal, virado para o público), com brilho animado */
export function StageQR({ link, artist, theme, onClose }: { link: string; artist: string; theme?: number; onClose: () => void }) {
  const th = themeOf(theme)
  return (
    <div className="fixed inset-0 z-[95] flex flex-col items-center justify-center p-6 text-white overflow-hidden" onClick={onClose}
      style={{ background: `radial-gradient(circle at 20% 10%, ${th.accent}88, transparent 55%), radial-gradient(circle at 90% 60%, ${th.accent2}77, transparent 55%), ${th.bg}` }}>
      <span className="inline-flex items-center gap-2 rounded-full bg-red-500/90 px-3 py-1 text-xs font-black uppercase tracking-widest">
        <span className="h-2 w-2 rounded-full bg-white animate-pulse" /> Ao vivo
      </span>
      <p className="mt-4 text-sm font-bold uppercase tracking-[0.3em] text-white/80">Peça sua música</p>
      <p className="mt-1 text-4xl font-black text-center leading-tight">{artist}</p>
      <div className="mt-6 rounded-[28px] bg-white p-4 animate-qr-glow" style={{ ['--glow' as any]: th.accent }}>
        <QRCode value={link} ecc="L" className="w-[min(72vw,56vh)]" />
      </div>
      <p className="mt-6 text-2xl font-black text-center">Aponte a câmera 📷</p>
      <p className="mt-1 text-white/80 text-center">Pedido no WhatsApp e gorjeta via Pix</p>
      <p className="absolute bottom-5 text-xs text-white/40">Toque para fechar</p>
    </div>
  )
}

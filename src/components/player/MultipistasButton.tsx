/**
 * "Baixar pistas" no player. Quem tem o Pacote Multipistas baixa o .zip na hora;
 * quem não tem vê o que ganha e o link de compra (só aparece quando o link estiver configurado).
 */
import { useState } from 'react'
import { FolderDown, Loader2, Check, SlidersHorizontal, Laptop, Music4, Infinity as InfinityIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Sheet } from '@/components/ui/sheet'
import { useUnlocks, CHECKOUT, PRICE } from '@/lib/unlocks'
import { downloadStemsZip } from '@/lib/multipistas'
import type { Track } from '@/types/track'

export function MultipistasButton({ track }: { track: Track }) {
  const unlocked = useUnlocks(s => s.features.includes('multipistas'))
  const [offer, setOffer] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  if (!unlocked && !CHECKOUT.multipistas) return null
  if (track.id.startsWith('local-')) return null

  const download = async () => {
    if (!unlocked) { setOffer(true); return }
    if (progress) return
    setProgress({ done: 0, total: track.stems.length })
    try {
      const n = await downloadStemsZip(track, (done, total) => setProgress({ done, total }))
      toast.success(`${n} pistas baixadas. Procure o .zip na pasta Downloads.`)
    } catch {
      toast.error('Não consegui baixar todas as pistas. Confira a internet e tente de novo.')
    } finally { setProgress(null) }
  }

  return (
    <>
      <button onClick={download} disabled={!!progress}
        className="flex items-center gap-1.5 h-9 rounded-full px-3 text-xs font-semibold bg-white/[0.07] text-[#cfcfcf] shrink-0 disabled:opacity-60">
        {progress ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderDown className="h-4 w-4" />}
        {progress ? `Baixando ${progress.done}/${progress.total}` : 'Baixar pistas'}
      </button>
      <Sheet open={offer} onClose={() => setOffer(false)} title="Pacote Multipistas">
        <div className="p-5" style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }}>
          <p className="text-xl font-black leading-tight">Leve a banda para a sua mesa, notebook ou app de playback</p>
          <p className="mt-2 text-sm text-white/65">Baixe as pistas separadas desta e de todas as músicas da biblioteca, prontas para arrastar.</p>
          <ul className="mt-4 space-y-2.5 text-[14px]">
            {[
              [SlidersHorizontal, 'Cada instrumento em um arquivo: bateria, baixo, teclado, voz guia, click...'],
              [Laptop, 'Funciona no Ableton, Reaper, mesa digital, Multitracks e outros apps'],
              [Music4, 'Todas as músicas da biblioteca, quantas vezes quiser'],
              [InfinityIcon, 'Pagamento único, sem mensalidade'],
            ].map(([Icon, t]: any) => <li key={t} className="flex gap-2.5"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--primary))]" /><span>{t}</span></li>)}
          </ul>
          <p className="mt-4 rounded-xl bg-white/[0.06] px-3 py-2 text-[13px] text-white/75">Um VS avulso costuma custar de R$ 30 a R$ 100. Aqui você leva todos.</p>
          <a href={CHECKOUT.multipistas} target="_blank" rel="noopener noreferrer"
            className="mt-5 flex h-14 items-center justify-center gap-2 rounded-full bg-[hsl(var(--primary))] text-lg font-black text-black">
            <Check className="h-5 w-5" /> Quero por {PRICE.multipistas}
          </a>
          <p className="mt-3 text-center text-xs text-white/45">Já comprou? Abra o link de ativação que chegou no seu e-mail.</p>
        </div>
      </Sheet>
    </>
  )
}

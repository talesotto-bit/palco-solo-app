import { useState } from 'react'
import { Headphones, Repeat, Timer, HardDrive, Sparkles, Trash2, Info, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { InstallCard } from '@/components/InstallApp'
import { useStageSettings } from '@/store/stageSettingsStore'
import { InstrumentPicker } from '@/components/InstrumentPicker'
import { usePlayerStore } from '@/store/playerStore'
import { offlineStats, clearOffline } from '@/lib/offlineAudio'
import { cn } from '@/lib/utils'

const GAPS = [0, 3, 5, 10, 15]

function Row({ icon: Icon, title, desc, children }: { icon: any; title: string; desc?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 p-4">
      <div className="flex items-start gap-3 min-w-0">
        <Icon className="h-5 w-5 text-[#9a9a9a] mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">{title}</p>
          {desc && <p className="text-xs text-[#9a9a9a] mt-0.5">{desc}</p>}
        </div>
      </div>
      {children}
    </div>
  )
}

export default function Settings() {
  const st = useStageSettings()
  const togglePrecount = usePlayerStore(s => s.togglePrecount)
  const [stats, setStats] = useState(offlineStats)
  const mb = (b: number) => (b / 1e6 >= 1000 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`)

  return (
    <div className="max-w-xl mx-auto px-4 md:px-6 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-sm text-[#9a9a9a] mt-1">Tudo fica salvo neste aparelho.</p>
      </div>

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[#8a8a8a]">O que você toca ao vivo</h2>
        <div className="rounded-2xl bg-white/[0.05] p-4">
          <p className="text-xs text-[#9a9a9a] mb-3">Esses instrumentos já abrem desligados no mixer de todas as músicas. Músicas que você já ajustou ficam como estão.</p>
          <InstrumentPicker />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[#8a8a8a]">Palco</h2>
        <div className="rounded-2xl bg-white/[0.05] divide-y divide-white/5">
          <Row icon={Repeat} title="Seguir para a próxima música" desc="No fim de cada música, o show continua sozinho">
            <Switch checked={st.autoAdvance} onCheckedChange={v => st.set({ autoAdvance: v })} />
          </Row>
          {st.autoAdvance && (
            <div className="p-4">
              <p className="text-sm font-semibold">Pausa entre as músicas</p>
              <p className="text-xs text-[#9a9a9a]">Tempo para falar com o público. Dá para tocar já ou segurar na hora.</p>
              <div className="mt-2 flex gap-1.5">
                {GAPS.map(g => (
                  <button key={g} onClick={() => st.set({ advanceGap: g })}
                    className={cn('h-9 flex-1 rounded-full text-sm font-bold', st.advanceGap === g ? 'bg-[hsl(var(--primary))] text-black' : 'bg-white/[0.07]')}>
                    {g === 0 ? 'Direto' : `${g}s`}
                  </button>
                ))}
              </div>
            </div>
          )}
          <Row icon={Timer} title="Contagem antes de começar" desc="4 bipes no andamento da música (quando o app sabe o BPM)">
            <Switch checked={st.precount} onCheckedChange={() => togglePrecount()} />
          </Row>
          <Row icon={Headphones} title="Pedal Bluetooth ou teclado" desc="Espaço: tocar/pausar · →: próxima · ←: anterior. Funciona no Modo Palco." />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[#8a8a8a]">Músicas guardadas no aparelho</h2>
        <div className="rounded-2xl bg-white/[0.05] divide-y divide-white/5">
          <Row icon={HardDrive} title={`${mb(stats.bytes)} de ${mb(stats.maxBytes)}`} desc={`${stats.files} arquivo(s). As músicas abertas ficam guardadas para tocar sem internet; as mais antigas saem sozinhas quando enche.`} />
          <div className="p-4">
            <div className="h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-[hsl(var(--primary))]" style={{ width: `${Math.min(100, (stats.bytes / stats.maxBytes) * 100)}%` }} /></div>
            <button onClick={async () => { if (!confirm('Apagar as músicas guardadas? Elas serão baixadas de novo quando você abrir.')) return; await clearOffline(); setStats(offlineStats()); toast('Espaço liberado') }}
              className="mt-3 h-10 px-4 rounded-full bg-white/[0.07] text-sm font-semibold flex items-center gap-2"><Trash2 className="h-4 w-4" /> Liberar espaço</button>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[#8a8a8a]">Recursos extras</h2>
        <a href="/app/pedidos" className="block rounded-2xl bg-white/[0.05]">
          <Row icon={Wallet} title="Pedidos e Gorjeta via Pix" desc="QR code para o público pedir música e mandar gorjeta no seu Pix" />
        </a>
      </section>

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[#8a8a8a]">App no celular</h2>
        <div className="rounded-2xl bg-white/[0.05]"><InstallCard /></div>
      </section>

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[#8a8a8a]">Ajuda</h2>
        <div className="rounded-2xl bg-white/[0.05] divide-y divide-white/5">
          <button onClick={() => { try { localStorage.removeItem('onboarding-v1') } catch {} ; location.assign('/app/library') }} className="w-full text-left">
            <Row icon={Sparkles} title="Rever as boas-vindas" desc="O passo a passo de como usar o app" />
          </button>
          <Row icon={Info} title="Dica para o show" desc="Antes de sair de casa, abra o show e toque em “Preparar para tocar sem internet”. Assim nada depende do sinal do local." />
        </div>
      </section>
    </div>
  )
}

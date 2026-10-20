import { usePlayerStore } from '@/store/playerStore'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { InstallCard } from '@/components/InstallApp'
import {
  Headphones, Music, Gauge,
} from 'lucide-react'

export default function Settings() {
  const precountEnabled = usePlayerStore(s => s.precountEnabled)
  const precountBeats = usePlayerStore(s => s.precountBeats)
  const togglePrecount = usePlayerStore(s => s.togglePrecount)

  return (
    <ScrollArea className="h-full">
      <div className="max-w-xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6 md:space-y-8">
        <div>
          <h1 className="text-xl font-bold text-foreground">Configuracoes</h1>
          <p className="text-sm text-muted-foreground mt-1">Preferencias do player</p>
        </div>

        {/* Player */}
        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Player</h2>
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Headphones className="h-4 w-4 text-muted-foreground" />
                <div>
                  <Label className="text-sm font-medium">Pre-contagem</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Toca {precountBeats} tempos antes de iniciar a musica
                  </p>
                </div>
              </div>
              <Switch checked={precountEnabled} onCheckedChange={togglePrecount} />
            </div>

            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Music className="h-4 w-4 text-muted-foreground" />
                <div>
                  <Label className="text-sm font-medium">Qualidade de pitch</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Pitch Shift (Tone.js)
                  </p>
                </div>
              </div>
              <Badge variant="success">Ativo</Badge>
            </div>

            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Gauge className="h-4 w-4 text-muted-foreground" />
                <div>
                  <Label className="text-sm font-medium">Time-stretch</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Compensação automática de pitch
                  </p>
                </div>
              </div>
              <Badge variant="warning">Beta</Badge>
            </div>
          </div>
        </section>

        {/* App */}
        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">App no celular</h2>
          <div className="rounded-xl border border-border bg-card">
            <InstallCard />
          </div>
        </section>

        {/* About */}
        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sobre</h2>
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Versao</span>
              <span className="text-foreground font-medium">1.0.0</span>
            </div>
          </div>
        </section>
      </div>
    </ScrollArea>
  )
}

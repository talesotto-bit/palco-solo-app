import { useAuthStore } from '@/store/authStore'
import { usePlayerStore } from '@/store/playerStore'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ExternalLink, Crown } from 'lucide-react'

const PLAN_LABELS: Record<string, string> = {
  none: 'Sem plano',
  basic: 'Básico',
  professional: 'Profissional',
  advanced: 'Avançado',
}

export default function Settings() {
  const user = useAuthStore(s => s.user)
  const { precountEnabled, precountBeats, togglePrecount } = usePlayerStore()

  return (
    <ScrollArea className="h-full">
      <div className="max-w-xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6 md:space-y-8">
        <div>
          <h1 className="text-xl font-bold text-foreground">Configurações</h1>
          <p className="text-sm text-muted-foreground mt-1">Preferências do player e da conta</p>
        </div>

        {/* Account */}
        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Conta</h2>
          <div className="rounded-xl border border-border bg-card p-4 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">{user?.name}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand/20 text-brand font-bold text-base">
                {user?.name.charAt(0).toUpperCase()}
              </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crown className="h-4 w-4 text-amber-400" />
                <div>
                  <p className="text-sm font-medium text-foreground">Plano atual</p>
                  <p className="text-xs text-muted-foreground">
                    {user?.plan === 'advanced' ? 'Acesso vitalício completo' : 'Acesso limitado'}
                  </p>
                </div>
              </div>
              <Badge variant={user?.plan === 'advanced' ? 'brand' : 'outline'}>
                {PLAN_LABELS[user?.plan ?? 'none']}
              </Badge>
            </div>

            {user?.plan !== 'advanced' && (
              <Button
                variant="brand"
                size="sm"
                className="w-full gap-2"
                onClick={() => window.open('https://www.palcosolo.online/#pricing', '_blank')}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Fazer upgrade para Avançado
              </Button>
            )}
          </div>
        </section>

        {/* Player */}
        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Player</h2>
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            <div className="flex items-center justify-between p-4">
              <div>
                <Label className="text-sm font-medium">Pré-contagem</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Toca {precountBeats} tempos antes de iniciar a música
                </p>
              </div>
              <Switch checked={precountEnabled} onCheckedChange={togglePrecount} />
            </div>

            <div className="flex items-center justify-between p-4">
              <div>
                <Label className="text-sm font-medium">Qualidade de pitch</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Algoritmo Phase Vocoder (Tone.js)
                </p>
              </div>
              <Badge variant="success">Ativo</Badge>
            </div>

            <div className="flex items-center justify-between p-4">
              <div>
                <Label className="text-sm font-medium">Time-stretch</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Compensação via PitchShift — upgrade para SoundTouch em breve
                </p>
              </div>
              <Badge variant="warning">Beta</Badge>
            </div>
          </div>
        </section>

        {/* About */}
        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sobre</h2>
          <div className="rounded-xl border border-border bg-card p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Versão</span>
              <span className="text-foreground font-medium">1.0.0 (MVP)</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Stack</span>
              <span className="text-foreground font-medium">React + Tone.js + Zustand</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Backend</span>
              <span className="text-foreground font-medium">Supabase (em breve)</span>
            </div>
            <Separator />
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={() => window.open('https://www.palcosolo.online/', '_blank')}
            >
              <ExternalLink className="h-3.5 w-3.5 mr-2" />
              palcosolo.online
            </Button>
          </div>
        </section>
      </div>
    </ScrollArea>
  )
}

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore, isAdmin } from '@/store/authStore'
import { usePlayerStore } from '@/store/playerStore'
import { supabase } from '@/lib/supabase'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  ExternalLink, Crown, LogOut, ShieldCheck, Loader2,
  User, Lock, Mail, Headphones, Music, Gauge,
} from 'lucide-react'
import { toast } from 'sonner'
import logoImg from '@/assets/logo.png'

const PLAN_LABELS: Record<string, string> = {
  none: 'Sem plano',
  basic: 'Pro',
  professional: 'Profissional',
  advanced: 'Avancado',
}

const PLAN_DESCRIPTIONS: Record<string, string> = {
  none: 'Sem acesso ao acervo',
  basic: 'Acesso ao acervo completo',
  professional: 'Acesso ao acervo completo + separador de pistas',
  advanced: 'Acesso vitalicio completo a todos os recursos',
}

export default function Settings() {
  const user = useAuthStore(s => s.user)
  const logout = useAuthStore(s => s.logout)
  const navigate = useNavigate()
  const admin = isAdmin(user)

  const precountEnabled = usePlayerStore(s => s.precountEnabled)
  const precountBeats = usePlayerStore(s => s.precountBeats)
  const togglePrecount = usePlayerStore(s => s.togglePrecount)

  // Edit name
  const [editingName, setEditingName] = useState(false)
  const [newName, setNewName] = useState(user?.name || '')
  const [savingName, setSavingName] = useState(false)

  // Change password
  const [changingPassword, setChangingPassword] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)

  const handleSaveName = async () => {
    const trimmed = newName.trim()
    if (!trimmed || trimmed === user?.name) {
      setEditingName(false)
      return
    }
    setSavingName(true)
    const { error } = await supabase.auth.updateUser({
      data: { name: trimmed },
    })
    if (error) {
      toast.error('Erro ao atualizar nome: ' + error.message)
    } else {
      toast.success('Nome atualizado!')
      setEditingName(false)
    }
    setSavingName(false)
  }

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast.error('A senha precisa ter pelo menos 6 caracteres')
      return
    }
    setSavingPassword(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      toast.error('Erro ao alterar senha: ' + error.message)
    } else {
      toast.success('Senha alterada com sucesso!')
      setNewPassword('')
      setChangingPassword(false)
    }
    setSavingPassword(false)
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const plan = user?.plan ?? 'none'

  return (
    <ScrollArea className="h-full">
      <div className="max-w-xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6 md:space-y-8">
        <div>
          <h1 className="text-xl font-bold text-foreground">Configuracoes</h1>
          <p className="text-sm text-muted-foreground mt-1">Preferencias do player e da conta</p>
        </div>

        {/* Account */}
        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Conta</h2>
          <div className="rounded-xl border border-border bg-card p-4 space-y-4">
            {/* Profile */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand/20 text-brand font-bold text-lg">
                  {user?.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  {editingName ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                        autoFocus
                        className="h-8 rounded-md bg-background px-3 text-sm text-foreground border border-border outline-none focus:border-brand transition flex-1 min-w-0"
                      />
                      <Button
                        size="sm"
                        variant="brand"
                        onClick={handleSaveName}
                        disabled={savingName}
                        className="h-8 px-3 text-xs"
                      >
                        {savingName ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Salvar'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setEditingName(false); setNewName(user?.name || '') }}
                        className="h-8 px-2 text-xs"
                      >
                        Cancelar
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">{user?.name}</p>
                      {admin && (
                        <Badge variant="brand" className="text-[10px] gap-1">
                          <ShieldCheck className="h-3 w-3" />
                          Admin
                        </Badge>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Mail className="h-3 w-3 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Edit name button */}
            {!editingName && (
              <>
                <Separator />
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setEditingName(true); setNewName(user?.name || '') }}
                    className="gap-2 text-xs text-muted-foreground"
                  >
                    <User className="h-3.5 w-3.5" />
                    Alterar nome
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setChangingPassword(!changingPassword)}
                    className="gap-2 text-xs text-muted-foreground"
                  >
                    <Lock className="h-3.5 w-3.5" />
                    Alterar senha
                  </Button>
                </div>
              </>
            )}

            {/* Change password */}
            {changingPassword && (
              <div className="space-y-3 pt-1">
                <Separator />
                <label className="text-sm font-medium text-foreground">Nova senha</label>
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleChangePassword()}
                    placeholder="Minimo 6 caracteres"
                    autoFocus
                    className="h-9 rounded-md bg-background px-3 text-sm text-foreground border border-border outline-none focus:border-brand transition flex-1"
                  />
                  <Button
                    size="sm"
                    variant="brand"
                    onClick={handleChangePassword}
                    disabled={savingPassword}
                    className="h-9 px-4 text-xs"
                  >
                    {savingPassword ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Salvar'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setChangingPassword(false); setNewPassword('') }}
                    className="h-9 px-2 text-xs"
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Plan */}
        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Plano</h2>
          <div className="rounded-xl border border-border bg-card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Crown className="h-5 w-5 text-amber-400" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {admin ? 'Administrador' : PLAN_LABELS[plan]}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {admin ? 'Acesso completo a todos os recursos' : PLAN_DESCRIPTIONS[plan]}
                  </p>
                </div>
              </div>
              <Badge variant={plan === 'advanced' || admin ? 'brand' : 'outline'}>
                {admin ? 'Admin' : PLAN_LABELS[plan]}
              </Badge>
            </div>

            {!admin && plan !== 'advanced' && (
              <Button
                variant="brand"
                size="sm"
                className="w-full gap-2"
                onClick={() => window.open('https://www.palcosolo.online/#pricing', '_blank')}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Fazer upgrade para Avancado
              </Button>
            )}
          </div>
        </section>

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
                    Algoritmo Phase Vocoder (Tone.js)
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
                    Compensacao via PitchShift
                  </p>
                </div>
              </div>
              <Badge variant="warning">Beta</Badge>
            </div>
          </div>
        </section>

        {/* About */}
        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sobre</h2>
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center gap-3">
              <img src={logoImg} alt="PowerTom" className="h-10 w-10 rounded-full object-cover" />
              <div>
                <p className="text-sm font-semibold text-foreground">Palco Solo</p>
                <p className="text-xs text-muted-foreground">by PowerTom</p>
              </div>
            </div>

            <Separator />

            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Versao</span>
              <span className="text-foreground font-medium">1.0.0</span>
            </div>

            <Separator />

            <div className="space-y-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2 text-muted-foreground"
                onClick={() => window.open('https://www.palcosolo.online/', '_blank')}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                palcosolo.online
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2 text-muted-foreground"
                onClick={() => window.open('https://www.instagram.com/powertom', '_blank')}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                @powertom no Instagram
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2 text-muted-foreground"
                onClick={() => window.open('mailto:suporte@powertom.com.br', '_blank')}
              >
                <Mail className="h-3.5 w-3.5" />
                suporte@powertom.com.br
              </Button>
            </div>
          </div>
        </section>

        {/* Logout */}
        <Button
          variant="ghost"
          className="w-full gap-2 text-red-400 hover:text-red-300 hover:bg-red-400/10"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          Sair da conta
        </Button>

        <p className="text-center text-[10px] text-muted-foreground pb-4">
          © 2025 PowerTom · Palco Solo
        </p>
      </div>
    </ScrollArea>
  )
}

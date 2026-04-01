import { useState, useEffect, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore, isAdmin, type PlanType } from '@/store/authStore'
import { supabase } from '@/lib/supabase'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Loader2, UserPlus, Trash2, RefreshCw, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'

interface ApprovedBuyer {
  id: number
  email: string
  plan: PlanType
  created_at: string
}

const PLAN_OPTIONS: { value: PlanType; label: string }[] = [
  { value: 'basic', label: 'Pro' },
  { value: 'professional', label: 'Profissional' },
  { value: 'advanced', label: 'Avancado' },
]

export default function Admin() {
  const user = useAuthStore(s => s.user)
  const admin = isAdmin(user)

  const [buyers, setBuyers] = useState<ApprovedBuyer[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ email: '', plan: 'basic' as PlanType })

  const fetchBuyers = useCallback(async () => {
    if (!admin) return
    setLoading(true)
    const { data, error } = await supabase
      .from('approved_buyers')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      toast.error('Erro ao carregar lista: ' + error.message)
    } else {
      setBuyers(data || [])
    }
    setLoading(false)
  }, [admin])

  useEffect(() => { fetchBuyers() }, [fetchBuyers])

  // Guard: only admin can access
  if (!admin) return <Navigate to="/app/library" replace />

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    const email = form.email.toLowerCase().trim()
    if (!email) return

    setAdding(true)
    const { error } = await supabase
      .from('approved_buyers')
      .upsert({ email, plan: form.plan }, { onConflict: 'email' })

    if (error) {
      toast.error('Erro ao adicionar: ' + error.message)
    } else {
      toast.success(`${email} adicionado como ${form.plan}`)
      setForm({ email: '', plan: 'basic' })
      fetchBuyers()
    }
    setAdding(false)
  }

  const handleDelete = async (buyer: ApprovedBuyer) => {
    if (!confirm(`Remover ${buyer.email} dos aprovados?`)) return

    const { error } = await supabase
      .from('approved_buyers')
      .delete()
      .eq('id', buyer.id)

    if (error) {
      toast.error('Erro ao remover: ' + error.message)
    } else {
      toast.success(`${buyer.email} removido`)
      fetchBuyers()
    }
  }

  const planBadgeVariant = (plan: string) => {
    if (plan === 'advanced') return 'brand' as const
    if (plan === 'professional') return 'default' as const
    return 'outline' as const
  }

  return (
    <ScrollArea className="h-full">
      <div className="max-w-2xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-[hsl(var(--primary))]" />
          <div>
            <h1 className="text-xl font-bold text-foreground">Admin</h1>
            <p className="text-sm text-muted-foreground">Gerenciar cadastros de usuarios</p>
          </div>
        </div>

        {/* Add user form */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Adicionar novo usuario
          </h2>
          <form onSubmit={handleAdd} className="rounded-xl border border-border bg-card p-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">E-mail</label>
              <input
                type="email"
                placeholder="usuario@email.com"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                required
                className="w-full h-11 rounded-md bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground border border-border outline-none focus:border-brand transition"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Plano</label>
              <div className="flex gap-2">
                {PLAN_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, plan: opt.value }))}
                    className={`flex-1 h-10 rounded-md text-sm font-medium border transition-colors ${
                      form.plan === opt.value
                        ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]'
                        : 'border-border text-muted-foreground hover:border-white/30'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <Button type="submit" variant="brand" className="w-full gap-2" disabled={adding}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Adicionar usuario
            </Button>
          </form>
        </section>

        <Separator />

        {/* Buyers list */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Usuarios aprovados ({buyers.length})
            </h2>
            <Button variant="ghost" size="sm" onClick={fetchBuyers} disabled={loading} className="gap-1.5 text-xs">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : buyers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              Nenhum usuario aprovado ainda
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card divide-y divide-border">
              {buyers.map(buyer => (
                <div key={buyer.id} className="flex items-center justify-between p-3 md:p-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{buyer.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(buyer.created_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <Badge variant={planBadgeVariant(buyer.plan)}>
                      {PLAN_OPTIONS.find(p => p.value === buyer.plan)?.label || buyer.plan}
                    </Badge>
                    <button
                      onClick={() => handleDelete(buyer)}
                      className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </ScrollArea>
  )
}

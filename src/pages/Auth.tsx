import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Music2, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'

type Mode = 'login' | 'register'

export default function Auth() {
  const user = useAuthStore(s => s.user)
  const { login, register, isLoading, error, clearError } = useAuthStore()

  const [mode, setMode] = useState<Mode>('login')
  const [showPassword, setShowPassword] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '' })

  if (user) return <Navigate to="/app/library" replace />

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()
    if (mode === 'login') {
      await login(form.email, form.password)
    } else {
      await register(form.name, form.email, form.password)
    }
  }

  const switchMode = () => {
    setMode(m => m === 'login' ? 'register' : 'login')
    clearError()
    setForm({ name: '', email: '', password: '' })
  }

  const setField = (field: string, value: string) => {
    clearError()
    setForm(f => ({ ...f, [field]: value }))
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-[#1a1a1a] to-black flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--primary))]">
            <Music2 className="h-6 w-6 text-black" />
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Palco Solo</h1>
        </div>

        {/* Card */}
        <div className="rounded-lg bg-[#181818] p-8 space-y-6">
          <div className="text-center">
            <h2 className="text-xl font-bold text-white">
              {mode === 'login' ? 'Entrar na sua conta' : 'Criar conta grátis'}
            </h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div className="space-y-2">
                <label htmlFor="name" className="text-sm font-semibold text-white">
                  Nome artístico
                </label>
                <input
                  id="name"
                  type="text"
                  placeholder="Seu nome"
                  value={form.name}
                  onChange={e => setField('name', e.target.value)}
                  required
                  autoComplete="name"
                  className="w-full h-12 rounded-md bg-[#2a2a2a] px-4 text-sm text-white placeholder:text-[#535353] border border-white/10 outline-none focus:border-white/30 transition"
                />
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-semibold text-white">
                E-mail
              </label>
              <input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={form.email}
                onChange={e => setField('email', e.target.value)}
                required
                autoComplete="email"
                className="w-full h-12 rounded-md bg-[#2a2a2a] px-4 text-sm text-white placeholder:text-[#535353] border border-white/10 outline-none focus:border-white/30 transition"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-semibold text-white">
                Senha
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={form.password}
                  onChange={e => setField('password', e.target.value)}
                  required
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  className="w-full h-12 rounded-md bg-[#2a2a2a] px-4 pr-12 text-sm text-white placeholder:text-[#535353] border border-white/10 outline-none focus:border-white/30 transition"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#b3b3b3] hover:text-white transition-colors"
                  onClick={() => setShowPassword(s => !s)}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-400 text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className={cn(
                'w-full h-12 rounded-full text-sm font-bold transition-all',
                'bg-[hsl(var(--primary))] text-black hover:scale-[1.02] active:scale-[0.98]',
                isLoading && 'opacity-70 cursor-not-allowed'
              )}
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin mx-auto" />
              ) : (
                mode === 'login' ? 'Entrar' : 'Criar conta'
              )}
            </button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-[#181818] px-4 text-[#b3b3b3]">ou</span>
            </div>
          </div>

          <button
            type="button"
            onClick={switchMode}
            className="w-full h-12 rounded-full text-sm font-bold border border-white/20 text-white hover:border-white/40 transition-colors"
          >
            {mode === 'login' ? 'Criar conta grátis' : 'Já tenho conta'}
          </button>
        </div>

        {/* Footer */}
        <div className="text-center space-y-2">
          <a
            href="https://www.palcosolo.online/#pricing"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[#b3b3b3] hover:text-white transition-colors underline"
          >
            Ver planos e preços
          </a>
          <p className="text-[10px] text-[#535353]">
            © 2025 PowerTom · Palco Solo
          </p>
        </div>
      </div>
    </div>
  )
}

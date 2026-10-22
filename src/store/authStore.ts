/**
 * AuthStore — acesso livre, sem login/cadastro.
 * Mantém só a leitura de uma sessão existente (usada pela página Admin).
 */

import { create } from 'zustand'
import type { User as SupaUser } from '@supabase/supabase-js'

export type PlanType = 'none' | 'basic' | 'professional' | 'advanced' | 'pro_max'

export interface User {
  id: string
  name: string
  email: string
  plan: PlanType
  avatarUrl?: string
}

interface AuthStore {
  user: User | null
  isInitialized: boolean
  initialize: () => Promise<void>
}

function mapSupabaseUser(su: SupaUser): User {
  const meta = su.user_metadata ?? {}
  return {
    id: su.id,
    name: meta.name || meta.full_name || su.email?.split('@')[0] || 'Músico',
    email: su.email || '',
    plan: (meta.plan as PlanType) || 'professional',
    avatarUrl: meta.avatar_url,
  }
}

const ADMIN_EMAILS = ['talesotto@gmail.com']

export function isAdmin(user: User | null): boolean {
  return !!user && ADMIN_EMAILS.includes(user.email.toLowerCase())
}

export const useAuthStore = create<AuthStore>()((set, get) => ({
  user: null,
  isInitialized: false,

  initialize: async () => {
    // Guard: only initialize once
    if (get().isInitialized) return

    // carrega o Supabase só aqui (tela de administração): o app do cliente não precisa dele
    const { supabase } = await import('@/lib/supabase')
    try {
      const sessionPromise = supabase.auth.getSession()
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Auth timeout')), 5000)
      )
      const { data: { session } } = await Promise.race([sessionPromise, timeout])
      if (session?.user) {
        set({ user: mapSupabaseUser(session.user), isInitialized: true })
      } else {
        set({ user: null, isInitialized: true })
      }
    } catch {
      set({ user: null, isInitialized: true })
    }

    // Keep user in sync on token refresh
    supabase.auth.onAuthStateChange((_event, session) => {
      set({ user: session?.user ? mapSupabaseUser(session.user) : null })
    })
  },
}))

/**
 * AuthStore — autenticação real via Supabase Auth
 */

import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { User as SupaUser, Session } from '@supabase/supabase-js'

export type PlanType = 'none' | 'basic' | 'professional' | 'advanced'

export interface User {
  id: string
  name: string
  email: string
  plan: PlanType
  avatarUrl?: string
}

interface AuthStore {
  user: User | null
  isLoading: boolean
  isInitialized: boolean
  error: string | null
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  clearError: () => void
  initialize: () => Promise<void>
}

function mapSupabaseUser(su: SupaUser): User {
  const meta = su.user_metadata ?? {}
  return {
    id: su.id,
    name: meta.name || meta.full_name || su.email?.split('@')[0] || 'Músico',
    email: su.email || '',
    plan: (meta.plan as PlanType) || 'basic',
    avatarUrl: meta.avatar_url,
  }
}

const ADMIN_EMAILS = ['talesotto@gmail.com']

export function isAdmin(user: User | null): boolean {
  return !!user && ADMIN_EMAILS.includes(user.email.toLowerCase())
}

export const useAuthStore = create<AuthStore>()((set, get) => ({
  user: null,
  isLoading: false,
  isInitialized: false,
  error: null,

  initialize: async () => {
    // Guard: only initialize once
    if (get().isInitialized) return

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        set({ user: mapSupabaseUser(session.user), isInitialized: true })
      } else {
        set({ user: null, isInitialized: true })
      }
    } catch {
      set({ user: null, isInitialized: true })
    }

    // Listen for auth state changes (token refresh, sign out from another tab, etc.)
    supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        set({ user: mapSupabaseUser(session.user) })
      } else {
        set({ user: null })
      }
    })
  },

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null })
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      const msg = error.message === 'Invalid login credentials'
        ? 'E-mail ou senha incorretos.'
        : error.message
      set({ error: msg, isLoading: false })
      return
    }

    if (data.user) {
      set({ user: mapSupabaseUser(data.user), isLoading: false })
    }
  },

  register: async (name: string, email: string, password: string) => {
    set({ isLoading: true, error: null })

    // Check if buyer has an approved payment (optional — assigns plan if found)
    const { data: buyer } = await supabase
      .from('approved_buyers')
      .select('plan')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle()

    const plan = buyer?.plan || 'professional'

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, plan },
      },
    })

    if (error) {
      const msg = error.message === 'User already registered'
        ? 'Este e-mail já está cadastrado.'
        : error.message
      set({ error: msg, isLoading: false })
      return
    }

    if (data.user) {
      set({ user: mapSupabaseUser(data.user), isLoading: false })
    }
  },

  logout: async () => {
    await supabase.auth.signOut()
    set({ user: null, error: null })
  },

  clearError: () => set({ error: null }),
}))

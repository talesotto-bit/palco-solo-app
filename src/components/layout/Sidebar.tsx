import { NavLink, useNavigate } from 'react-router-dom'
import {
  Home, Search, Library, Mic2, Settings, LogOut,
  Crown, Music2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { usePlayerStore } from '@/store/playerStore'

const NAV_MAIN = [
  { label: 'Início', to: '/app/library', icon: Home },
  { label: 'Player', to: '/app/player', icon: Music2 },
  { label: 'Palco', to: '/app/performance', icon: Mic2 },
]

const PLAN_LABELS: Record<string, string> = {
  none: 'Free',
  basic: 'Básico',
  professional: 'Pro',
  advanced: 'Premium',
}

export function Sidebar() {
  const user = useAuthStore(s => s.user)
  const logout = useAuthStore(s => s.logout)
  const navigate = useNavigate()
  const track = usePlayerStore(s => s.track)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <aside className="flex h-full w-[72px] lg:w-[240px] shrink-0 flex-col bg-black">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 px-4 lg:px-5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--primary))]">
          <Music2 className="h-4 w-4 text-black" />
        </div>
        <span className="hidden lg:block text-base font-bold text-white tracking-tight">
          Palco Solo
        </span>
      </div>

      {/* Main nav */}
      <nav className="px-2 lg:px-3 mt-2 space-y-0.5">
        {NAV_MAIN.map(({ label, to, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-4 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors',
                'justify-center lg:justify-start',
                isActive
                  ? 'text-white'
                  : 'text-[#b3b3b3] hover:text-white'
              )
            }
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span className="hidden lg:block">{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Library section */}
      <div className="mt-6 flex-1 overflow-hidden flex flex-col">
        <div className="px-2 lg:px-3">
          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-3 text-[#b3b3b3]">
              <Library className="h-5 w-5 shrink-0" />
              <span className="hidden lg:block text-sm font-semibold">Sua Biblioteca</span>
            </div>
          </div>
        </div>

        {/* Now playing card */}
        {track && (
          <div className="px-2 lg:px-3 mt-2">
            <div
              className="rounded-lg bg-white/5 p-2 lg:p-3 cursor-pointer hover:bg-white/10 transition-colors"
              onClick={() => navigate('/app/player')}
            >
              <div className="flex items-center gap-3">
                <img
                  src={track.coverUrl}
                  alt={track.title}
                  className="h-10 w-10 rounded object-cover shrink-0"
                />
                <div className="hidden lg:block min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">{track.title}</p>
                  <p className="text-xs text-[#b3b3b3] truncate">{track.artist}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1" />

        {/* Settings */}
        <div className="px-2 lg:px-3 mb-2">
          <NavLink
            to="/app/settings"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-4 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                'justify-center lg:justify-start',
                isActive ? 'text-white' : 'text-[#b3b3b3] hover:text-white'
              )
            }
          >
            <Settings className="h-5 w-5 shrink-0" />
            <span className="hidden lg:block">Config</span>
          </NavLink>
        </div>
      </div>

      {/* User footer */}
      {user && (
        <div className="border-t border-white/10 p-2 lg:p-3">
          <div className="flex items-center gap-2.5 px-1 lg:px-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#535353] text-white text-xs font-bold">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="hidden lg:block min-w-0 flex-1">
              <p className="text-sm font-medium text-white truncate">{user.name}</p>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-[hsl(var(--primary))] font-semibold uppercase">
                  {PLAN_LABELS[user.plan]}
                </span>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="hidden lg:flex h-7 w-7 items-center justify-center rounded-full text-[#b3b3b3] hover:text-white transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}

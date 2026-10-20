import { NavLink, useNavigate } from 'react-router-dom'
import {
  Home, Library, Mic2, Settings,
  Music2, Wand2, ShieldCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore, isAdmin } from '@/store/authStore'
import { usePlayerStore } from '@/store/playerStore'
import logoImg from '@/assets/logo.png'

const NAV_MAIN = [
  { label: 'Início', to: '/app/library', icon: Home },
  { label: 'Player', to: '/app/player', icon: Music2 },
  { label: 'Separar Pistas', to: '/app/separar', icon: Wand2 },
  { label: 'Palco', to: '/app/performance', icon: Mic2 },
]

export function Sidebar() {
  const user = useAuthStore(s => s.user)
  const navigate = useNavigate()
  const track = usePlayerStore(s => s.track)

  return (
    <aside className="flex h-full w-[72px] lg:w-[240px] shrink-0 flex-col bg-black">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 px-4 lg:px-5">
        <img src={logoImg} alt="PowerTom" className="h-8 w-8 shrink-0 rounded-full object-cover" />
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

        {/* Admin (only for admin users) */}
        {isAdmin(user) && (
          <div className="px-2 lg:px-3 mb-1">
            <NavLink
              to="/app/admin"
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-4 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                  'justify-center lg:justify-start',
                  isActive ? 'text-[hsl(var(--primary))]' : 'text-[#b3b3b3] hover:text-white'
                )
              }
            >
              <ShieldCheck className="h-5 w-5 shrink-0" />
              <span className="hidden lg:block">Admin</span>
            </NavLink>
          </div>
        )}

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
    </aside>
  )
}

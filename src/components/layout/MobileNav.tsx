import { NavLink } from 'react-router-dom'
import { Home, Music2, Wand2, Mic2, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePlayerStore } from '@/store/playerStore'

const NAV_ITEMS = [
  { label: 'Início', to: '/app/library', icon: Home },
  { label: 'Player', to: '/app/player', icon: Music2 },
  { label: 'Separar', to: '/app/separar', icon: Wand2 },
  { label: 'Palco', to: '/app/performance', icon: Mic2 },
  { label: 'Config', to: '/app/settings', icon: Settings },
]

export function MobileNav() {
  const hasTrack = usePlayerStore(s => !!s.track)

  return (
    <nav className={cn(
      'fixed left-0 right-0 z-40 bg-black/95 backdrop-blur-lg border-t border-white/10 md:hidden',
      hasTrack ? 'bottom-[60px]' : 'bottom-0',
    )}>
      <div className="flex items-center justify-around h-[52px]">
        {NAV_ITEMS.map(({ label, to, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center justify-center gap-0.5 flex-1 h-full min-w-0 transition-colors',
                isActive
                  ? 'text-[hsl(var(--primary))]'
                  : 'text-[#535353] active:text-white'
              )
            }
          >
            <Icon className="h-[18px] w-[18px]" />
            <span className="text-[9px] font-semibold leading-none">{label}</span>
          </NavLink>
        ))}
      </div>
      {/* Safe area bottom for iPhones with home indicator */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  )
}

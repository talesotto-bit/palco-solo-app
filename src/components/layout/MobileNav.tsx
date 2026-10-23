import { NavLink } from 'react-router-dom'
import { tap } from '@/lib/haptics'
import { Library, Music2, Mic2, Settings, ListMusic } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePlayerStore } from '@/store/playerStore'

const NAV_ITEMS = [
  { label: 'Músicas', to: '/app/library', icon: Library },
  { label: 'Player', to: '/app/player', icon: Music2 },
  { label: 'Shows', to: '/app/shows', icon: ListMusic },
  { label: 'Palco', to: '/app/performance', icon: Mic2 },
  { label: 'Config', to: '/app/settings', icon: Settings },
]

export function MobileNav() {
  const hasTrack = usePlayerStore(s => !!s.track)

  return (
    <nav
      className={cn(
        'fixed left-0 right-0 bottom-0 z-40 bg-black/95 backdrop-blur-lg border-t border-white/10 md:hidden',
      )}
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {/* MiniPlayer sits above this nav, pushed up by its height */}
      <div className="flex items-center justify-around h-[50px]">
        {NAV_ITEMS.map(({ label, to, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => tap()}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center justify-center gap-0.5 flex-1 h-full min-w-0 transition-colors',
                isActive
                  ? 'text-[hsl(var(--primary))]'
                  : 'text-[#8a8a8a] active:text-white'
              )
            }
          >
            <Icon className="h-5 w-5 transition-transform active:scale-90" />
            <span className="text-[10px] font-semibold leading-none">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

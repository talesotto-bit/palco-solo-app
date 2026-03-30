import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { MobileNav } from './MobileNav'
import { MiniPlayer } from './MiniPlayer'
import { usePlayerStore } from '@/store/playerStore'
import { cn } from '@/lib/utils'

export function AppLayout() {
  const isPerformanceMode = usePlayerStore(s => s.isPerformanceMode)
  const hasTrack = usePlayerStore(s => !!s.track)
  const location = useLocation()
  const isPlayerPage = location.pathname.startsWith('/app/player')
  const showMiniPlayer = hasTrack && !isPlayerPage && !isPerformanceMode

  return (
    <div className="flex h-dvh overflow-hidden bg-black">
      {/* Sidebar — hidden on mobile */}
      {!isPerformanceMode && (
        <div className="hidden md:block">
          <Sidebar />
        </div>
      )}

      {/* Main content */}
      <div className={cn(
        'flex flex-1 flex-col overflow-hidden',
        isPerformanceMode && 'w-full'
      )}>
        <main className={cn(
          'flex-1 overflow-y-auto bg-gradient-to-b from-[#1a1a1a] to-[#121212] md:rounded-tl-lg',
          // Mobile: nav(50px) + safe-area + optional miniplayer(55px)
          showMiniPlayer
            ? 'pb-[calc(50px+55px+env(safe-area-inset-bottom,0px))]'
            : 'pb-[calc(50px+env(safe-area-inset-bottom,0px))]',
          // Desktop: optional miniplayer only
          showMiniPlayer ? 'md:pb-[80px]' : 'md:pb-0',
        )}>
          <Outlet />
        </main>

        {/* Mini player */}
        {showMiniPlayer && <MiniPlayer />}
      </div>

      {/* Mobile bottom nav */}
      {!isPerformanceMode && <MobileNav />}
    </div>
  )
}

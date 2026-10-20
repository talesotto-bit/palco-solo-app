import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { MobileNav } from './MobileNav'
import { MiniPlayer } from './MiniPlayer'
import { usePlayerStore } from '@/store/playerStore'
import { cn } from '@/lib/utils'
import { InstallBanner } from '@/components/InstallApp'

export function AppLayout() {
  const isPerformanceMode = usePlayerStore(s => s.isPerformanceMode)
  const hasTrack = usePlayerStore(s => !!s.track)
  const location = useLocation()
  const isPlayerPage = location.pathname.startsWith('/app/player')
  const showMiniPlayer = hasTrack && !isPlayerPage && !isPerformanceMode

  return (
    <div className="flex flex-col h-dvh overflow-hidden bg-black">
      {!isPerformanceMode && <InstallBanner />}

      <div className="flex flex-1 overflow-hidden">
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
            showMiniPlayer
              ? 'pb-[calc(50px+55px+env(safe-area-inset-bottom,0px))]'
              : 'pb-[calc(50px+env(safe-area-inset-bottom,0px))]',
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
    </div>
  )
}

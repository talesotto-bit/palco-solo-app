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

  // Mobile: bottom nav (56px) + mini player (64px) = 120px
  // Desktop: mini player only (72px)
  const bottomPad = hasTrack && !isPlayerPage
    ? 'pb-[120px] md:pb-[90px]'
    : 'pb-[56px] md:pb-0'

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
          bottomPad,
        )}>
          <Outlet />
        </main>

        {/* Mini player */}
        {hasTrack && !isPlayerPage && !isPerformanceMode && (
          <MiniPlayer />
        )}
      </div>

      {/* Mobile bottom nav */}
      {!isPerformanceMode && <MobileNav />}
    </div>
  )
}

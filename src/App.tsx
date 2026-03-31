import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { useAuthStore } from '@/store/authStore'
import { AppLayout } from '@/components/layout/AppLayout'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Loader2 } from 'lucide-react'

// Pages
import Auth from '@/pages/Auth'
import Library from '@/pages/Library'
import PlayerPage from '@/pages/PlayerPage'
import Performance from '@/pages/Performance'
import Settings from '@/pages/Settings'
import SeparatePage from '@/pages/SeparatePage'
import NotFound from '@/pages/NotFound'
import Demo from '@/pages/Demo'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 5, retry: 1 },
  },
})

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore(s => s.user)
  const isInitialized = useAuthStore(s => s.isInitialized)

  if (!isInitialized) {
    return (
      <div className="min-h-dvh bg-black flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--primary))]" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const initialize = useAuthStore(s => s.initialize)

  useEffect(() => {
    initialize()
  }, [initialize])

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Auth />} />
            <Route path="/demo" element={<Demo />} />
            <Route path="/" element={<Navigate to="/app/library" replace />} />

            {/* Performance — fullscreen, outside AppLayout */}
            <Route
              path="/app/performance"
              element={
                <ProtectedRoute>
                  <Performance />
                </ProtectedRoute>
              }
            />

            {/* Protected app routes */}
            <Route
              path="/app"
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="library" replace />} />
              <Route path="library" element={<Library />} />
              <Route path="player" element={<PlayerPage />} />
              <Route path="separar" element={<SeparatePage />} />
              <Route path="settings" element={<Settings />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>

        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'hsl(0, 0%, 7%)',
              border: '1px solid hsl(0, 0%, 14%)',
              color: 'hsl(40, 10%, 88%)',
            },
          }}
        />
      </TooltipProvider>
    </QueryClientProvider>
  )
}

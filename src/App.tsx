import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AppLayout } from '@/components/layout/AppLayout'
import { TooltipProvider } from '@/components/ui/tooltip'

// Pages
import Library from '@/pages/Library'
import PlayerPage from '@/pages/PlayerPage'
import Performance from '@/pages/Performance'
import Shows from '@/pages/Shows'
import ShowEditor from '@/pages/ShowEditor'
import Settings from '@/pages/Settings'
import NotFound from '@/pages/NotFound'
import { ErrorBoundary } from '@/components/ErrorBoundary'

// telas raras ficam fora do pacote principal (app abre mais rápido no celular)
const Admin = lazy(() => import('@/pages/Admin'))
const Demo = lazy(() => import('@/pages/Demo'))
const PublicRequest = lazy(() => import('@/pages/PublicRequest'))
const Pedidos = lazy(() => import('@/pages/Pedidos'))
const Activate = lazy(() => import('@/pages/Activate'))
const Experimente = lazy(() => import('@/pages/Experimente'))
const Importar = lazy(() => import('@/pages/Importar'))
const Ferramentas = lazy(() => import('@/pages/Ferramentas'))
const Ajuda = lazy(() => import('@/pages/Ajuda'))
const SharedShow = lazy(() => import('@/pages/SharedShow'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 5, retry: 1 },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Navigate to="/app/library" replace />} />
            <Route path="/demo" element={<ErrorBoundary><Suspense fallback={null}><Demo /></Suspense></ErrorBoundary>} />
            {/* "teste grátis" dos botões da página de vendas: app completo em modo teste */}
            <Route path="/trial" element={<Navigate to="/experimente" replace />} />
            <Route path="/" element={<Navigate to="/app/library" replace />} />
            {/* Página do público (QR de pedidos) e ativação de recursos comprados */}
            <Route path="/p" element={<Suspense fallback={null}><PublicRequest /></Suspense>} />
            <Route path="/s" element={<Suspense fallback={null}><SharedShow /></Suspense>} />
            <Route path="/ativar/:code" element={<Suspense fallback={null}><Activate /></Suspense>} />
            <Route path="/experimente" element={<ErrorBoundary><Suspense fallback={null}><Experimente /></Suspense></ErrorBoundary>} />

            {/* Performance — fullscreen, outside AppLayout */}
            <Route
              path="/app/performance"
              element={<ErrorBoundary><Performance /></ErrorBoundary>}
            />

            {/* App routes */}
            <Route
              path="/app"
              element={<ErrorBoundary><AppLayout /></ErrorBoundary>}
            >
              <Route index element={<Navigate to="library" replace />} />
              <Route path="library" element={<Library />} />
              <Route path="player" element={<PlayerPage />} />
              <Route path="shows" element={<Shows />} />
              <Route path="shows/:id" element={<ShowEditor />} />
              <Route path="pedidos" element={<Suspense fallback={null}><Pedidos /></Suspense>} />
              <Route path="importar" element={<Suspense fallback={null}><Importar /></Suspense>} />
              <Route path="ferramentas" element={<Suspense fallback={null}><Ferramentas /></Suspense>} />
              <Route path="ajuda" element={<Suspense fallback={null}><Ajuda /></Suspense>} />
              <Route path="separar" element={<Navigate to="/app/library" replace />} />
              <Route path="settings" element={<Settings />} />
              <Route path="admin" element={<Suspense fallback={null}><Admin /></Suspense>} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>

        <Toaster
          theme="dark"
          position="top-center"
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

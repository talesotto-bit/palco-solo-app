import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  retryCount: number
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, retryCount: 0 }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  handleRetry = () => {
    // Reset error state to re-mount children without a full page reload
    this.setState(prev => ({
      hasError: false,
      error: null,
      retryCount: prev.retryCount + 1,
    }))
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      // After 3 retries, suggest a full reload
      const maxRetries = this.state.retryCount >= 3

      return (
        <div className="min-h-dvh bg-[#121212] flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <p className="text-xl font-bold text-white mb-2">Algo deu errado</p>
            <p className="text-sm text-[#b3b3b3] mb-4">
              {maxRetries
                ? 'O erro persiste. Tente recarregar a página completamente.'
                : 'Ocorreu um erro inesperado. Tente novamente.'}
            </p>
            <div className="flex items-center justify-center gap-3">
              {!maxRetries && (
                <button
                  onClick={this.handleRetry}
                  className="inline-flex items-center justify-center h-10 rounded-full px-6 text-sm font-bold bg-[hsl(var(--primary))] text-black hover:opacity-90 transition-opacity"
                >
                  Tentar novamente
                </button>
              )}
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center justify-center h-10 rounded-full px-6 text-sm font-bold bg-white/10 text-white hover:bg-white/20 transition-colors"
              >
                Recarregar página
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

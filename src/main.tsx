import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { setupInstallPrompt } from './lib/installPrompt'

setupInstallPrompt()

// App abre sem internet depois do primeiro acesso
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  // o "load" pode já ter acontecido quando este código roda: registra na hora nesse caso
  const register = () => navigator.serviceWorker.register('/sw.js')
    .then(() => navigator.serviceWorker.ready)
    .then(reg => reg.active?.postMessage('precache'))
    .catch(() => {})
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'
import type { Plugin } from 'vite'

/** Lista de arquivos do app para o service worker guardar todas as telas já no primeiro acesso (show sem internet) */
function swAssets(): Plugin {
  return {
    name: 'sw-assets',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter(f => f.startsWith('assets/') && /\.(js|css)$/.test(f)).map(f => '/' + f)
      this.emitFile({ type: 'asset', fileName: 'sw-assets.json', source: JSON.stringify(files) })
    },
  }
}

export default defineConfig({
  plugins: [react(), swAssets()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // No computador, as funções /api (letra, cifra, capa) vêm do app publicado
  server: { proxy: { '/api': { target: 'https://app.powertom.com.br', changeOrigin: true } } },
  preview: { proxy: { '/api': { target: 'https://app.powertom.com.br', changeOrigin: true } } },
  build: {
    rollupOptions: {
      output: {
        // bibliotecas em arquivo separado: atualizações do app baixam menos no celular
        manualChunks: { react: ['react', 'react-dom', 'react-router-dom'], vendor: ['zustand', 'sonner', 'lucide-react'] },
      },
    },
  },
})

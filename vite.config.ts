import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'

export default defineConfig({
  plugins: [react()],
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

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Frontend läuft auf Port 5173, API-Aufrufe (/api/...) werden an den
// Express-Backend-Server (Port 8787) weitergeleitet.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
})

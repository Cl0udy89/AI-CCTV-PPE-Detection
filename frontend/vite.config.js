import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/stream': 'http://localhost:8000',
      '/detection': 'http://localhost:8000',
      '/zones': 'http://localhost:8000',
      '/health': 'http://localhost:8000',
    }
  }
})

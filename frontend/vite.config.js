import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/stream':        'http://localhost:8000',
      '/detection':     'http://localhost:8000',
      '/zones':         'http://localhost:8000',
      '/incidents':     'http://localhost:8000',
      '/stats':         'http://localhost:8000',
      '/alerts':        'http://localhost:8000',
      '/health':        'http://localhost:8000',
      '/auth':          'http://localhost:8000',
      '/users':         'http://localhost:8000',
      '/workers':       'http://localhost:8000',
      '/shifts':        'http://localhost:8000',
      '/notifications': 'http://localhost:8000',
      '/reports':       'http://localhost:8000',
      '/actions':       'http://localhost:8000',
      '/admin':         'http://localhost:8000',
      '/setup':         'http://localhost:8000',
      '/cameras':       'http://localhost:8000',
    }
  }
})

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // In dev, Vite serves the app and forwards API calls to the Node server.
  server: { proxy: { '/api': 'http://localhost:3000' } },
})

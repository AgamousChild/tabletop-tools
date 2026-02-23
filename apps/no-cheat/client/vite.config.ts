import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { readFileSync } from 'fs'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  server: {
    host: true,
    https: {
      key: readFileSync(resolve(__dirname, 'certs/localhost+1-key.pem')),
      cert: readFileSync(resolve(__dirname, 'certs/localhost+1.pem')),
    },
    proxy: {
      '/trpc': {
        target: 'http://localhost:3001',
        headers: { origin: 'http://localhost:3001' },
      },
      '/api': {
        target: 'http://localhost:3001',
        headers: { origin: 'http://localhost:3001' },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})

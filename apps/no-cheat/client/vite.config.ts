import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

function loadCerts() {
  const keyPath = resolve(__dirname, 'certs/localhost+1-key.pem')
  const certPath = resolve(__dirname, 'certs/localhost+1.pem')
  if (existsSync(keyPath) && existsSync(certPath)) {
    return { key: readFileSync(keyPath), cert: readFileSync(certPath) }
  }
  return undefined
}

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/no-cheat/' : '/',
  plugins: [react(), tsconfigPaths()],
  server: {
    host: true,
    https: command === 'serve' ? loadCerts() : undefined,
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
}))

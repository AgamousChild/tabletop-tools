import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/admin/' : '/',
  plugins: [react(), tsconfigPaths()],
  server: {
    host: true,
    proxy: {
      '/trpc': {
        target: 'http://localhost:3007',
        headers: { origin: 'http://localhost:3007' },
      },
      '/api': {
        target: 'http://localhost:3007',
        headers: { origin: 'http://localhost:3007' },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
}))

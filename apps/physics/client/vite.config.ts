import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/physics/' : '/',
  plugins: [react(), tsconfigPaths()],
  server: {
    host: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
}))

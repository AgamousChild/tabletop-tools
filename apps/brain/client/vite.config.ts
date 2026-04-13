import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

// BUILD_VERSION env var is set by the deploy script — same value goes to Worker + client
const buildVersion = process.env.BUILD_VERSION || `dev-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}`

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/brain/' : '/',
  define: {
    __APP_VERSION__: JSON.stringify(buildVersion),
  },
  plugins: [react(), tsconfigPaths()],
  server: {
    host: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
}))

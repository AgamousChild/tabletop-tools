import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

// Local-only widget evaluation lab. No gateway/Pages integration — run via
// `pnpm -F widget-lab-client dev` and visit the printed localhost URL.
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  server: { host: true },
  test: {
    globals: true,
    environment: 'jsdom',
  },
})

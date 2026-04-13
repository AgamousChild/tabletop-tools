import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))
const buildId = `${pkg.version}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/brain/' : '/',
  define: {
    __APP_VERSION__: JSON.stringify(buildId),
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

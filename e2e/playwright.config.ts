import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './specs',
  globalSetup: './global-setup.ts',
  timeout: 30_000,
  retries: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'auth-flow',
      testMatch: ['auth.spec.ts', 'cross-app-auth.spec.ts'],
      use: { ...devices['Desktop Chrome'] },
      // Auth tests must run serially — each signup hits the auth Worker's scrypt hash
      // which is CPU-intensive. Parallel requests cause Worker timeouts.
      fullyParallel: false,
      retries: 2,
      timeout: 60_000,
    },
    {
      name: 'public',
      testMatch: ['landing.spec.ts', 'new-meta.spec.ts', 'data-import.spec.ts'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'authed',
      testMatch: [
        'no-cheat.spec.ts',
        'versus.spec.ts',
        'list-builder.spec.ts',
        'game-tracker.spec.ts',
        'tournament.spec.ts',
      ],
      use: { ...devices['Desktop Chrome'], storageState: 'auth-state.json' },
      dependencies: ['auth-flow'],
    },
  ],
})

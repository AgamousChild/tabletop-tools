import { chromium, type FullConfig } from '@playwright/test'
import { signUp } from './fixtures/auth'
import { writeFileSync, existsSync } from 'fs'

/**
 * Global setup: creates a test user and saves the authenticated browser state
 * to auth-state.json for reuse by the 'authed' project.
 *
 * If auth is broken, this logs a warning and continues.
 * The 'public' project tests will still run; 'authed' tests will fail
 * individually when they can't find the auth state.
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL ?? 'http://localhost:5173'

  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    // Navigate to an auth-gated app to trigger the auth screen
    await page.goto(`${baseURL}/no-cheat/`)
    await page.waitForLoadState('networkidle')

    // Register a test user (signUp retries internally on transient Worker failures)
    const email = `e2e-setup-${Date.now()}@test.local`
    await signUp(page, {
      email,
      password: 'TestPassword123!',
      name: 'E2E Test User',
    })

    // signUp returns after the sign-out button is visible (auth succeeded),
    // or after exhausting retries. Verify auth actually worked.
    const signedIn = await page.getByRole('button', { name: /sign out/i }).isVisible()
    if (!signedIn) {
      throw new Error('Registration did not succeed after retries')
    }

    // Save authenticated state
    await context.storageState({ path: 'auth-state.json' })
    console.log(`[global-setup] Auth state saved (${email})`)
  } catch (error) {
    console.warn('[global-setup] Failed to create auth session:', (error as Error).message)
    console.warn('[global-setup] Auth tests will fail. Public tests will still run.')
    // Write empty state so Playwright doesn't crash trying to read the file
    if (!existsSync('auth-state.json')) {
      writeFileSync('auth-state.json', JSON.stringify({ cookies: [], origins: [] }))
    }
  } finally {
    await browser.close()
  }
}

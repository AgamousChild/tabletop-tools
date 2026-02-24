import type { Page } from '@playwright/test'

type Credentials = {
  email: string
  password: string
  name: string
}

/**
 * Generate a unique test email to avoid collisions across runs.
 */
export function testEmail(): string {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`
}

/**
 * Switch the auth form to register mode and submit a new account.
 * Expects to be on a page showing the AuthScreen component.
 *
 * Retries up to 3 times because the auth Worker's scrypt hash is
 * CPU-intensive and sometimes exceeds Cloudflare Workers' CPU limits,
 * causing transient "Registration failed" errors.
 */
export async function signUp(page: Page, creds: Credentials): Promise<void> {
  const maxAttempts = 3

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Switch to register mode if not already there
    const registerLink = page.getByRole('button', { name: 'Register' })
    if (await registerLink.isVisible()) {
      await registerLink.click()
    }

    // Fill register form
    await page.getByPlaceholder('Your name').fill(creds.name)
    await page.getByPlaceholder('Email').fill(creds.email)
    await page.getByPlaceholder('Password').fill(creds.password)

    // Submit
    await page.getByRole('button', { name: 'Create account' }).click()

    // Wait briefly to see if an error appears or auth succeeds
    const signOutBtn = page.getByRole('button', { name: /sign out/i })
    const errorMsg = page.locator('.text-red-400')

    // Race: either auth succeeds (sign out button appears) or error shows
    const result = await Promise.race([
      signOutBtn.waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'success' as const),
      errorMsg.waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'error' as const),
    ]).catch(() => 'timeout' as const)

    if (result === 'success') {
      return // Registration succeeded
    }

    if (attempt < maxAttempts) {
      // Wait before retrying — give the Worker time to recover
      await page.waitForTimeout(2_000)
      // Clear the error by refreshing and starting over
      await page.reload()
      await page.waitForLoadState('networkidle')
    }
    // On final attempt, just return and let the calling test's assertions handle success/failure
  }
}

/**
 * Fill the login form and submit.
 * Expects to be on a page showing the AuthScreen in login mode.
 */
export async function logIn(page: Page, creds: Pick<Credentials, 'email' | 'password'>): Promise<void> {
  // Ensure we're in login mode
  const loginLink = page.getByRole('button', { name: 'Log in' })
  // The form button says "Log in" when in login mode, and there's also a toggle link
  // We need the toggle link if we're in register mode
  const logInToggle = page.locator('button:text-is("Log in")').last()
  if (await logInToggle.isVisible()) {
    // Check if we're in register mode by seeing if "Your name" field exists
    const nameField = page.getByPlaceholder('Your name')
    if (await nameField.isVisible()) {
      await logInToggle.click()
    }
  }

  // Fill login form
  await page.getByPlaceholder('Email').fill(creds.email)
  await page.getByPlaceholder('Password').fill(creds.password)

  // Submit
  await page.getByRole('button', { name: 'Log in' }).click()
}

/**
 * Click the sign out button. Works across all apps (various capitalizations).
 */
export async function logOut(page: Page): Promise<void> {
  // Different apps use "Sign out" or "Sign Out"
  const signOutBtn =
    page.getByRole('button', { name: /sign out/i })
  await signOutBtn.click()
}

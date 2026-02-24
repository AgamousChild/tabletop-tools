import { test, expect } from '@playwright/test'
import { signUp, testEmail } from '../fixtures/auth'

test.describe('Cross-app auth', () => {
  test('session cookie carries across apps on same origin', async ({ page }) => {
    const email = testEmail()

    // Log in on no-cheat
    await page.goto('/no-cheat/')
    await page.waitForLoadState('networkidle')
    await signUp(page, { email, password: 'TestPassword123!', name: 'Cross App Test' })

    // Wait for auth to complete on no-cheat (scrypt hash can be slow)
    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible({ timeout: 30_000 })

    // Navigate to versus — auth gate should be bypassed (same-origin cookie)
    await page.goto('/versus/')
    await page.waitForLoadState('networkidle')

    // Should see the main app content, not the auth screen
    await expect(page.locator('h1:has-text("Versus")').first()).toBeVisible({ timeout: 15_000 })
    // Should NOT see the auth form
    await expect(page.getByPlaceholder('Email')).not.toBeVisible({ timeout: 5_000 })
  })
})

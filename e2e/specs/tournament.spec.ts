import { test, expect } from '@playwright/test'

test.describe('Tournament (authed)', () => {
  test('main screen loads', async ({ page }) => {
    await page.goto('/tournament/')
    await page.waitForLoadState('networkidle')

    // Should see the Tournament header
    await expect(page.locator('h1:has-text("Tournament")')).toBeVisible({ timeout: 15_000 })
  })

  test('create tournament button is present', async ({ page }) => {
    await page.goto('/tournament/')
    await page.waitForLoadState('networkidle')

    // TournamentScreen has a "+ New Tournament" link (hash routing)
    await expect(page.getByRole('link', { name: /new tournament/i })).toBeVisible({ timeout: 15_000 })
  })

  test('sign out button is present', async ({ page }) => {
    await page.goto('/tournament/')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible({ timeout: 15_000 })
  })
})

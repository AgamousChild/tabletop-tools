import { test, expect } from '@playwright/test'

test.describe('Versus (authed)', () => {
  test('simulator screen loads', async ({ page }) => {
    await page.goto('/versus/')
    await page.waitForLoadState('networkidle')

    // Should see the Versus header
    await expect(page.locator('h1:has-text("Versus")')).toBeVisible({ timeout: 15_000 })
  })

  test('has sign out button', async ({ page }) => {
    await page.goto('/versus/')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible({ timeout: 15_000 })
  })

  test('shows attacker and defender unit selectors', async ({ page }) => {
    await page.goto('/versus/')
    await page.waitForLoadState('networkidle')

    // SimulatorScreen has two UnitSelector components with h2 headings
    await expect(page.getByRole('heading', { name: 'Attacker' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'Defender' })).toBeVisible()
  })

  test('simulate button is present', async ({ page }) => {
    await page.goto('/versus/')
    await page.waitForLoadState('networkidle')

    // Button shows "Select attacker and defender" when no units selected
    await expect(page.getByRole('button', { name: /select attacker and defender/i })).toBeVisible({ timeout: 15_000 })
  })
})

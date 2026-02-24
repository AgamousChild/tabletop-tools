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

    // SimulatorScreen has two UnitSelector components labeled "Attacker" and "Defender"
    await expect(page.locator('text=Attacker')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('text=Defender')).toBeVisible()
  })

  test('run simulation button is present', async ({ page }) => {
    await page.goto('/versus/')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('button', { name: /run simulation/i })).toBeVisible({ timeout: 15_000 })
  })
})

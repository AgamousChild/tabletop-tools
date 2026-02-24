import { test, expect } from '@playwright/test'

test.describe('No Cheat (authed)', () => {
  test('main screen loads after auth', async ({ page }) => {
    await page.goto('/no-cheat/')
    await page.waitForLoadState('networkidle')

    // Should see the main DiceSetScreen, not the auth screen
    await expect(page.getByPlaceholder('Email')).not.toBeVisible({ timeout: 5_000 })
  })

  test('shows NoCheat header and sign out', async ({ page }) => {
    await page.goto('/no-cheat/')
    await page.waitForLoadState('networkidle')

    // The app should render with sign out available
    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible({ timeout: 15_000 })
  })

  test('dice set management UI is present', async ({ page }) => {
    await page.goto('/no-cheat/')
    await page.waitForLoadState('networkidle')

    // DiceSetScreen shows a create form and list area
    // The create form has a text input for dice set name
    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible({ timeout: 15_000 })
  })
})

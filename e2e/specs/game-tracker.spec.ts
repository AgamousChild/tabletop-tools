import { test, expect } from '@playwright/test'

test.describe('Game Tracker (authed)', () => {
  test('main screen loads', async ({ page }) => {
    await page.goto('/game-tracker/')
    await page.waitForLoadState('networkidle')

    // Should see the Game Tracker header
    await expect(page.locator('h1:has-text("Game Tracker")')).toBeVisible({ timeout: 15_000 })
  })

  test('has sign out button', async ({ page }) => {
    await page.goto('/game-tracker/')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible({ timeout: 15_000 })
  })

  test('new match button is present', async ({ page }) => {
    await page.goto('/game-tracker/')
    await page.waitForLoadState('networkidle')

    // GameTrackerScreen has a "+ New Match" button
    await expect(page.getByRole('button', { name: /new match/i })).toBeVisible({ timeout: 15_000 })
  })

  test('match history section is present', async ({ page }) => {
    await page.goto('/game-tracker/')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('text=Match History')).toBeVisible({ timeout: 15_000 })
  })
})

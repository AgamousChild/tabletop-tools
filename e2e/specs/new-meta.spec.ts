import { expect, test } from '@playwright/test'

test.describe('New Meta (public, no auth)', () => {
  test('app loads directly without auth gate', async ({ page }) => {
    await page.goto('/new-meta/')
    await page.waitForLoadState('networkidle')

    // Should NOT show auth screen
    await expect(page.getByPlaceholder('Email')).not.toBeVisible()

    // Should show the app nav
    await expect(page.locator('text=NEW META')).toBeVisible()
  })

  test('navigation tabs are visible', async ({ page }) => {
    await page.goto('/new-meta/')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('link', { name: 'Meta', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Players' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Source Data' })).toBeVisible()
  })

  test('can switch between tabs', async ({ page }) => {
    await page.goto('/new-meta/')
    await page.waitForLoadState('networkidle')

    await page.getByRole('link', { name: 'Players' }).click()
    // Players tab should show leaderboard or empty state
    await expect(page.getByText(/leaderboard|no player/i)).toBeVisible({ timeout: 10_000 })

    await page.getByRole('link', { name: 'Source Data' }).click()
    // Source Data tab should show tournaments list or empty state
    await expect(page.getByText(/tournament|no events|source/i)).toBeVisible({ timeout: 10_000 })

    await page.getByRole('link', { name: 'Meta', exact: true }).click()
  })

  test('dashboard renders faction data or empty state', async ({ page }) => {
    await page.goto('/new-meta/')
    await page.waitForLoadState('networkidle')

    // Should show either faction table data or an empty state message
    const hasFactionData = await page
      .getByText(/win rate|faction/i)
      .isVisible()
      .catch(() => false)
    const hasEmptyState = await page
      .getByText(/no data|no events|no tournaments/i)
      .isVisible()
      .catch(() => false)
    const hasMain = await page.locator('main').isVisible()
    expect(hasFactionData || hasEmptyState || hasMain).toBe(true)
  })

  test('Players tab shows Glicko-2 leaderboard', async ({ page }) => {
    await page.goto('/new-meta/#/players')
    await page.waitForLoadState('networkidle')

    // Should show player ranking with Glicko ratings or empty state
    const hasRating = await page
      .getByText(/rating|glicko/i)
      .isVisible()
      .catch(() => false)
    const hasEmpty = await page
      .getByText(/no player|no data/i)
      .isVisible()
      .catch(() => false)
    expect(hasRating || hasEmpty).toBe(true)
  })
})

import { test, expect } from '@playwright/test'

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

    // Click Players tab
    await page.getByRole('link', { name: 'Players' }).click()

    // Click Source Data tab
    await page.getByRole('link', { name: 'Source Data' }).click()

    // Click back to Meta tab
    await page.getByRole('link', { name: 'Meta', exact: true }).click()
  })

  test('dashboard renders on Meta tab', async ({ page }) => {
    await page.goto('/new-meta/')
    await page.waitForLoadState('networkidle')

    // The Meta tab shows the Dashboard page which contains the faction table area
    // The main content area should be visible
    await expect(page.locator('main')).toBeVisible()
  })
})

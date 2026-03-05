import { test, expect } from '@playwright/test'

test.describe('Data Import (public, no auth)', () => {
  test('app loads directly without auth gate', async ({ page }) => {
    await page.goto('/data-import/')
    await page.waitForLoadState('networkidle')

    // Should NOT show auth screen
    await expect(page.getByPlaceholder('Email')).not.toBeVisible()

    // Should show the Data Import header
    await expect(page.locator('h1')).toContainText('Data')
    await expect(page.locator('h1')).toContainText('Import')
  })

  test('shows Sync and Stored Data tabs', async ({ page }) => {
    await page.goto('/data-import/')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('button', { name: 'Sync' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Stored Data' })).toBeVisible()
  })

  test('Check for Updates button is present on Sync tab', async ({ page }) => {
    await page.goto('/data-import/')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('button', { name: 'Check for Updates' })).toBeVisible()
  })

  test('Stored Data tab shows empty state', async ({ page }) => {
    await page.goto('/data-import/')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: 'Stored Data' }).click()
    await expect(page.getByText('No unit profiles imported yet.')).toBeVisible()
  })
})

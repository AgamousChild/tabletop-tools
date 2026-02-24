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

  test('repo input shows default BSData/wh40k-10e', async ({ page }) => {
    await page.goto('/data-import/')
    await page.waitForLoadState('networkidle')

    const repoInput = page.locator('input[placeholder="BSData/wh40k-10e"]')
    await expect(repoInput).toBeVisible()
    await expect(repoInput).toHaveValue('BSData/wh40k-10e')
  })

  test('Load Catalog List button is present', async ({ page }) => {
    await page.goto('/data-import/')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('button', { name: 'Load Catalog List' })).toBeVisible()
  })

  test('branch input defaults to main', async ({ page }) => {
    await page.goto('/data-import/')
    await page.waitForLoadState('networkidle')

    const branchInput = page.locator('input[placeholder="main"]')
    await expect(branchInput).toBeVisible()
    await expect(branchInput).toHaveValue('main')
  })
})

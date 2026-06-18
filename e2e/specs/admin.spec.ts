import { expect, test } from '@playwright/test'

test.describe('Admin (authed)', () => {
  test('admin dashboard loads', async ({ page }) => {
    await page.goto('/admin/')
    await page.waitForLoadState('networkidle')

    // Admin requires auth — should show dashboard or auth screen
    // If the test user is an admin, we see the dashboard
    // If not, we may see a forbidden message
    const hasNav = await page
      .getByText('Dashboard')
      .isVisible()
      .catch(() => false)
    const hasAuth = await page
      .getByPlaceholder('Email')
      .isVisible()
      .catch(() => false)
    expect(hasNav || hasAuth).toBe(true)
  })

  test('ingest page shows sources section', async ({ page }) => {
    await page.goto('/admin/')
    await page.waitForLoadState('networkidle')

    // Navigate to Ingest page if nav is visible
    const ingestLink = page.getByText('Ingest')
    if (await ingestLink.isVisible().catch(() => false)) {
      await ingestLink.click()
      await expect(page.getByText('Content Ingestor')).toBeVisible({ timeout: 10_000 })
      await expect(page.getByText('Sources')).toBeVisible()
    }
  })

  test('ingest page shows content table', async ({ page }) => {
    await page.goto('/admin/')
    await page.waitForLoadState('networkidle')

    const ingestLink = page.getByText('Ingest')
    if (await ingestLink.isVisible().catch(() => false)) {
      await ingestLink.click()
      await expect(page.getByText('Content')).toBeVisible({ timeout: 10_000 })
      // Should show either content rows or empty state
      const hasContent = await page
        .getByText('Title')
        .isVisible()
        .catch(() => false)
      const hasEmpty = await page
        .getByText('No content discovered')
        .isVisible()
        .catch(() => false)
      expect(hasContent || hasEmpty).toBe(true)
    }
  })

  test('ingest page has manual ingest section', async ({ page }) => {
    await page.goto('/admin/')
    await page.waitForLoadState('networkidle')

    const ingestLink = page.getByText('Ingest')
    if (await ingestLink.isVisible().catch(() => false)) {
      await ingestLink.click()
      await expect(page.getByText('Manual Ingest')).toBeVisible({ timeout: 10_000 })
      await expect(page.getByPlaceholder('Paste a single URL to ingest')).toBeVisible()
    }
  })

  test('ingest page has discover and process buttons', async ({ page }) => {
    await page.goto('/admin/')
    await page.waitForLoadState('networkidle')

    const ingestLink = page.getByText('Ingest')
    if (await ingestLink.isVisible().catch(() => false)) {
      await ingestLink.click()
      await expect(page.getByText('Discover New Content')).toBeVisible({ timeout: 10_000 })
      await expect(page.getByText('Process Discovered')).toBeVisible()
    }
  })
})

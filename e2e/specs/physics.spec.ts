import { expect, test } from '@playwright/test'

// Physics is a static SPA (no backend Worker — hasBackend: false in
// apps/gateway/apps.json). These tests verify the gateway serves it and the
// app boots; they deliberately don't assert on chunk content, which depends
// on a local chunks:build against personal source files.

test.describe('Physics (public, no auth, static)', () => {
  test('app loads directly without auth gate', async ({ page }) => {
    await page.goto('/physics/')
    await page.waitForLoadState('networkidle')

    // Should NOT show auth screen
    await expect(page.getByPlaceholder('Email')).not.toBeVisible()

    // Should show the Physics header once the manifest loads
    await expect(page.locator('h1')).toContainText('Physics', { timeout: 10000 })
  })

  test('search input renders once the chunk manifest loads', async ({ page }) => {
    await page.goto('/physics/')
    await page.waitForLoadState('networkidle')

    // The app fetches /physics/data/chunks.json and then renders the search bar.
    await expect(page.getByPlaceholder('Search slides…')).toBeVisible({ timeout: 10000 })
  })

  test('SPA fallback serves deep links', async ({ page }) => {
    // _redirects maps /physics/* -> /physics/index.html
    const response = await page.goto('/physics/some/deep/route')
    expect(response?.status()).toBe(200)
  })
})

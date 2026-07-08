import { expect, test } from '@playwright/test'

// Study is a static SPA (no backend Worker — hasBackend: false in
// apps/gateway/apps.json). These tests verify the gateway serves it and the
// app boots; they deliberately don't assert on slide content, which depends
// on a local slides:build against personal source files.

test.describe('Study (public, no auth, static)', () => {
  test('app loads directly without auth gate', async ({ page }) => {
    await page.goto('/study/')
    await page.waitForLoadState('networkidle')

    // Should NOT show auth screen
    await expect(page.getByPlaceholder('Email')).not.toBeVisible()

    // Should show the Study header
    await expect(page.locator('h1')).toContainText('Study')
  })

  test('shows Search and Practice Exam tabs', async ({ page }) => {
    await page.goto('/study/')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('tab', { name: 'Search' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Practice Exam' })).toBeVisible()
  })

  test('search input renders once the slide manifest loads', async ({ page }) => {
    await page.goto('/study/')
    await page.waitForLoadState('networkidle')

    // The app fetches /study/data/slides.json and then renders the search bar.
    await expect(page.getByPlaceholder('Search slides…')).toBeVisible({ timeout: 10000 })
  })

  test('SPA fallback serves deep links', async ({ page }) => {
    // _redirects maps /study/* -> /study/index.html
    const response = await page.goto('/study/some/deep/route')
    expect(response?.status()).toBe(200)
    await expect(page.locator('h1')).toContainText('Study')
  })
})

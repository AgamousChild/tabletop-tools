import { test, expect } from '@playwright/test'

test.describe('List Builder (authed)', () => {
  test('list builder screen loads', async ({ page }) => {
    await page.goto('/list-builder/')
    await page.waitForLoadState('networkidle')

    // Should see the List Builder header
    await expect(page.locator('h1:has-text("List Builder")')).toBeVisible({ timeout: 15_000 })
  })

  test('has sign out button', async ({ page }) => {
    await page.goto('/list-builder/')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible({ timeout: 15_000 })
  })

  test('my army lists heading is present', async ({ page }) => {
    await page.goto('/list-builder/')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('heading', { name: /my army lists/i })).toBeVisible({ timeout: 15_000 })
  })

  test('new list button is present', async ({ page }) => {
    await page.goto('/list-builder/')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('button', { name: /new list/i })).toBeVisible({ timeout: 15_000 })
  })
})

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

  test('faction selector is present', async ({ page }) => {
    await page.goto('/list-builder/')
    await page.waitForLoadState('networkidle')

    // ListBuilderScreen has a select with "All factions" default option
    await expect(page.getByLabel('Select faction')).toBeVisible({ timeout: 15_000 })
  })

  test('unit search input is present', async ({ page }) => {
    await page.goto('/list-builder/')
    await page.waitForLoadState('networkidle')

    await expect(page.getByPlaceholder('Search units')).toBeVisible({ timeout: 15_000 })
  })
})

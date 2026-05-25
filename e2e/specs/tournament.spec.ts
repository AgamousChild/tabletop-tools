import { expect, test } from '@playwright/test'

test.describe('Tournament (authed)', () => {
  test('main screen loads with nav tabs', async ({ page }) => {
    await page.goto('/tournament/')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('h1:has-text("Tournament")')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('My Events')).toBeVisible()
    await expect(page.getByText('Play')).toBeVisible()
    await expect(page.getByText('My Info')).toBeVisible()
  })

  test('create tournament button navigates to form', async ({ page }) => {
    await page.goto('/tournament/')
    await page.waitForLoadState('networkidle')

    const createLink = page.getByRole('link', { name: /new tournament/i })
    await expect(createLink).toBeVisible({ timeout: 15_000 })

    await createLink.click()
    await expect(page.getByText('Create Tournament')).toBeVisible()
    await expect(page.getByPlaceholder('Tournament name')).toBeVisible()
  })

  test('can create a tournament', async ({ page }) => {
    await page.goto('/tournament/#/create')
    await page.waitForLoadState('networkidle')

    await page.getByPlaceholder('Tournament name').fill(`E2E Test ${Date.now()}`)
    await page.getByRole('button', { name: /create tournament/i }).click()

    // Should navigate to the tournament detail page showing DRAFT status
    await expect(page.getByText('DRAFT')).toBeVisible({ timeout: 15_000 })
  })

  test('My Info tab loads', async ({ page }) => {
    await page.goto('/tournament/')
    await page.waitForLoadState('networkidle')

    await page.getByText('My Info').click()
    // Rating placeholder should be visible (Glicko-2 not yet wired)
    await expect(page.getByText('Rating')).toBeVisible({ timeout: 10_000 })
  })

  test('sign out button is present', async ({ page }) => {
    await page.goto('/tournament/')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible({ timeout: 15_000 })
  })
})

import { test, expect } from '@playwright/test'

test.describe('Landing page', () => {
  test('loads with Tabletop Tools heading', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toContainText('Tabletop')
    await expect(page.locator('h1')).toContainText('Tools')
  })

  test('shows all 7 app cards', async ({ page }) => {
    await page.goto('/')

    const cards = page.locator('a.card')
    await expect(cards).toHaveCount(7)
  })

  test('cards have correct hrefs', async ({ page }) => {
    await page.goto('/')

    const expectedApps = [
      { name: 'No Cheat', href: '/no-cheat/' },
      { name: 'Versus', href: '/versus/' },
      { name: 'List Builder', href: '/list-builder/' },
      { name: 'Game Tracker', href: '/game-tracker/' },
      { name: 'Tournament', href: '/tournament/' },
      { name: 'New Meta', href: '/new-meta/' },
      { name: 'Data Import', href: '/data-import/' },
    ]

    for (const app of expectedApps) {
      const card = page.locator(`a.card[href="${app.href}"]`)
      await expect(card).toBeVisible()
      await expect(card.locator('.card-title')).toHaveText(app.name)
    }
  })

  test('card links navigate to correct app', async ({ page }) => {
    await page.goto('/')

    // Click the New Meta card (public, no auth gate — won't redirect)
    await page.locator('a.card[href="/new-meta/"]').click()
    await expect(page).toHaveURL(/\/new-meta\//)
  })
})

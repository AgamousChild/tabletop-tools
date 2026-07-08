import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

// The expected card list comes from the gateway's roster manifest — the same
// file that renders the landing page at build time (render-landing.mjs).
// See wargame/w2/decisions/D2-02-deploy-topology-roster-manifest.md.
const manifest = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'apps', 'gateway', 'apps.json'), 'utf8'),
) as {
  apps: { slug: string; title: string; showOnLanding: boolean }[]
}
const landingApps = manifest.apps.filter((app) => app.showOnLanding)

test.describe('Landing page', () => {
  test('loads with Tabletop Tools heading', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toContainText('Tabletop')
    await expect(page.locator('h1')).toContainText('Tools')
  })

  test('shows a card for every showOnLanding app in the manifest', async ({ page }) => {
    await page.goto('/')

    const cards = page.locator('a.card')
    await expect(cards).toHaveCount(landingApps.length)
  })

  test('cards have correct hrefs and titles', async ({ page }) => {
    await page.goto('/')

    for (const app of landingApps) {
      const card = page.locator(`a.card[href="/${app.slug}/"]`)
      await expect(card).toBeVisible()
      await expect(card.locator('.card-title')).toHaveText(app.title)
    }
  })

  test('card links navigate to correct app', async ({ page }) => {
    await page.goto('/')

    // Click the New Meta card (public, no auth gate — won't redirect)
    await page.locator('a.card[href="/new-meta/"]').click()
    await expect(page).toHaveURL(/\/new-meta\//)
  })
})

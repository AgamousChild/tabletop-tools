# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: landing.spec.ts >> Landing page >> loads with Tabletop Tools heading
- Location: specs\landing.spec.ts:4:7

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/
Call log:
  - navigating to "http://localhost:5173/", waiting until "load"

```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test'
  2  | 
  3  | test.describe('Landing page', () => {
  4  |   test('loads with Tabletop Tools heading', async ({ page }) => {
> 5  |     await page.goto('/')
     |                ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/
  6  |     await expect(page.locator('h1')).toContainText('Tabletop')
  7  |     await expect(page.locator('h1')).toContainText('Tools')
  8  |   })
  9  | 
  10 |   test('shows all 8 app cards', async ({ page }) => {
  11 |     await page.goto('/')
  12 | 
  13 |     const cards = page.locator('a.card')
  14 |     await expect(cards).toHaveCount(8)
  15 |   })
  16 | 
  17 |   test('cards have correct hrefs', async ({ page }) => {
  18 |     await page.goto('/')
  19 | 
  20 |     const expectedApps = [
  21 |       { name: 'No Cheat', href: '/no-cheat/' },
  22 |       { name: 'Versus', href: '/versus/' },
  23 |       { name: 'List Builder', href: '/list-builder/' },
  24 |       { name: 'Game Tracker', href: '/game-tracker/' },
  25 |       { name: 'Tournament', href: '/tournament/' },
  26 |       { name: 'New Meta', href: '/new-meta/' },
  27 |       { name: 'Data Import', href: '/data-import/' },
  28 |       { name: 'Admin', href: '/admin/' },
  29 |     ]
  30 | 
  31 |     for (const app of expectedApps) {
  32 |       const card = page.locator(`a.card[href="${app.href}"]`)
  33 |       await expect(card).toBeVisible()
  34 |       await expect(card.locator('.card-title')).toHaveText(app.name)
  35 |     }
  36 |   })
  37 | 
  38 |   test('card links navigate to correct app', async ({ page }) => {
  39 |     await page.goto('/')
  40 | 
  41 |     // Click the New Meta card (public, no auth gate — won't redirect)
  42 |     await page.locator('a.card[href="/new-meta/"]').click()
  43 |     await expect(page).toHaveURL(/\/new-meta\//)
  44 |   })
  45 | })
  46 | 
```
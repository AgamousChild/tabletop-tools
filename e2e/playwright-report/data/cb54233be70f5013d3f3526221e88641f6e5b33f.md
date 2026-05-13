# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: new-meta.spec.ts >> New Meta (public, no auth) >> navigation tabs are visible
- Location: specs\new-meta.spec.ts:15:7

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/new-meta/
Call log:
  - navigating to "http://localhost:5173/new-meta/", waiting until "load"

```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test'
  2  | 
  3  | test.describe('New Meta (public, no auth)', () => {
  4  |   test('app loads directly without auth gate', async ({ page }) => {
  5  |     await page.goto('/new-meta/')
  6  |     await page.waitForLoadState('networkidle')
  7  | 
  8  |     // Should NOT show auth screen
  9  |     await expect(page.getByPlaceholder('Email')).not.toBeVisible()
  10 | 
  11 |     // Should show the app nav
  12 |     await expect(page.locator('text=NEW META')).toBeVisible()
  13 |   })
  14 | 
  15 |   test('navigation tabs are visible', async ({ page }) => {
> 16 |     await page.goto('/new-meta/')
     |                ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/new-meta/
  17 |     await page.waitForLoadState('networkidle')
  18 | 
  19 |     await expect(page.getByRole('link', { name: 'Meta', exact: true })).toBeVisible()
  20 |     await expect(page.getByRole('link', { name: 'Players' })).toBeVisible()
  21 |     await expect(page.getByRole('link', { name: 'Source Data' })).toBeVisible()
  22 |   })
  23 | 
  24 |   test('can switch between tabs', async ({ page }) => {
  25 |     await page.goto('/new-meta/')
  26 |     await page.waitForLoadState('networkidle')
  27 | 
  28 |     // Click Players tab
  29 |     await page.getByRole('link', { name: 'Players' }).click()
  30 | 
  31 |     // Click Source Data tab
  32 |     await page.getByRole('link', { name: 'Source Data' }).click()
  33 | 
  34 |     // Click back to Meta tab
  35 |     await page.getByRole('link', { name: 'Meta', exact: true }).click()
  36 |   })
  37 | 
  38 |   test('dashboard renders on Meta tab', async ({ page }) => {
  39 |     await page.goto('/new-meta/')
  40 |     await page.waitForLoadState('networkidle')
  41 | 
  42 |     // The Meta tab shows the Dashboard page which contains the faction table area
  43 |     // The main content area should be visible
  44 |     await expect(page.locator('main')).toBeVisible()
  45 |   })
  46 | })
  47 | 
```
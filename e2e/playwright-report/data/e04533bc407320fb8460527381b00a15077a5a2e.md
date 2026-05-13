# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: data-import.spec.ts >> Data Import (public, no auth) >> Stored Data tab shows empty state
- Location: specs\data-import.spec.ts:31:7

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/data-import/
Call log:
  - navigating to "http://localhost:5173/data-import/", waiting until "load"

```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test'
  2  | 
  3  | test.describe('Data Import (public, no auth)', () => {
  4  |   test('app loads directly without auth gate', async ({ page }) => {
  5  |     await page.goto('/data-import/')
  6  |     await page.waitForLoadState('networkidle')
  7  | 
  8  |     // Should NOT show auth screen
  9  |     await expect(page.getByPlaceholder('Email')).not.toBeVisible()
  10 | 
  11 |     // Should show the Data Import header
  12 |     await expect(page.locator('h1')).toContainText('Data')
  13 |     await expect(page.locator('h1')).toContainText('Import')
  14 |   })
  15 | 
  16 |   test('shows Sync and Stored Data tabs', async ({ page }) => {
  17 |     await page.goto('/data-import/')
  18 |     await page.waitForLoadState('networkidle')
  19 | 
  20 |     await expect(page.getByRole('button', { name: 'Sync' })).toBeVisible()
  21 |     await expect(page.getByRole('button', { name: 'Stored Data' })).toBeVisible()
  22 |   })
  23 | 
  24 |   test('Check for Updates button is present on Sync tab', async ({ page }) => {
  25 |     await page.goto('/data-import/')
  26 |     await page.waitForLoadState('networkidle')
  27 | 
  28 |     await expect(page.getByRole('button', { name: 'Check for Updates' })).toBeVisible()
  29 |   })
  30 | 
  31 |   test('Stored Data tab shows empty state', async ({ page }) => {
> 32 |     await page.goto('/data-import/')
     |                ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/data-import/
  33 |     await page.waitForLoadState('networkidle')
  34 | 
  35 |     await page.getByRole('button', { name: 'Stored Data' }).click()
  36 |     await expect(page.getByText('No unit profiles imported yet.')).toBeVisible()
  37 |   })
  38 | })
  39 | 
```
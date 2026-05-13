# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: brain.spec.ts >> Brain — Search tab >> search input and button visible
- Location: specs\brain.spec.ts:40:7

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/brain/
Call log:
  - navigating to "http://localhost:5173/brain/", waiting until "load"

```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test'
  2   | 
  3   | // ── App loads ───────────────────────────────────────────────────────────────
  4   | 
  5   | test.describe('Brain — app loads', () => {
  6   |   test('loads without auth gate', async ({ page }) => {
  7   |     await page.goto('/brain/')
  8   |     await page.waitForLoadState('networkidle')
  9   |     await expect(page.getByPlaceholder('Email')).not.toBeVisible()
  10  |     await expect(page.locator('h1')).toContainText('40K Brain')
  11  |   })
  12  | 
  13  |   test('shows all four tabs', async ({ page }) => {
  14  |     await page.goto('/brain/')
  15  |     await page.waitForLoadState('networkidle')
  16  |     // Tab buttons are in the header — use header scope to avoid matching form submit buttons
  17  |     const header = page.locator('header')
  18  |     await expect(header.getByRole('button', { name: 'Ask' })).toBeVisible()
  19  |     await expect(header.getByRole('button', { name: 'Search' })).toBeVisible()
  20  |     await expect(header.getByRole('button', { name: 'Browse' })).toBeVisible()
  21  |     await expect(header.getByRole('button', { name: 'Graph' })).toBeVisible()
  22  |   })
  23  | 
  24  |   test('Ask tab is default with input', async ({ page }) => {
  25  |     await page.goto('/brain/')
  26  |     await page.waitForLoadState('networkidle')
  27  |     await expect(page.getByPlaceholder(/Ask a 40K rules question/)).toBeVisible()
  28  |   })
  29  | })
  30  | 
  31  | // ── Search tab ──────────────────────────────────────────────────────────────
  32  | 
  33  | test.describe('Brain — Search tab', () => {
  34  |   test.beforeEach(async ({ page }) => {
> 35  |     await page.goto('/brain/')
      |                ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/brain/
  36  |     await page.waitForLoadState('networkidle')
  37  |     await page.getByRole('button', { name: 'Search' }).click()
  38  |   })
  39  | 
  40  |   test('search input and button visible', async ({ page }) => {
  41  |     await expect(page.getByPlaceholder(/Semantic search/)).toBeVisible()
  42  |     await expect(page.getByRole('button', { name: 'Search' }).last()).toBeVisible()
  43  |   })
  44  | 
  45  |   test('search for "sustained hits" returns results', async ({ page }) => {
  46  |     await page.getByPlaceholder(/Semantic search/).fill('sustained hits')
  47  |     await page.getByPlaceholder(/Semantic search/).press('Enter')
  48  |     // Wait for results to appear
  49  |     await expect(page.locator('[class*="bg-slate-900"]').first()).toBeVisible({ timeout: 15000 })
  50  |     // Should have numbered results
  51  |     await expect(page.getByText('%').first()).toBeVisible()
  52  |   })
  53  | 
  54  |   test('search for "blood angels" returns faction-filtered results', async ({ page }) => {
  55  |     await page.getByPlaceholder(/Semantic search/).fill('blood angels')
  56  |     await page.getByPlaceholder(/Semantic search/).press('Enter')
  57  |     // Results should be visible — look for percentage scores from ResultCard
  58  |     await expect(page.getByText('%').first()).toBeVisible({ timeout: 15000 })
  59  |     // Should show faction banner — might take a moment to render after large result set
  60  |     await expect(page.getByText(/Filtered to/)).toBeVisible({ timeout: 10000 })
  61  |   })
  62  | 
  63  |   test('search for "necrons" returns results', async ({ page }) => {
  64  |     await page.getByPlaceholder(/Semantic search/).fill('necrons')
  65  |     await page.getByPlaceholder(/Semantic search/).press('Enter')
  66  |     // Results should be visible — look for percentage scores from ResultCard
  67  |     await expect(page.getByText('%').first()).toBeVisible({ timeout: 15000 })
  68  |   })
  69  | 
  70  |   test('search for "dark eldar" returns drukhari results', async ({ page }) => {
  71  |     await page.getByPlaceholder(/Semantic search/).fill('dark eldar')
  72  |     await page.getByPlaceholder(/Semantic search/).press('Enter')
  73  |     // Results should be visible — look for percentage scores from ResultCard
  74  |     await expect(page.getByText('%').first()).toBeVisible({ timeout: 15000 })
  75  |     // Results should show drukhari as the faction, not dark eldar
  76  |     await expect(page.getByText('drukhari').first()).toBeVisible()
  77  |   })
  78  | 
  79  |   test('search for "space wolves" returns SM subfaction results', async ({ page }) => {
  80  |     await page.getByPlaceholder(/Semantic search/).fill('space wolves')
  81  |     await page.getByPlaceholder(/Semantic search/).press('Enter')
  82  |     // Results should be visible — look for percentage scores from ResultCard
  83  |     await expect(page.getByText('%').first()).toBeVisible({ timeout: 15000 })
  84  |     await expect(page.getByText(/space wolves/i).first()).toBeVisible()
  85  |   })
  86  | 
  87  |   test('clicking a search result shows full content', async ({ page }) => {
  88  |     await page.getByPlaceholder(/Semantic search/).fill('sustained hits')
  89  |     await page.getByPlaceholder(/Semantic search/).press('Enter')
  90  |     await expect(page.getByText('%').first()).toBeVisible({ timeout: 15000 })
  91  |     // Click first result
  92  |     await page.locator('button').filter({ has: page.getByText('%') }).first().click()
  93  |     // Should show detail panel with close button
  94  |     await expect(page.getByText(/Close/)).toBeVisible({ timeout: 5000 })
  95  |   })
  96  | 
  97  |   test('faction banner dismiss shows all results but keeps sort', async ({ page }) => {
  98  |     await page.getByPlaceholder(/Semantic search/).fill('blood angels')
  99  |     await page.getByPlaceholder(/Semantic search/).press('Enter')
  100 |     await expect(page.getByText(/Filtered to/)).toBeVisible({ timeout: 15000 })
  101 |     // Dismiss filter
  102 |     await page.getByText(/Show all/).click()
  103 |     // Banner should disappear
  104 |     await expect(page.getByText(/Filtered to/)).not.toBeVisible()
  105 |     // Results should still be visible
  106 |     await expect(page.getByText('%').first()).toBeVisible()
  107 |   })
  108 | })
  109 | 
  110 | // ── Ask tab ─────────────────────────────────────────────────────────────────
  111 | 
  112 | test.describe('Brain — Ask tab', () => {
  113 |   // Workers AI LLM calls take 10-30 seconds
  114 |   test.setTimeout(60000)
  115 | 
  116 |   test.beforeEach(async ({ page }) => {
  117 |     await page.goto('/brain/')
  118 |     await page.waitForLoadState('networkidle')
  119 |   })
  120 | 
  121 |   test('ask "how does cover work" returns an answer', async ({ page }) => {
  122 |     await page.getByPlaceholder(/Ask a 40K rules question/).fill('how does cover work')
  123 |     await page.getByPlaceholder(/Ask a 40K rules question/).press('Enter')
  124 |     // Wait for the Sources section — it only appears after the answer loads
  125 |     await expect(page.getByText(/Sources/)).toBeVisible({ timeout: 45000 })
  126 |   })
  127 | 
  128 |   test('ask about blood angels shows answer', async ({ page }) => {
  129 |     await page.getByPlaceholder(/Ask a 40K rules question/).fill('blood angels sustained hits')
  130 |     await page.getByPlaceholder(/Ask a 40K rules question/).press('Enter')
  131 |     // Wait for Sources section to confirm answer loaded
  132 |     await expect(page.getByText(/Sources/)).toBeVisible({ timeout: 45000 })
  133 |   })
  134 | 
  135 |   test('ask shows answer content', async ({ page }) => {
```
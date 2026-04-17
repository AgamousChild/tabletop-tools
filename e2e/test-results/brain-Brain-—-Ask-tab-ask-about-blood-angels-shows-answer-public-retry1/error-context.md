# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: brain.spec.ts >> Brain — Ask tab >> ask about blood angels shows answer
- Location: specs\brain.spec.ts:128:7

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/brain/
Call log:
  - navigating to "http://localhost:5173/brain/", waiting until "load"

```

# Test source

```ts
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
  35  |     await page.goto('/brain/')
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
> 117 |     await page.goto('/brain/')
      |                ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/brain/
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
  136 |     await page.getByPlaceholder(/Ask a 40K rules question/).fill('how does wound roll work')
  137 |     await page.getByPlaceholder(/Ask a 40K rules question/).press('Enter')
  138 |     // Wait for Sources section to confirm answer loaded
  139 |     await expect(page.getByText(/Sources/)).toBeVisible({ timeout: 45000 })
  140 |   })
  141 | })
  142 | 
  143 | // ── Browse tab ──────────────────────────────────────────────────────────────
  144 | 
  145 | test.describe('Brain — Browse tab', () => {
  146 |   test.beforeEach(async ({ page }) => {
  147 |     await page.goto('/brain/')
  148 |     await page.waitForLoadState('networkidle')
  149 |     await page.locator('header').getByRole('button', { name: 'Browse' }).click()
  150 |   })
  151 | 
  152 |   test('shows layer navigation with counts', async ({ page }) => {
  153 |     // Layers API takes 3-5 seconds
  154 |     await expect(page.getByText(/Core Rules/)).toBeVisible({ timeout: 10000 })
  155 |     await expect(page.getByText(/Faction/)).toBeVisible()
  156 |     await expect(page.getByText(/Units/)).toBeVisible()
  157 |     // Should show counts in parentheses
  158 |     await expect(page.getByText(/\(\d+\)/).first()).toBeVisible()
  159 |   })
  160 | 
  161 |   test('shows "Select a layer" before selection', async ({ page }) => {
  162 |     await expect(page.getByText(/Select a layer/)).toBeVisible()
  163 |   })
  164 | 
  165 |   test('clicking a layer loads nodes', async ({ page }) => {
  166 |     await expect(page.getByText(/Core Rules/)).toBeVisible({ timeout: 10000 })
  167 |     await page.getByText(/Core Rules/).click()
  168 |     // Nodes API takes a few seconds
  169 |     await expect(page.getByText(/Showing \d+ of/).first()).toBeVisible({ timeout: 10000 })
  170 |   })
  171 | 
  172 |   test('clicking a node shows detail view with content', async ({ page }) => {
  173 |     await expect(page.getByText(/Core Rules/)).toBeVisible({ timeout: 10000 })
  174 |     await page.getByText(/Core Rules/).click()
  175 |     await expect(page.getByText(/Showing \d+ of/).first()).toBeVisible({ timeout: 10000 })
  176 |     // Click first node
  177 |     await page.locator('button h3').first().click()
  178 |     // Should show detail view with back button
  179 |     await expect(page.getByText(/Back to list/)).toBeVisible({ timeout: 5000 })
  180 |     // Should show source attribution
  181 |     await expect(page.getByText(/Sources:/)).toBeVisible()
  182 |   })
  183 | 
  184 |   test('back button returns to node list', async ({ page }) => {
  185 |     await expect(page.getByText(/Core Rules/)).toBeVisible({ timeout: 10000 })
  186 |     await page.getByText(/Core Rules/).click()
  187 |     await expect(page.getByText(/Showing \d+ of/).first()).toBeVisible({ timeout: 10000 })
  188 |     await page.locator('button h3').first().click()
  189 |     await expect(page.getByText(/Back to list/)).toBeVisible({ timeout: 5000 })
  190 |     await page.getByText(/Back to list/).click()
  191 |     // Should return to the node list
  192 |     await expect(page.getByText(/Showing \d+ of/).first()).toBeVisible()
  193 |   })
  194 | })
  195 | 
  196 | // ── Graph tab ───────────────────────────────────────────────────────────────
  197 | 
  198 | test.describe('Brain — Graph tab', () => {
  199 |   test.beforeEach(async ({ page }) => {
  200 |     await page.goto('/brain/')
  201 |     await page.waitForLoadState('networkidle')
  202 |     await page.getByRole('button', { name: 'Graph' }).click()
  203 |   })
  204 | 
  205 |   test('shows search input and Visualize button', async ({ page }) => {
  206 |     await expect(page.getByPlaceholder(/Search to visualize/)).toBeVisible()
  207 |     await expect(page.getByRole('button', { name: 'Visualize' })).toBeVisible()
  208 |   })
  209 | 
  210 |   test('shows layer color legend', async ({ page }) => {
  211 |     await expect(page.getByText('core', { exact: true })).toBeVisible()
  212 |     await expect(page.getByText('faction', { exact: true })).toBeVisible()
  213 |     await expect(page.getByText('unit', { exact: true })).toBeVisible()
  214 |   })
  215 | 
  216 |   test('visualize "blood angels" renders graph without error', async ({ page }) => {
  217 |     await page.getByPlaceholder(/Search to visualize/).fill('blood angels')
```
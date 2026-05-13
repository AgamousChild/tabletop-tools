# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: brain.spec.ts >> Brain — Graph tab >> visualize "blood angels" renders graph without error
- Location: specs\brain.spec.ts:216:7

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/brain/
Call log:
  - navigating to "http://localhost:5173/brain/", waiting until "load"

```

# Test source

```ts
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
> 200 |     await page.goto('/brain/')
      |                ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/brain/
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
  218 |     await page.getByRole('button', { name: 'Visualize' }).click()
  219 |     // Should not show an error — wait for the graph area to be present
  220 |     await page.waitForTimeout(3000)
  221 |     // No error message should be visible
  222 |     await expect(page.getByText(/error/i)).not.toBeVisible()
  223 |   })
  224 | })
  225 | 
  226 | // ── API endpoints direct ────────────────────────────────────────────────────
  227 | 
  228 | test.describe('Brain — API endpoints', () => {
  229 |   test('/search returns detected factions and results', async ({ request }) => {
  230 |     const res = await request.post('/brain/api/search', {
  231 |       data: { query: 'sustained hits', limit: 5 },
  232 |     })
  233 |     expect(res.ok()).toBe(true)
  234 |     const data = await res.json()
  235 |     expect(data.detected).toBeDefined()
  236 |     expect(data.results).toBeDefined()
  237 |     expect(data.results.length).toBeGreaterThan(0)
  238 |   })
  239 | 
  240 |   test('/search with faction detects and filters correctly', async ({ request }) => {
  241 |     const res = await request.post('/brain/api/search', {
  242 |       data: { query: 'blood angels death company', limit: 10 },
  243 |     })
  244 |     const data = await res.json()
  245 |     expect(data.detected.factions).toContain('space-marines')
  246 |     expect(data.detected.subfaction).toBe('blood angels')
  247 |     // All results should be space-marines or generic
  248 |     for (const r of data.results) {
  249 |       if (r.factionId) {
  250 |         expect(r.factionId).toBe('space-marines')
  251 |       }
  252 |     }
  253 |   })
  254 | 
  255 |   test('/search faction browse returns many results for just "necrons"', async ({ request }) => {
  256 |     const res = await request.post('/brain/api/search', {
  257 |       data: { query: 'necrons', limit: 50 },
  258 |     })
  259 |     const data = await res.json()
  260 |     expect(data.detected.factions).toContain('necrons')
  261 |     expect(data.results.length).toBeGreaterThan(20)
  262 |   })
  263 | 
  264 |   test('/search faction browse returns many results for "blood angels"', async ({ request }) => {
  265 |     const res = await request.post('/brain/api/search', {
  266 |       data: { query: 'blood angels', limit: 50 },
  267 |     })
  268 |     const data = await res.json()
  269 |     expect(data.detected.factions).toContain('space-marines')
  270 |     expect(data.detected.subfaction).toBe('blood angels')
  271 |     expect(data.results.length).toBeGreaterThan(20)
  272 |     // BA-specific content should be first
  273 |     const firstBA = data.results.findIndex((r: any) => r.subfaction === 'blood angels')
  274 |     const firstGeneric = data.results.findIndex((r: any) => !r.subfaction && r.factionId === 'space-marines')
  275 |     if (firstBA >= 0 && firstGeneric >= 0) {
  276 |       expect(firstBA).toBeLessThan(firstGeneric)
  277 |     }
  278 |   })
  279 | 
  280 |   test('/search subfaction filter excludes other chapters', async ({ request }) => {
  281 |     const res = await request.post('/brain/api/search', {
  282 |       data: { query: 'blood angels', limit: 50 },
  283 |     })
  284 |     const data = await res.json()
  285 |     // Should NOT contain space wolves, dark angels, etc. content
  286 |     for (const r of data.results) {
  287 |       if (r.subfaction) {
  288 |         expect(r.subfaction, `Found ${r.subfaction} content in BA results: ${r.title}`).toBe('blood angels')
  289 |       }
  290 |     }
  291 |   })
  292 | 
  293 |   test('/search for every top-level faction returns results', async ({ request }) => {
  294 |     const factions = [
  295 |       ['necrons', 'necrons'],
  296 |       ['orks', 'orks'],
  297 |       ['tyranids', 'tyranids'],
  298 |       ['aeldari', 'aeldari'],
  299 |       ['tau', 't-au-empire'],
  300 |       ['space marines', 'space-marines'],
```
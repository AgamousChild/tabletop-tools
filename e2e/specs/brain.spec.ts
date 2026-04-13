import { test, expect } from '@playwright/test'

// ── App loads ───────────────────────────────────────────────────────────────

test.describe('Brain — app loads', () => {
  test('loads without auth gate', async ({ page }) => {
    await page.goto('/brain/')
    await page.waitForLoadState('networkidle')
    await expect(page.getByPlaceholder('Email')).not.toBeVisible()
    await expect(page.locator('h1')).toContainText('40K Brain')
  })

  test('shows all four tabs', async ({ page }) => {
    await page.goto('/brain/')
    await page.waitForLoadState('networkidle')
    // Tab buttons are in the header — use header scope to avoid matching form submit buttons
    const header = page.locator('header')
    await expect(header.getByRole('button', { name: 'Ask' })).toBeVisible()
    await expect(header.getByRole('button', { name: 'Search' })).toBeVisible()
    await expect(header.getByRole('button', { name: 'Browse' })).toBeVisible()
    await expect(header.getByRole('button', { name: 'Graph' })).toBeVisible()
  })

  test('Ask tab is default with input', async ({ page }) => {
    await page.goto('/brain/')
    await page.waitForLoadState('networkidle')
    await expect(page.getByPlaceholder(/Ask a 40K rules question/)).toBeVisible()
  })
})

// ── Search tab ──────────────────────────────────────────────────────────────

test.describe('Brain — Search tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/brain/')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: 'Search' }).click()
  })

  test('search input and button visible', async ({ page }) => {
    await expect(page.getByPlaceholder(/Semantic search/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Search' }).last()).toBeVisible()
  })

  test('search for "sustained hits" returns results', async ({ page }) => {
    await page.getByPlaceholder(/Semantic search/).fill('sustained hits')
    await page.getByPlaceholder(/Semantic search/).press('Enter')
    // Wait for results to appear
    await expect(page.locator('[class*="bg-slate-900"]').first()).toBeVisible({ timeout: 15000 })
    // Should have numbered results
    await expect(page.getByText('%').first()).toBeVisible()
  })

  test('search for "blood angels" returns faction-filtered results', async ({ page }) => {
    await page.getByPlaceholder(/Semantic search/).fill('blood angels')
    await page.getByPlaceholder(/Semantic search/).press('Enter')
    // Results should be visible — look for percentage scores from ResultCard
    await expect(page.getByText('%').first()).toBeVisible({ timeout: 15000 })
    // Should show faction banner
    await expect(page.getByText(/Filtered to/)).toBeVisible()
    await expect(page.getByText(/blood angels/i)).toBeVisible()
  })

  test('search for "necrons" returns results', async ({ page }) => {
    await page.getByPlaceholder(/Semantic search/).fill('necrons')
    await page.getByPlaceholder(/Semantic search/).press('Enter')
    // Results should be visible — look for percentage scores from ResultCard
    await expect(page.getByText('%').first()).toBeVisible({ timeout: 15000 })
  })

  test('search for "dark eldar" returns drukhari results', async ({ page }) => {
    await page.getByPlaceholder(/Semantic search/).fill('dark eldar')
    await page.getByPlaceholder(/Semantic search/).press('Enter')
    // Results should be visible — look for percentage scores from ResultCard
    await expect(page.getByText('%').first()).toBeVisible({ timeout: 15000 })
    // Results should show drukhari as the faction, not dark eldar
    await expect(page.getByText('drukhari').first()).toBeVisible()
  })

  test('search for "space wolves" returns SM subfaction results', async ({ page }) => {
    await page.getByPlaceholder(/Semantic search/).fill('space wolves')
    await page.getByPlaceholder(/Semantic search/).press('Enter')
    // Results should be visible — look for percentage scores from ResultCard
    await expect(page.getByText('%').first()).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(/space wolves/i).first()).toBeVisible()
  })

  test('faction banner dismiss shows all results but keeps sort', async ({ page }) => {
    await page.getByPlaceholder(/Semantic search/).fill('blood angels')
    await page.getByPlaceholder(/Semantic search/).press('Enter')
    await expect(page.getByText(/Filtered to/)).toBeVisible({ timeout: 15000 })
    // Dismiss filter
    await page.getByText(/Show all/).click()
    // Banner should disappear
    await expect(page.getByText(/Filtered to/)).not.toBeVisible()
    // Results should still be visible
    await expect(page.getByText('%').first()).toBeVisible()
  })
})

// ── Ask tab ─────────────────────────────────────────────────────────────────

test.describe('Brain — Ask tab', () => {
  // Workers AI LLM calls take 10-30 seconds
  test.setTimeout(60000)

  test.beforeEach(async ({ page }) => {
    await page.goto('/brain/')
    await page.waitForLoadState('networkidle')
  })

  test('ask "how does cover work" returns an answer', async ({ page }) => {
    await page.getByPlaceholder(/Ask a 40K rules question/).fill('how does cover work')
    await page.getByPlaceholder(/Ask a 40K rules question/).press('Enter')
    // Wait for answer to appear (LLM takes 10-30 seconds)
    await expect(page.locator('[class*="bg-slate-900"]').first()).toBeVisible({ timeout: 45000 })
  })

  test('ask about blood angels shows answer with BA content', async ({ page }) => {
    await page.getByPlaceholder(/Ask a 40K rules question/).fill('blood angels sustained hits')
    await page.getByPlaceholder(/Ask a 40K rules question/).press('Enter')
    await expect(page.locator('[class*="bg-slate-900"]').first()).toBeVisible({ timeout: 45000 })
    // Answer should contain blood angels related content
    await expect(page.getByText(/blood angel/i).first()).toBeVisible()
  })

  test('ask shows answer content', async ({ page }) => {
    await page.getByPlaceholder(/Ask a 40K rules question/).fill('how does wound roll work')
    await page.getByPlaceholder(/Ask a 40K rules question/).press('Enter')
    // Wait for answer — LLM takes time
    await expect(page.locator('[class*="bg-slate-900"]').first()).toBeVisible({ timeout: 45000 })
    // Answer should contain wound-related content
    await expect(page.getByText(/wound/i).first()).toBeVisible()
  })
})

// ── Browse tab ──────────────────────────────────────────────────────────────

test.describe('Brain — Browse tab', () => {
  test('Browse tab loads and shows layer navigation or sync prompt', async ({ page }) => {
    await page.goto('/brain/')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: 'Browse' }).click()

    // Should show either the layer nav or a sync prompt — not nothing
    const hasLayerNav = await page.getByText('Core Rules').isVisible().catch(() => false)
    const hasSyncPrompt = await page.getByText(/sync/i).isVisible().catch(() => false)
    expect(hasLayerNav || hasSyncPrompt).toBe(true)
  })
})

// ── Graph tab ───────────────────────────────────────────────────────────────

test.describe('Brain — Graph tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/brain/')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: 'Graph' }).click()
  })

  test('shows search input and Visualize button', async ({ page }) => {
    await expect(page.getByPlaceholder(/Search to visualize/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Visualize' })).toBeVisible()
  })

  test('shows layer color legend', async ({ page }) => {
    await expect(page.getByText('core', { exact: true })).toBeVisible()
    await expect(page.getByText('faction', { exact: true })).toBeVisible()
    await expect(page.getByText('unit', { exact: true })).toBeVisible()
  })

  test('visualize "blood angels" renders graph without error', async ({ page }) => {
    await page.getByPlaceholder(/Search to visualize/).fill('blood angels')
    await page.getByRole('button', { name: 'Visualize' }).click()
    // Should not show an error — wait for the graph area to be present
    await page.waitForTimeout(3000)
    // No error message should be visible
    await expect(page.getByText(/error/i)).not.toBeVisible()
  })
})

// ── API endpoints direct ────────────────────────────────────────────────────

test.describe('Brain — API endpoints', () => {
  test('/search returns detected factions and results', async ({ request }) => {
    const res = await request.post('/brain/api/search', {
      data: { query: 'sustained hits', limit: 5 },
    })
    expect(res.ok()).toBe(true)
    const data = await res.json()
    expect(data.detected).toBeDefined()
    expect(data.results).toBeDefined()
    expect(data.results.length).toBeGreaterThan(0)
  })

  test('/search with faction detects and filters correctly', async ({ request }) => {
    const res = await request.post('/brain/api/search', {
      data: { query: 'blood angels death company', limit: 10 },
    })
    const data = await res.json()
    expect(data.detected.factions).toContain('space-marines')
    expect(data.detected.subfaction).toBe('blood angels')
    // All results should be space-marines or generic
    for (const r of data.results) {
      if (r.factionId) {
        expect(r.factionId).toBe('space-marines')
      }
    }
  })

  test('/search faction browse returns many results for just "necrons"', async ({ request }) => {
    const res = await request.post('/brain/api/search', {
      data: { query: 'necrons', limit: 50 },
    })
    const data = await res.json()
    expect(data.detected.factions).toContain('necrons')
    expect(data.results.length).toBeGreaterThan(20)
  })

  test('/search faction browse returns many results for "blood angels"', async ({ request }) => {
    const res = await request.post('/brain/api/search', {
      data: { query: 'blood angels', limit: 50 },
    })
    const data = await res.json()
    expect(data.detected.factions).toContain('space-marines')
    expect(data.detected.subfaction).toBe('blood angels')
    expect(data.results.length).toBeGreaterThan(20)
    // BA-specific content should be first
    const firstBA = data.results.findIndex((r: any) => r.subfaction === 'blood angels')
    const firstGeneric = data.results.findIndex((r: any) => !r.subfaction && r.factionId === 'space-marines')
    if (firstBA >= 0 && firstGeneric >= 0) {
      expect(firstBA).toBeLessThan(firstGeneric)
    }
  })

  test('/search subfaction filter excludes other chapters', async ({ request }) => {
    const res = await request.post('/brain/api/search', {
      data: { query: 'blood angels', limit: 50 },
    })
    const data = await res.json()
    // Should NOT contain space wolves, dark angels, etc. content
    for (const r of data.results) {
      if (r.subfaction) {
        expect(r.subfaction, `Found ${r.subfaction} content in BA results: ${r.title}`).toBe('blood angels')
      }
    }
  })

  test('/search for every top-level faction returns results', async ({ request }) => {
    const factions = [
      ['necrons', 'necrons'],
      ['orks', 'orks'],
      ['tyranids', 'tyranids'],
      ['aeldari', 'aeldari'],
      ['tau', 't-au-empire'],
      ['space marines', 'space-marines'],
      ['chaos space marines', 'chaos-space-marines'],
      ['death guard', 'death-guard'],
      ['thousand sons', 'thousand-sons'],
      ['grey knights', 'grey-knights'],
      ['custodes', 'adeptus-custodes'],
      ['drukhari', 'drukhari'],
      ['mechanicus', 'adeptus-mechanicus'],
      ['sororitas', 'adepta-sororitas'],
      ['genestealer cults', 'genestealer-cults'],
      ['imperial knights', 'imperial-knights'],
      ['chaos knights', 'chaos-knights'],
      ['votann', 'leagues-of-votann'],
    ]
    for (const [query, expectedFaction] of factions) {
      const res = await request.post('/brain/api/search', {
        data: { query, limit: 5 },
      })
      expect(res.ok(), `${query} search failed`).toBe(true)
      const data = await res.json()
      expect(data.detected.factions, `${query} should detect ${expectedFaction}`).toContain(expectedFaction)
      expect(data.results.length, `${query} should return results`).toBeGreaterThan(0)
    }
  })

  test('/search for every SM subfaction returns results with correct subfaction', async ({ request }) => {
    const chapters = [
      'blood angels', 'dark angels', 'space wolves', 'black templars',
      'ultramarines', 'iron hands', 'salamanders', 'raven guard',
      'imperial fists', 'white scars', 'deathwatch',
    ]
    for (const chapter of chapters) {
      const res = await request.post('/brain/api/search', {
        data: { query: chapter, limit: 5 },
      })
      expect(res.ok(), `${chapter} search failed`).toBe(true)
      const data = await res.json()
      expect(data.detected.factions, `${chapter} should detect space-marines`).toContain('space-marines')
      expect(data.detected.subfaction, `${chapter} should set subfaction`).toBe(chapter)
      expect(data.results.length, `${chapter} should return results`).toBeGreaterThan(0)
      // No other chapter content should appear
      for (const r of data.results) {
        if (r.subfaction && r.subfaction !== chapter) {
          expect.fail(`${chapter} search returned ${r.subfaction} content: ${r.title}`)
        }
      }
    }
  })

  test('/ask returns answer, reference, and detected', async ({ request }) => {
    const res = await request.post('/brain/api/ask', {
      data: { question: 'how does cover work' },
    })
    expect(res.ok()).toBe(true)
    const data = await res.json()
    expect(data.detected).toBeDefined()
    expect(data.answer).toBeDefined()
    expect(data.answer.length).toBeGreaterThan(0)
    expect(data.reference).toBeDefined()
    expect(data.sources).toBeDefined()
    expect(data.connectedCount).toBeDefined()
  })

  test('/ask with subfaction returns two-section answer', async ({ request }) => {
    const res = await request.post('/brain/api/ask', {
      data: { question: 'blood angels sustained hits' },
    })
    expect(res.ok()).toBe(true)
    const data = await res.json()
    expect(data.detected.subfaction).toBe('blood angels')
    // Answer should have section structure (either from LLM or deterministic)
    const answer = data.answer as string
    const hasSections = answer.includes('BLOOD ANGELS') || answer.includes('Blood Angels Specific')
    expect(hasSections, 'Answer should have BA-specific section').toBe(true)
  })

  test('/graph-data returns nodes and edges', async ({ request }) => {
    const res = await request.post('/brain/api/graph-data', {
      data: { query: 'blood angels', limit: 10 },
    })
    expect(res.ok()).toBe(true)
    const data = await res.json()
    expect(data.detected).toBeDefined()
    expect(data.nodes).toBeDefined()
    expect(data.nodes.length).toBeGreaterThan(0)
    expect(data.edges).toBeDefined()
  })

  test('/manifest.json returns valid manifest', async ({ request }) => {
    const res = await request.get('/brain/api/manifest.json')
    expect(res.ok()).toBe(true)
    const data = await res.json()
    expect(data.version).toBeDefined()
    expect(data.files).toBeDefined()
    expect(Object.keys(data.files).length).toBeGreaterThan(0)
  })
})

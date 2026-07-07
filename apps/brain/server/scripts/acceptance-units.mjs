/**
 * acceptance-units.mjs — 432-check unit acceptance test against the LIVE site.
 *
 * Per docs/superpowers/plans/2026-07-06-unit-count-reconciliation.md §5:
 * for every official faction (36), load a random 11e unit through EVERY brain
 * interface (ask, search, browse, graph) in the real website UI, verify the
 * correct unit and datasheet data render, and screenshot every load.
 * 4 interfaces × 36 factions × 3 iterations = 432 checks.
 *
 * Prereqs: `.local/unit-names-11e.json` (written by scripts/count-units.ts).
 *
 * Usage (from apps/brain/server/):
 *   node scripts/acceptance-units.mjs [--iterations=3] [--interfaces=ask,search,browse,graph] [--factions=orks,necrons]
 *
 * Output:
 *   .local/acceptance-units/<runId>/screenshots/i<N>/<faction>/<interface>--<unit-slug>.png
 *   .local/acceptance-units/<runId>/results.json
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { chromium } from 'playwright'

const BASE = 'https://tabletop-tools.net/brain#edition=11th'
const API = 'https://tabletop-tools.net/brain/api'
const NAMES_FILE = new URL('../.local/unit-names-11e.json', import.meta.url)

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a)
    return m ? [m[1], m[2] ?? true] : [a, true]
  }),
)
const ITERATIONS = parseInt(args.iterations ?? '3', 10)
const INTERFACES = (args.interfaces ?? 'browse,search,graph,ask').split(',')
const unitNames = JSON.parse(readFileSync(NAMES_FILE, 'utf8'))
const FACTIONS = args.factions ? args.factions.split(',') : Object.keys(unitNames).sort()

const runId = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const OUT_DIR = join(new URL('../.local/acceptance-units', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), runId)
mkdirSync(OUT_DIR, { recursive: true })

/** Deterministic RNG so re-runs of the same runId args are reproducible-ish per cell. */
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function hashStr(s) {
  let h = 2166136261
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return h >>> 0
}
const slugify = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const normTitle = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '')

// ── Build the Units-layer page map once (browse pagination navigation) ──────
async function buildUnitsPageMap() {
  const pageOf = new Map() // normTitle+factionId -> { page, title }
  let page = 1
  let totalPages = 1
  do {
    let res
    for (let attempt = 1; ; attempt++) {
      try {
        res = await fetch(`${API}/browse/nodes?layer=units&page=${page}&pageSize=20&edition=11th`)
        if (res.ok) break
        throw new Error(`HTTP ${res.status}`)
      } catch (err) {
        if (attempt >= 5) throw new Error(`browse/nodes page ${page}: ${err.message}`)
        await new Promise((r) => setTimeout(r, attempt * 2000))
      }
    }
    const data = await res.json()
    totalPages = data.totalPages ?? 1
    for (const n of data.nodes ?? []) {
      pageOf.set(`${n.factionId}::${normTitle(n.title)}`, { page, title: n.title })
    }
    page++
  } while (page <= totalPages)
  return { pageOf, totalPages }
}

const results = []
let pass = 0
let fail = 0

function record(iter, faction, iface, unit, ok, detail, shot) {
  results.push({ iteration: iter, faction, interface: iface, unit, ok, detail, screenshot: shot })
  if (ok) pass++
  else fail++
  console.log(`${ok ? 'PASS' : 'FAIL'} [i${iter}] ${faction} / ${iface} / ${unit}${ok ? '' : ` — ${detail}`}`)
}

async function screenshot(page, iter, faction, iface, unit) {
  const dir = join(OUT_DIR, 'screenshots', `i${iter}`, faction)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${iface}--${slugify(unit)}.png`)
  await page.screenshot({ path: file })
  return file.replace(OUT_DIR, '').replace(/\\/g, '/')
}

/** Assert the card overlay shows the unit datasheet: title + stat labels. */
async function verifyOverlayCard(page, unit) {
  const overlay = page.locator('[data-testid="overlay-backdrop"]')
  await overlay.waitFor({ state: 'visible', timeout: 15000 })
  const text = (await overlay.innerText()).toLowerCase()
  const unitKey = normTitle(unit)
  const overlayKey = normTitle(text)
  if (!overlayKey.includes(unitKey)) return `overlay does not contain unit title "${unit}"`
  // Datasheet stat labels — the layout renders M/T/SV/W headers.
  const hasStats = /\bm\b/.test(text) || text.includes('sv') || text.includes('wounds')
  if (!hasStats) return 'overlay lacks datasheet stat labels'
  return null
}

async function dismissOverlay(page) {
  // The overlay closes on backdrop click (outside the inner card) — click
  // the top-left corner. No Escape handler exists.
  const backdrop = page.locator('[data-testid="overlay-backdrop"]')
  if (await backdrop.isVisible().catch(() => false)) {
    await backdrop.click({ position: { x: 5, y: 5 } }).catch(() => {})
    await backdrop.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
  }
}

async function checkBrowse(page, unit, faction, pageMap) {
  const target = pageMap.pageOf.get(`${faction}::${normTitle(unit)}`)
  if (!target) return `unit not found in live units layer (page map)`
  await page.locator('[data-testid="tab-browse"]').click()
  // Select the Units layer (layers load can be slow on a cold CDN cache).
  const unitsLayer = page.locator('aside button', { hasText: /Units/ })
  await unitsLayer.waitFor({ timeout: 90000 })
  await unitsLayer.click()
  // Reset to page 1 by re-selecting the layer? Selecting the same layer does
  // not reset the page, so navigate with Prev until it disables.
  const next = page.locator('button[aria-label="Next page"]')
  const prev = page.locator('button[aria-label="Previous page"]')
  await next.first().waitFor({ timeout: 60000 })
  while (!(await prev.isDisabled().catch(() => true))) {
    await prev.click()
    await page.waitForTimeout(100)
    await next.waitFor({ timeout: 60000 })
  }
  // Paginate forward, scanning each rendered page for the unit's card. The
  // page map gives the expected page; scan the whole layer as fallback since
  // ordering can drift between isolates.
  const key = normTitle(unit)
  const resultsArea = page.locator('div.flex-1.p-4:visible').first()
  let prevText = ''
  for (let p = 1; p <= pageMap.totalPages; p++) {
    // Pagination is unmounted while a page loads — waiting for Next to be
    // attached again is the "page rendered" signal. Cached responses can
    // resolve before React swaps pages, so ALSO wait for the results text to
    // actually change from the previous page.
    await next.waitFor({ timeout: 60000 })
    let text = ''
    for (let poll = 0; poll < 40; poll++) {
      text = await resultsArea.innerText().catch(() => '')
      if (text && text !== prevText && !text.includes('Loading')) break
      await page.waitForTimeout(250)
    }
    prevText = text
    if (normTitle(text).includes(key)) {
      const card = resultsArea
        .locator('button', { hasText: new RegExp(escapeRe(target.title), 'i') })
        .first()
      await card.waitFor({ timeout: 20000 })
      await card.click()
      return await verifyOverlayCard(page, unit)
    }
    if (await next.isDisabled()) break
    await next.click()
  }
  return `unit "${unit}" not found while paginating the Units layer`
}

async function checkSearch(page, unit) {
  await page.locator('[data-testid="tab-search"]').click()
  const input = page.locator('input[placeholder="Semantic search across all rules..."]')
  await input.fill(unit)
  await page.locator('button:not([data-testid])', { hasText: /^Search$/ }).click()
  // Wait for results — the matching VISIBLE result card (hidden browse/graph
  // panels keep their own stale buttons in the DOM).
  const card = page
    .locator('button:visible', { hasText: new RegExp(escapeRe(unit), 'i') })
    .first()
  await card.waitFor({ timeout: 45000 })
  await card.click()
  return await verifyOverlayCard(page, unit)
}

async function checkGraph(page, unit) {
  await page.locator('[data-testid="tab-graph"]').click()
  const input = page.locator('input[placeholder="Search to visualize graph..."]')
  await input.fill(unit)
  await page.locator('button:visible', { hasText: /^(Visualize|\.\.\.)$/ }).first().click()
  // React Flow renders node labels as <p> elements (title truncated to 50).
  const label = page
    .locator('p:visible', { hasText: new RegExp(escapeRe(shorten(unit)), 'i') })
    .first()
  try {
    await label.waitFor({ state: 'attached', timeout: 60000 })
  } catch {
    return `graph has no node labelled "${unit}"`
  }
  return null
}

async function checkAsk(page, unit, faction) {
  await page.locator('[data-testid="tab-ask"]').click()
  // Clear previous results if the clear button is present.
  const clear = page.locator('[data-testid="ask-clear-results"]')
  if (await clear.isVisible().catch(() => false)) await clear.click()
  const input = page.locator('input[placeholder="Ask a 40K rules question..."]')
  await input.fill(`Show me the ${unit} datasheet (${faction.replace(/-/g, ' ')})`)
  await page.locator('button:not([data-testid])', { hasText: /^Ask$/ }).click()
  // Answer can take a while (RAG + LLM).
  await page
    .locator('[data-testid="ask-clear-results"]')
    .waitFor({ timeout: 120000 })
  const body = (await page.locator('main').first().innerText().catch(() => '')) ||
    (await page.innerText('body'))
  if (!normTitle(body).includes(normTitle(unit))) {
    return `ask answer/references do not mention "${unit}"`
  }
  return null
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
/** Graph node labels truncate long titles; match on the first ~18 chars. */
function shorten(s) {
  return s.length > 18 ? s.slice(0, 18) : s
}

const CHECKS = { browse: checkBrowse, search: checkSearch, graph: checkGraph, ask: checkAsk }

console.log(`Run ${runId}: ${INTERFACES.length} interfaces × ${FACTIONS.length} factions × ${ITERATIONS} iterations = ${INTERFACES.length * FACTIONS.length * ITERATIONS} checks`)
console.log('Building units page map...')
const pageMap = await buildUnitsPageMap()
console.log(`  ${pageMap.pageOf.size} units across ${pageMap.totalPages} pages`)

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.locator('[data-testid="tab-browse"]').waitFor({ timeout: 30000 })

for (let iter = 1; iter <= ITERATIONS; iter++) {
  for (const faction of FACTIONS) {
    const pool = unitNames[faction] ?? []
    if (pool.length === 0) {
      for (const iface of INTERFACES) record(iter, faction, iface, '(none)', false, 'no 11e units for faction')
      continue
    }
    for (const iface of INTERFACES) {
      // Independent random unit PER interface check — per Micah's directive
      // each of the 432 checks draws its own unit, not one unit shared
      // across the 4 interfaces.
      const rng = mulberry32(hashStr(`${runId}:${iter}:${faction}:${iface}`))
      const unit = pool[Math.floor(rng() * pool.length)]
      let detail = null
      try {
        detail = await CHECKS[iface](page, unit, faction, pageMap)
      } catch (err) {
        detail = `exception: ${err.message?.slice(0, 200)}`
      }
      let shot = null
      try {
        shot = await screenshot(page, iter, faction, iface, unit)
      } catch (err) {
        detail = detail ?? `screenshot failed: ${err.message}`
      }
      record(iter, faction, iface, unit, detail === null, detail, shot)
      await dismissOverlay(page)
    }
  }
  // Persist partial results after each iteration.
  writeFileSync(join(OUT_DIR, 'results.json'), JSON.stringify({ runId, pass, fail, results }, null, 2))
}

await browser.close()
writeFileSync(join(OUT_DIR, 'results.json'), JSON.stringify({ runId, pass, fail, results }, null, 2))
console.log(`\n${pass} passed, ${fail} failed → ${join(OUT_DIR, 'results.json')}`)
process.exit(fail > 0 ? 1 : 0)

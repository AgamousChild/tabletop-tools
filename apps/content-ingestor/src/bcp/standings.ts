import type { Page } from 'playwright'

export interface BCPStanding {
  placement: number
  playerName: string
  faction: string
  wins: number
  losses: number
  draws: number
  points: number
  armyListUrl?: string
}

/**
 * Raw row data extracted from a BCP standings page via page.evaluate().
 * Supports two DOM patterns:
 *   a) "record" field: "W-L-D" string (e.g. "5-1-1")
 *   b) separate "wins", "losses", "draws" fields (alternate BCP layout)
 */
export interface RawStandingRow {
  rank: string
  name: string
  faction: string
  record?: string
  wins?: string
  losses?: string
  draws?: string
  points: string
  armyListUrl?: string
}

/**
 * Parse W-L-D from a "5-1-1" style string.
 * Returns [0, 0, 0] if the string does not match the pattern.
 */
function parseRecord(record: string): [number, number, number] {
  const m = record.match(/^(\d+)-(\d+)-(\d+)$/)
  if (!m) return [0, 0, 0]
  return [parseInt(m[1]!, 10), parseInt(m[2]!, 10), parseInt(m[3]!, 10)]
}

/**
 * Pure function — converts raw row data (already extracted from the page DOM)
 * into typed BCPStanding objects. Rows without a player name are discarded.
 *
 * This is the testable core of the standings scraper.
 */
export function parseStandingsFromRows(rows: RawStandingRow[]): BCPStanding[] {
  const results: BCPStanding[] = []

  for (const row of rows) {
    const name = row.name.trim()
    if (!name) continue // skip header rows / empty entries

    let wins = 0
    let losses = 0
    let draws = 0

    if (row.record !== undefined) {
      ;[wins, losses, draws] = parseRecord(row.record.trim())
    } else {
      wins = parseInt(row.wins ?? '0', 10) || 0
      losses = parseInt(row.losses ?? '0', 10) || 0
      draws = parseInt(row.draws ?? '0', 10) || 0
    }

    results.push({
      placement: parseInt(row.rank, 10) || 0,
      playerName: name,
      faction: row.faction.trim(),
      wins,
      losses,
      draws,
      points: parseInt(row.points, 10) || 0,
      armyListUrl: row.armyListUrl,
    })
  }

  return results
}

/**
 * Scrape standings from a BCP event page.
 *
 * Strategy (in order):
 *   1. Look for a table with rows — most common BCP layout.
 *   2. Look for card-style player entries (div/li with rank + name).
 *   3. Fall back to extracting from raw text content anchors.
 *
 * Handles BCP infinite-scroll by repeatedly scrolling to the bottom and
 * waiting for new content until the count stabilises.
 */
/**
 * Parse standings from BCP's text format.
 * BCP renders player entries as text blocks with this pattern:
 *   placement (2-digit number like "01", "02")
 *   (optional "MANUAL" badge)
 *   player name - team name
 *   faction name
 *   round scores (XX / XX / XX / ...)
 */
export function parseStandingsFromText(text: string): BCPStanding[] {
  const lines = text.split('\n').map(l => l.trim())
  const results: BCPStanding[] = []

  for (let i = 0; i < lines.length; i++) {
    // Look for placement numbers: "01", "02", ... "245"
    if (!/^\d{1,3}$/.test(lines[i]!)) continue
    const placement = parseInt(lines[i]!, 10)
    if (placement < 1 || placement > 999) continue

    // Scan forward for player name and faction (skip empty lines and "MANUAL")
    let playerName = ''
    let faction = ''
    let scores = ''

    for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
      const line = lines[j]!
      if (!line || line === 'MANUAL') continue

      // Round scores pattern: "XX / XX / XX / ..."
      if (/^\d+\s*\/\s*\d+/.test(line)) {
        scores = line
        break
      }

      // First non-empty non-MANUAL line = player name
      if (!playerName) {
        playerName = line
        continue
      }

      // Second non-empty line = faction
      if (!faction) {
        faction = line
        continue
      }
    }

    if (!playerName) continue

    // Calculate wins/losses/draws from round scores
    // Scores > 50 are typically wins, < 50 losses, exactly 50 is a draw (simplified)
    const scoreNums = scores
      ? scores.split('/').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
      : []
    const totalPoints = scoreNums.reduce((sum, s) => sum + s, 0)

    results.push({
      placement,
      playerName,
      faction,
      wins: 0,    // BCP placings tab doesn't show W/L/D directly
      losses: 0,
      draws: 0,
      points: totalPoints,
    })
  }

  return results
}

export async function scrapeStandings(eventUrl: string, page: Page): Promise<BCPStanding[]> {
  // BCP uses "Placings" tab, not "standings"
  const placingsUrl = eventUrl.includes('?')
    ? `${eventUrl}&active_tab=standings`
    : `${eventUrl}?active_tab=standings`

  await page.goto(placingsUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForTimeout(3000)

  // Click "Placings" tab if visible
  const placingsTab = await page.$('button:has-text("Placings"), a:has-text("Placings")')
  if (placingsTab) {
    await placingsTab.click()
    await page.waitForTimeout(2000)
  }

  // Scroll until content stabilises (handles infinite scroll / lazy loading)
  let lastText = ''
  for (let i = 0; i < 30; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(1000)

    const currentText = await page.evaluate(() => document.body.innerText)
    if (currentText === lastText) break
    lastText = currentText
  }

  // Extract full page text and parse
  const fullText = await page.evaluate(() => document.body.innerText)
  return parseStandingsFromText(fullText)
}

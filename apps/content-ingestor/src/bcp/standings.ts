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
export async function scrapeStandings(eventUrl: string, page: Page): Promise<BCPStanding[]> {
  const standingsUrl = eventUrl.includes('?')
    ? `${eventUrl}&active_tab=standings`
    : `${eventUrl}?active_tab=standings`

  await page.goto(standingsUrl, { waitUntil: 'networkidle', timeout: 30_000 })
  await page.waitForTimeout(2000)

  // Scroll until content stabilises (handles infinite scroll)
  let lastCount = 0
  for (let i = 0; i < 20; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(1500)

    const count = await page.evaluate(() => {
      // Try table rows first
      const tableRows = document.querySelectorAll('table tbody tr')
      if (tableRows.length > 0) return tableRows.length
      // Fall back to card-based entries
      return document.querySelectorAll(
        '[class*="standing"], [class*="player-row"], [class*="leaderboard"]',
      ).length
    })

    if (count > 0 && count === lastCount) break
    lastCount = count
  }

  // Check for a "load more" button after scrolling
  const loadMore = await page.$('button:has-text("Load More"), button:has-text("load more")')
  if (loadMore) {
    await loadMore.click()
    await page.waitForTimeout(2000)
  }

  // Extract raw row data using multiple fallback strategies
  const rawRows = await page.evaluate((): RawStandingRow[] => {
    // Strategy 1: table-based layout
    const tableRows = document.querySelectorAll('table tbody tr')
    if (tableRows.length > 0) {
      return Array.from(tableRows).map((row) => {
        const cells = Array.from(row.querySelectorAll('td')).map(
          (td) => td.textContent?.trim() ?? '',
        )
        // BCP column order tends to be: rank, name, faction, record, points
        // But exact column count varies — be flexible
        const record = cells.find((c) => /^\d+-\d+-\d+$/.test(c)) ?? ''
        const rankCol = cells.find((c) => /^\d+$/.test(c) && parseInt(c) < 1000) ?? ''
        // findLast is ES2023 — use slice().reverse().find() for broader target compat
        const pointsCol =
          [...cells].reverse().find((c: string) => /^\d+(\.\d+)?$/.test(c)) ?? ''

        // Player name is the longest non-numeric cell, faction is the second longest
        const textCols = cells.filter((c) => c && !/^\d/.test(c) && !c.match(/^\d+-\d+-\d+$/))
        const sorted = [...textCols].sort((a, b) => b.length - a.length)

        // Link to army list
        const link = row.querySelector(
          'a[href*="player"], a[href*="list"]',
        ) as HTMLAnchorElement | null

        return {
          rank: rankCol,
          name: sorted[0] ?? '',
          faction: sorted[1] ?? '',
          record,
          points: pointsCol,
          armyListUrl: link?.href,
        }
      })
    }

    // Strategy 2: card-style entries
    const cards = document.querySelectorAll(
      '[class*="standing-row"], [class*="player-card"], [class*="leaderboard-row"]',
    )
    if (cards.length > 0) {
      return Array.from(cards).map((card) => {
        const text = card.textContent ?? ''
        const rankMatch = text.match(/^#?(\d+)/)
        const recordMatch = text.match(/(\d+)-(\d+)-(\d+)/)
        const link = card.querySelector(
          'a[href*="player"], a[href*="list"]',
        ) as HTMLAnchorElement | null

        // Extract name: typically the first heading or bold element
        const nameEl = card.querySelector('h3, h4, h5, strong, [class*="name"]')
        const name = nameEl?.textContent?.trim() ?? ''

        return {
          rank: rankMatch?.[1] ?? '',
          name,
          faction: '',
          record: recordMatch ? `${recordMatch[1]}-${recordMatch[2]}-${recordMatch[3]}` : '',
          points: '',
          armyListUrl: link?.href,
        }
      })
    }

    // Strategy 3: raw text extraction from player links
    const playerLinks = document.querySelectorAll('a[href*="player"]')
    return Array.from(playerLinks).map((link, idx) => ({
      rank: String(idx + 1),
      name: link.textContent?.trim() ?? '',
      faction: '',
      record: '',
      points: '',
      armyListUrl: (link as HTMLAnchorElement).href,
    }))
  })

  return parseStandingsFromRows(rawRows)
}

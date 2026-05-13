import type { Browser, Page } from 'playwright'

export interface BCPEvent {
  id: string
  url: string
  name: string
  date: string
  playerCount: number
  rounds: number
  location: string
}

// The search URL with filters for 40K majors (100+ players, 5+ rounds, 2 years)
export const BCP_SEARCH_URL =
  'https://www.bestcoastpairings.com/play/events?search=true&startDate=2024-04-27&endDate=2026-04-27&gameSystemId=WGMSzfKFYA&numberOfRounds=5&numberOfPlayers=100&sortAsc=false&eventStatus=all&sortKey=eventDate'

/** BCP search filter config */
export interface BCPSearchConfig {
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
  gameSystemId?: string // default: WGMSzfKFYA (40K)
  numberOfRounds?: number // minimum rounds
  numberOfPlayers?: number // minimum players
}

const BCP_BASE_URL = 'https://www.bestcoastpairings.com/play/events'

/** Build a BCP search URL from config */
export function buildSearchUrl(config: BCPSearchConfig): string {
  const params = new URLSearchParams({
    search: 'true',
    startDate: config.startDate,
    endDate: config.endDate,
    gameSystemId: config.gameSystemId ?? 'WGMSzfKFYA',
    sortAsc: 'false',
    eventStatus: 'all',
    sortKey: 'eventDate',
  })
  if (config.numberOfRounds) params.set('numberOfRounds', String(config.numberOfRounds))
  if (config.numberOfPlayers) params.set('numberOfPlayers', String(config.numberOfPlayers))
  return `${BCP_BASE_URL}?${params.toString()}`
}

/** Generate monthly date windows between start and end */
export function generateMonthlyWindows(
  startDate: string,
  endDate: string,
): Array<{ start: string; end: string }> {
  const windows: Array<{ start: string; end: string }> = []
  const end = new Date(endDate + 'T00:00:00Z')
  let cursor = new Date(startDate + 'T00:00:00Z')

  while (cursor < end) {
    const windowEnd = new Date(cursor)
    windowEnd.setUTCMonth(windowEnd.getUTCMonth() + 1)
    if (windowEnd > end) windowEnd.setTime(end.getTime())

    windows.push({
      start: cursor.toISOString().split('T')[0]!,
      end: windowEnd.toISOString().split('T')[0]!,
    })

    cursor = windowEnd
  }

  return windows
}

/**
 * Scan BCP events using monthly date windows to bypass result caps.
 * Scans each window independently and dedupes by event ID.
 */
export async function scrapeEventListWindowed(
  config: BCPSearchConfig,
  page: Page,
): Promise<BCPEvent[]> {
  const windows = generateMonthlyWindows(config.startDate, config.endDate)
  const allEvents = new Map<string, BCPEvent>()

  console.log(`Scanning ${windows.length} monthly windows from ${config.startDate} to ${config.endDate}`)
  if (config.numberOfPlayers) console.log(`  Filter: ${config.numberOfPlayers}+ players, ${config.numberOfRounds ?? 'any'}+ rounds`)

  for (let i = 0; i < windows.length; i++) {
    const window = windows[i]!
    const url = buildSearchUrl({
      ...config,
      startDate: window.start,
      endDate: window.end,
    })

    console.log(`\n[${i + 1}/${windows.length}] ${window.start} → ${window.end}`)

    const events = await scrapeEventList(url, page)
    let newCount = 0
    for (const event of events) {
      if (!allEvents.has(event.id)) newCount++
      allEvents.set(event.id, event)
    }

    console.log(`  Found ${events.length} events (${newCount} new, ${allEvents.size} total)`)
  }

  return Array.from(allEvents.values())
}

export async function scrapeEventList(
  searchUrl: string,
  browserOrPage: Browser | Page,
): Promise<BCPEvent[]> {
  const ownPage = 'newPage' in browserOrPage
  const page = ownPage ? await (browserOrPage as Browser).newPage() : (browserOrPage as Page)
  const allEvents: BCPEvent[] = []

  try {
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(2000) // Let dynamic content load

    let hasMore = true
    let prevCount = 0
    while (hasMore) {
      // Extract events from current page — read individual <p> elements, not concatenated text
      const events = await page.evaluate(() => {
        const cards = document.querySelectorAll('a[href*="/event/"]')
        const results: Array<{
          url: string
          name: string
          date: string
          playerCount: number
          rounds: number
          location: string
        }> = []

        cards.forEach(card => {
          const url = (card as HTMLAnchorElement).href
          const heading = card.querySelector('h3, h6')
          const name = heading?.textContent?.trim() || ''
          if (!name || !url.includes('/event/') || url.includes('register') || url.includes('Learn More')) return

          // Extract from individual <p> elements to avoid text concatenation issues
          const paragraphs = Array.from(card.querySelectorAll('p')).map(p => p.textContent?.trim() || '')

          let date = ''
          let playerCount = 0
          let rounds = 0
          let location = ''

          for (const p of paragraphs) {
            // Date: "May 4" or "Jun 17" etc
            if (/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d+/.test(p)) {
              date = p
            }
            // Rounds: "6 Rounds" or "8 Rounds"
            if (/^\d+\s+Rounds?$/i.test(p)) {
              rounds = parseInt(p)
            }
            // Players: "131 / 200" or "245 / 360" or just "131"
            if (/^\d+\s*\/\s*\d+$/.test(p)) {
              playerCount = parseInt(p)
            }
            // Location: contains comma (city, state) or "United States" etc
            if (p.includes(',') && !p.includes('AM') && !p.includes('PM') && p.length > 5) {
              location = p
            }
          }

          results.push({ url, name, date, playerCount, rounds, location })
        })

        // Dedupe by URL
        const seen = new Set<string>()
        return results.filter(e => {
          if (seen.has(e.url)) return false
          seen.add(e.url)
          return true
        })
      })

      for (const raw of events) {
        const idMatch = raw.url.match(/\/event\/([^/?]+)/)
        if (!idMatch) continue

        allEvents.push({
          id: idMatch[1]!,
          url: raw.url.split('?')[0]!,
          name: raw.name,
          date: raw.date,
          playerCount: raw.playerCount,
          rounds: raw.rounds,
          location: raw.location,
        })
      }

      // Stop if no new events were found this round
      if (allEvents.length === prevCount) {
        hasMore = false
        break
      }
      prevCount = allEvents.length

      // Check for "Load More" button
      const loadMoreButton = await page.$('button:has-text("Load More"):not([disabled])')
      if (loadMoreButton) {
        console.log(`  ... ${allEvents.length} events so far, loading more...`)
        await loadMoreButton.click()
        await page.waitForTimeout(3000)
      } else {
        hasMore = false
      }
    }
  } finally {
    if (ownPage) await page.close()
  }

  return allEvents
}

/**
 * Save event list to JSON file
 */
export async function saveEventList(events: BCPEvent[], outputPath: string): Promise<void> {
  const { writeFileSync, mkdirSync } = await import('node:fs')
  const { dirname } = await import('node:path')
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, JSON.stringify(events, null, 2))
}

/**
 * Load event list from JSON file
 */
export async function loadEventList(inputPath: string): Promise<BCPEvent[]> {
  const { readFileSync } = await import('node:fs')
  return JSON.parse(readFileSync(inputPath, 'utf-8')) as BCPEvent[]
}

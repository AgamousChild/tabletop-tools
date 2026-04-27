import type { Browser } from 'playwright'

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
  'https://www.bestcoastpairings.com/play/events?search=true&startDate=2024-04-27&endDate=2026-04-27&gameSystemId=WGMSzfKFYA&numberOfRounds=5&numberOfPlayers=100&sortAsc=true&eventStatus=all&sortKey=eventDate'

export async function scrapeEventList(
  searchUrl: string,
  browser: Browser,
): Promise<BCPEvent[]> {
  const page = await browser.newPage()
  const allEvents: BCPEvent[] = []

  try {
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(2000) // Let dynamic content load

    let hasMore = true
    while (hasMore) {
      // Extract events from current page
      const events = await page.evaluate(() => {
        const cards = document.querySelectorAll('a[href*="/event/"]')
        const results: Array<{
          url: string
          name: string
          text: string
        }> = []

        cards.forEach(card => {
          const url = (card as HTMLAnchorElement).href
          const heading = card.querySelector('h3, h6')
          const name = heading?.textContent?.trim() || ''
          if (name && url.includes('/event/') && !url.includes('register')) {
            results.push({
              url,
              name,
              text: card.textContent || '',
            })
          }
        })

        // Dedupe
        const seen = new Set<string>()
        return results.filter(e => {
          if (seen.has(e.url)) return false
          seen.add(e.url)
          return true
        })
      })

      for (const raw of events) {
        // Extract event ID from URL: /event/{id} or /event/{id}?...
        const idMatch = raw.url.match(/\/event\/([^/?]+)/)
        if (!idMatch) continue

        // Parse metadata from card text
        const roundsMatch = raw.text.match(/(\d+)\s*Rounds/)
        const playerMatch = raw.text.match(/(\d+)\s*\/\s*(\d+)/) ?? raw.text.match(/—\s*(\d+)/)
        const dateMatch = raw.text.match(
          /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d+/,
        )

        allEvents.push({
          id: idMatch[1]!,
          url: raw.url.split('?')[0]!, // clean URL
          name: raw.name,
          date: dateMatch ? dateMatch[0] : '',
          playerCount: playerMatch ? parseInt(playerMatch[1]!) : 0,
          rounds: roundsMatch ? parseInt(roundsMatch[1]!) : 0,
          location: '', // hard to parse reliably from card text
        })
      }

      // Check for next page button
      const nextButton = await page.$('button:has-text("next page"):not([disabled])')
      if (nextButton) {
        await nextButton.click()
        await page.waitForTimeout(2000)
      } else {
        hasMore = false
      }
    }
  } finally {
    await page.close()
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

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
  'https://www.bestcoastpairings.com/play/events?search=true&startDate=2024-04-27&endDate=2026-04-27&gameSystemId=WGMSzfKFYA&numberOfRounds=5&numberOfPlayers=100&sortAsc=false&eventStatus=all&sortKey=eventDate'

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

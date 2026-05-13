import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'

const BROWSER_STATE = '.local/ingest/bcp/browser-state'
const EVENTS_FILE = '.local/ingest/bcp/events.json'

async function main() {
  const events = JSON.parse(readFileSync(EVENTS_FILE, 'utf8'))
  console.log(`Scraping dates for ${events.length} events...\n`)

  const context = await chromium.launchPersistentContext(BROWSER_STATE, { headless: false })
  const page = await context.newPage()

  let found = 0
  let failed = 0

  for (let i = 0; i < events.length; i++) {
    const e = events[i]!
    if (e.date) {
      console.log(`  [${i + 1}/${events.length}] ${e.name.substring(0, 40)} → ${e.date} (cached)`)
      found++
      continue
    }

    try {
      // Navigate to Overview tab directly
      await page.goto(
        `https://www.bestcoastpairings.com/event/${e.id}?active_tab=overview`,
        { waitUntil: 'domcontentloaded', timeout: 30000 },
      )
      await page.waitForTimeout(3000)

      // Extract date and location from the Overview tab
      const info = await page.evaluate(() => {
        const headings = Array.from(document.querySelectorAll('h6'))

        // Date: h5 after "Event Starts" h6
        let date = ''
        const startLabel = headings.find(h => h.textContent?.trim() === 'Event Starts')
        if (startLabel) {
          const container = startLabel.parentElement
          if (container) {
            const h5s = Array.from(container.querySelectorAll('h5'))
            date = h5s[0]?.textContent?.trim() || ''
          }
        }

        // Location: paragraphs inside the link after "Location" h6
        let location = ''
        const locLabel = headings.find(h => h.textContent?.trim() === 'Location')
        if (locLabel) {
          const container = locLabel.parentElement
          if (container) {
            // Location link has paragraphs with city/state and country
            const link = container.querySelector('a[href*="google.com/maps"]')
            if (link) {
              const ps = Array.from(link.querySelectorAll('p')).map(p => p.textContent?.trim()).filter(Boolean)
              location = ps.join(', ')
            }
            if (!location) {
              // Fallback: grab h5s after the location label (org name, then address)
              const h5s = Array.from(container.querySelectorAll('h5'))
              // Skip first h5 (org name with link), look for address-like text
              for (const h5 of h5s) {
                const text = h5.textContent?.trim() || ''
                if (text.includes(',') || /\d{4,5}/.test(text)) {
                  location = text
                  break
                }
              }
            }
          }
        }

        return { date, location }
      })

      if (info.date) {
        events[i].date = info.date
        if (info.location) events[i].location = info.location
        found++
        console.log(`  [${i + 1}/${events.length}] ${e.name.substring(0, 40)} → ${info.date} | ${info.location || 'no location'}`)
      } else {
        failed++
        console.log(`  [${i + 1}/${events.length}] ${e.name.substring(0, 40)} → NO DATE`)
      }

      // Rate limit
      await page.waitForTimeout(500)
    } catch (err) {
      failed++
      console.log(`  [${i + 1}/${events.length}] ${e.name.substring(0, 40)} → ERROR: ${(err as Error).message?.substring(0, 40)}`)
    }

    // Save progress every 10 events
    if ((i + 1) % 10 === 0) {
      writeFileSync(EVENTS_FILE, JSON.stringify(events, null, 2))
      console.log(`  [saved progress]`)
    }
  }

  await page.close()
  await context.close()

  writeFileSync(EVENTS_FILE, JSON.stringify(events, null, 2))

  // Also update pairings files with the dates
  const { readdirSync } = await import('node:fs')
  const path = await import('node:path')
  const BCP_DIR = '.local/ingest/bcp'
  const eventMap = new Map(events.map((e: { id: string; date: string }) => [e.id, e.date]))

  const pairingFiles = readdirSync(BCP_DIR).filter(f => f.startsWith('pairings-') && f.endsWith('.json'))
  let updated = 0
  for (const file of pairingFiles) {
    const filePath = path.join(BCP_DIR, file)
    const data = JSON.parse(readFileSync(filePath, 'utf-8'))
    const eventId = data.event?.id
    if (eventId && eventMap.has(eventId) && eventMap.get(eventId)) {
      data.event.date = eventMap.get(eventId)
      writeFileSync(filePath, JSON.stringify(data, null, 2))
      updated++
    }
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log(`Done. ${found} dates found, ${failed} failed.`)
  console.log(`${updated} pairings files updated with dates.`)
}

main().catch(console.error)

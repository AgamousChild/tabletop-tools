/**
 * Scan BCP for ALL major 40K events using date-windowed pagination.
 * Breaks the date range into monthly windows to bypass BCP's result cap.
 *
 * Run: npx tsx src/bcp/scan-all-events.ts
 */

import { chromium } from 'playwright'
import {
  scrapeEventListWindowed,
  saveEventList,
  loadEventList,
  type BCPSearchConfig,
} from './event-list'
import path from 'node:path'
import { existsSync } from 'node:fs'

const BCP_DIR = '.local/ingest/bcp'
const BROWSER_STATE = path.join(BCP_DIR, 'browser-state')
const EVENTS_FILE = path.join(BCP_DIR, 'events.json')

// 10th edition launched June 2024 — scan from there to today
const SEARCH_CONFIG: BCPSearchConfig = {
  startDate: '2024-06-01',
  endDate: new Date().toISOString().split('T')[0]!,
  numberOfRounds: 5,
  numberOfPlayers: 100,
}

async function main() {
  // Load existing events to merge
  let existing: Awaited<ReturnType<typeof loadEventList>> = []
  if (existsSync(EVENTS_FILE)) {
    existing = await loadEventList(EVENTS_FILE)
    console.log(`${existing.length} existing events loaded`)
  }
  const existingById = new Map(existing.map(e => [e.id, e]))

  const context = await chromium.launchPersistentContext(BROWSER_STATE, { headless: false })
  const page = await context.newPage()

  try {
    console.log('Scanning BCP for all major events (100+ players, 5+ rounds)...\n')
    const scanned = await scrapeEventListWindowed(SEARCH_CONFIG, page)
    console.log(`\nScanned ${scanned.length} events total across all windows`)

    // Merge: keep existing data (dates, locations) for events we already have
    const merged = []
    const seenIds = new Set<string>()

    for (const event of scanned) {
      if (seenIds.has(event.id)) continue
      seenIds.add(event.id)

      const prev = existingById.get(event.id)
      if (prev) {
        // Keep existing date/location if we already scraped them
        merged.push({
          ...event,
          date: prev.date || event.date,
          location: prev.location || event.location,
        })
      } else {
        merged.push(event)
      }
    }

    // Also keep existing events not in this scan
    for (const prev of existing) {
      if (!seenIds.has(prev.id)) {
        merged.push(prev)
        seenIds.add(prev.id)
      }
    }

    // Sort newest first
    merged.sort((a, b) => {
      if (a.date && b.date) return b.date.localeCompare(a.date)
      return a.date ? -1 : 1
    })

    await saveEventList(merged, EVENTS_FILE)
    console.log(`\nSaved ${merged.length} events to ${EVENTS_FILE}`)
    console.log(`  ${scanned.length} from scan, ${merged.length - scanned.length} retained from previous`)

    const withDates = merged.filter(e => e.date && e.date.includes(',')).length
    const withoutDates = merged.length - withDates
    console.log(`  ${withDates} with dates, ${withoutDates} need date scraping`)
  } finally {
    await page.close()
    await context.close()
  }
}

main().catch(console.error)

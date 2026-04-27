import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'

const BROWSER_STATE = '.local/ingest/bcp/browser-state'
const EVENTS_FILE = '.local/ingest/bcp/events.json'

async function main() {
  const events = JSON.parse(readFileSync(EVENTS_FILE, 'utf8'))
  console.log(`Scraping dates for ${events.length} events...\n`)

  const context = await chromium.launchPersistentContext(BROWSER_STATE, { headless: false })
  const page = await context.newPage()

  for (let i = 0; i < events.length; i++) {
    const e = events[i]!
    try {
      await page.goto(`https://www.bestcoastpairings.com/event/${e.id}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await page.waitForTimeout(4000)

      const date = await page.evaluate(() => {
        // Try multiple strategies to find the date
        const allText = document.body.innerText
        // Look for date patterns in full page text
        const dateMatch = allText.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:\s*[-–]\s*(?:\w+\s+)?\d{1,2})?,?\s*20\d{2}\b/)
        if (dateMatch) return dateMatch[0]

        // Try individual paragraphs
        const ps = Array.from(document.querySelectorAll('p')).map(p => p.textContent?.trim() || '')
        const dateP = ps.find(p => /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/.test(p) && /\b20\d{2}\b/.test(p))
        if (dateP) return dateP

        // Try spans
        const spans = Array.from(document.querySelectorAll('span, div')).map(s => s.textContent?.trim() || '')
        const dateS = spans.find(s => s.length < 40 && /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/.test(s) && /\b20\d{2}\b/.test(s))
        return dateS || ''
      })

      events[i].date = date
      console.log(`  [${i + 1}/${events.length}] ${e.name.substring(0, 40)} → ${date || 'NO DATE'}`)
    } catch (err) {
      console.log(`  [${i + 1}/${events.length}] ${e.name.substring(0, 40)} → ERROR`)
    }
  }

  await page.close()
  await context.close()

  writeFileSync(EVENTS_FILE, JSON.stringify(events, null, 2))
  console.log('\nDates saved to events.json')
}

main().catch(console.error)

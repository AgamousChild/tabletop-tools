/**
 * Standalone BCP pairings scraper.
 *
 * Uses Playwright with a persistent browser context to reuse BCP login cookies.
 * Run with: npx tsx src/bcp/scrape-pairings-standalone.ts
 *
 * First run: opens visible browser so you can log into BCP.
 * Subsequent runs: reuses saved cookies from .local/ingest/bcp/browser-state/
 */

import { chromium } from 'playwright'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'

const BCP_DIR = '.local/ingest/bcp'
const BROWSER_STATE_DIR = path.join(BCP_DIR, 'browser-state')
const EVENTS_FILE = path.join(BCP_DIR, 'events.json')

interface BCPEvent {
  id: string
  url: string
  name: string
  date: string
  playerCount: number
  rounds: number
  location: string
}

interface PairingPlayer {
  name: string
  faction: string
  result: 'win' | 'loss' | 'draw'
  score: number
  listUrl: string | null
}

interface Pairing {
  round: number
  table: number
  p1: PairingPlayer
  p2: PairingPlayer
}

interface PlayerRecord {
  wins: number
  losses: number
  draws: number
  faction: string
  listUrl: string | null
}

function parsePairingsFromPage(pageContent: string): Array<{ ps: string[]; listUrls: string[] }> {
  // This is a placeholder — the actual parsing happens in page.evaluate()
  return []
}

async function scrapeEvent(
  eventId: string,
  context: Awaited<ReturnType<typeof chromium.launchPersistentContext>>,
): Promise<{ pairings: Pairing[]; records: Record<string, PlayerRecord>; rounds: number }> {
  const page = await context.newPage()
  const allPairings: Pairing[] = []

  try {
    // Load round 1
    await page.goto(
      `https://www.bestcoastpairings.com/event/${eventId}?active_tab=pairings&round=1`,
      { waitUntil: 'domcontentloaded', timeout: 60000 },
    )
    await page.waitForTimeout(3000)

    // Detect max rounds by probing with next button
    let maxRound = 1
    const firstRound = await page.evaluate(() => {
      const m = document.body.innerText.match(/Round\s+(\d+)/)
      return m ? parseInt(m[1]!) : 0
    })
    if (firstRound === 0) {
      await page.close()
      return { pairings: [], records: {}, rounds: 0 }
    }
    maxRound = firstRound

    // Click next to find the last round
    for (let i = 0; i < 15; i++) {
      try {
        const nextBtn = page.getByRole('button', { name: 'next', exact: true })
        if (await nextBtn.isDisabled().catch(() => true)) break
        await nextBtn.click()
        await page.waitForTimeout(800)
        const r = await page.evaluate(() => {
          const m = document.body.innerText.match(/Round\s+(\d+)/)
          return m ? parseInt(m[1]!) : 0
        })
        if (r > maxRound) maxRound = r
      } catch {
        break
      }
    }

    // Scrape each round via direct URL navigation
    for (let round = 1; round <= maxRound; round++) {
      await page.goto(
        `https://www.bestcoastpairings.com/event/${eventId}?active_tab=pairings&round=${round}`,
        { waitUntil: 'domcontentloaded', timeout: 60000 },
      )
      await page.waitForTimeout(2000)

      // Scroll to load all pairings on this page
      let lastText = ''
      let stable = 0
      for (let s = 0; s < 10; s++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
        await page.waitForTimeout(500)
        const t = await page.evaluate(() => document.body.innerText.length.toString())
        if (t === lastText) { stable++; if (stable >= 2) break } else stable = 0
        lastText = t
      }

      // Check for pagination within the round
      let hasMorePages = true
      while (hasMorePages) {
        const pairings = await page.evaluate((r: number) => {
          const links = document.querySelectorAll('a[href*="/game/pairing/"]')
          const res: Array<{
            round: number
            table: number
            p1: { name: string; faction: string; result: string; score: number; listUrl: string | null }
            p2: { name: string; faction: string; result: string; score: number; listUrl: string | null }
          }> = []

          links.forEach(link => {
            const ps = Array.from(link.querySelectorAll('p')).map(p => p.textContent?.trim() || '')
            const lLinks = Array.from(link.querySelectorAll('a[href*="/list/"]')).map(a => (a as HTMLAnchorElement).href)
            const filtered = ps.filter(p => p && p !== 'View List' && p !== 'No List')

            if (filtered.length >= 4) {
              const table = parseInt(filtered[0]!) || 0
              const r1 = filtered[3]?.match(/(Win|Loss|Draw):\s*(\d+)/i)
              const r2 = filtered.length >= 7 ? filtered[6]?.match(/(Win|Loss|Draw):\s*(\d+)/i) : null

              if (r1) {
                res.push({
                  round: r,
                  table,
                  p1: {
                    name: filtered[1]!,
                    faction: filtered[2]!,
                    result: r1[1]!.toLowerCase(),
                    score: parseInt(r1[2]!),
                    listUrl: lLinks[0] || null,
                  },
                  p2: {
                    name: filtered[4] || 'BYE',
                    faction: filtered[5] || '',
                    result: r2 ? r2[1]!.toLowerCase() : 'loss',
                    score: r2 ? parseInt(r2[2]!) : 0,
                    listUrl: lLinks[1] || null,
                  },
                })
              }
            }
          })

          return res
        }, round)

        allPairings.push(...(pairings as Pairing[]))

        // Check for next page within this round
        const nextPageBtn = await page.$('button[aria-label="next page"]:not([disabled])')
        if (nextPageBtn) {
          await nextPageBtn.click()
          await page.waitForTimeout(1500)
        } else {
          hasMorePages = false
        }
      }
    }

    // Calculate records
    const records: Record<string, PlayerRecord> = {}
    for (const p of allPairings) {
      for (const pl of [p.p1, p.p2]) {
        if (!pl.name || pl.name === 'BYE' || pl.name.includes('---')) continue
        if (!records[pl.name]) {
          records[pl.name] = { wins: 0, losses: 0, draws: 0, faction: pl.faction, listUrl: pl.listUrl }
        }
        if (pl.result === 'win') records[pl.name]!.wins++
        else if (pl.result === 'loss') records[pl.name]!.losses++
        else records[pl.name]!.draws++
        records[pl.name]!.faction = pl.faction
        if (pl.listUrl) records[pl.name]!.listUrl = pl.listUrl
      }
    }

    return { pairings: allPairings, records, rounds: maxRound }
  } finally {
    await page.close()
  }
}

async function main() {
  mkdirSync(BCP_DIR, { recursive: true })
  mkdirSync(BROWSER_STATE_DIR, { recursive: true })

  if (!existsSync(EVENTS_FILE)) {
    console.error(`No events.json found. Run 'npx tsx src/cli.ts bcp-scan' first.`)
    process.exit(1)
  }

  const events: BCPEvent[] = JSON.parse(readFileSync(EVENTS_FILE, 'utf-8'))
  console.log(`Found ${events.length} events to scrape\n`)

  // Launch persistent context — reuses cookies from previous sessions
  const context = await chromium.launchPersistentContext(BROWSER_STATE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 800 },
  })

  // Check if logged in by looking for user-specific content
  const checkPage = await context.newPage()
  await checkPage.goto('https://www.bestcoastpairings.com/', { waitUntil: 'domcontentloaded' })
  await checkPage.waitForTimeout(3000)
  const userName = await checkPage.evaluate(() => {
    // Look for a user button/avatar that indicates logged in
    const btn = document.querySelector('button[class*="user"], button img[alt]')
    return btn ? (btn as HTMLElement).getAttribute('alt') || 'logged in' : null
  })
  await checkPage.close()

  if (!userName) {
    console.log('⚠ Not logged into BCP. Opening login page — please log in manually.')
    console.log('  After logging in, re-run this script. Your session will be saved.')
    const loginPage = await context.newPage()
    await loginPage.goto('https://www.bestcoastpairings.com/login', { waitUntil: 'domcontentloaded' })
    // Keep browser open for 60 seconds for login
    await new Promise(r => setTimeout(r, 60000))
    await context.close()
    console.log('Session saved. Run again to start scraping.')
    process.exit(0)
  }

  console.log(`Logged in as: ${userName}\nStarting scrape...\n`)

  let totalPairings = 0
  let totalPlayers = 0
  let successCount = 0
  let failCount = 0

  for (let i = 0; i < events.length; i++) {
    const event = events[i]!

    // Skip events we already have pairings for
    const pairingsPath = path.join(BCP_DIR, `pairings-${event.id}.json`)
    if (existsSync(pairingsPath)) {
      console.log(`  [${i + 1}/${events.length}] ${event.name.substring(0, 50)}... (cached)`)
      continue
    }

    process.stdout.write(`  [${i + 1}/${events.length}] ${event.name.substring(0, 50)}...`)

    try {
      const result = await scrapeEvent(event.id, context)

      if (result.pairings.length === 0) {
        console.log(' ✗ no pairings found')
        failCount++
        continue
      }

      // Save pairings data
      const outPath = path.join(BCP_DIR, `pairings-${event.id}.json`)
      writeFileSync(outPath, JSON.stringify({
        event,
        pairings: result.pairings,
        records: result.records,
        rounds: result.rounds,
      }, null, 2))

      // Also update the existing event JSON with W/L/D data
      const existingPath = path.join(BCP_DIR, `${event.id}.json`)
      if (existsSync(existingPath)) {
        const existing = JSON.parse(readFileSync(existingPath, 'utf-8'))
        // Update players with W/L/D from pairings
        for (const player of existing.players) {
          const record = result.records[player.name]
          if (record) {
            player.wins = record.wins
            player.losses = record.losses
            player.draws = record.draws
            player.faction = record.faction
          }
        }
        writeFileSync(existingPath, JSON.stringify(existing, null, 2))
      }

      totalPairings += result.pairings.length
      totalPlayers += Object.keys(result.records).length
      successCount++
      console.log(` ✓ ${result.pairings.length} pairings, ${Object.keys(result.records).length} players, ${result.rounds} rounds`)

      // Rate limiting
      await new Promise(r => setTimeout(r, 1000))
    } catch (err) {
      console.log(` ✗ ${err instanceof Error ? err.message.substring(0, 60) : err}`)
      failCount++
    }
  }

  await context.close()

  console.log(`\n${'='.repeat(60)}`)
  console.log(`Done. ${successCount} events scraped, ${failCount} failed.`)
  console.log(`Total: ${totalPairings} pairings, ${totalPlayers} player records.`)
  console.log(`Data saved to ${BCP_DIR}/pairings-*.json`)
}

main().catch(console.error)

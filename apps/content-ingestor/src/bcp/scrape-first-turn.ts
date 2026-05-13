/**
 * Scrape "First Turn" data from BCP game detail pages.
 * Second pass after pairings scrape — visits each game URL and extracts
 * which player went first.
 *
 * Run: npx tsx src/bcp/scrape-first-turn.ts
 */

import { chromium } from 'playwright'
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'

const BCP_DIR = '.local/ingest/bcp'
const BROWSER_STATE = path.join(BCP_DIR, 'browser-state')
const PROGRESS_FILE = path.join(BCP_DIR, 'first-turn-progress.json')

interface FirstTurnResult {
  gameUrl: string
  eventId: string
  round: number
  player1Name: string
  player2Name: string
  firstTurn: 'p1' | 'p2' | 'unknown'
}

async function main() {
  // Collect all game pairing URLs from all events
  const pairingFiles = readdirSync(BCP_DIR).filter(f => f.startsWith('pairings-') && f.endsWith('.json'))
  console.log(`Found ${pairingFiles.length} events with pairings data\n`)

  // First, we need to get the game URLs. Our pairings don't store them,
  // so we'll scrape them from the pairings pages and then visit each game.
  // But we can construct them — BCP game URLs are at /game/pairing/{id}
  // and the IDs are in the href attributes on the pairings page.

  // Load existing progress
  let progress: Record<string, FirstTurnResult> = {}
  if (existsSync(PROGRESS_FILE)) {
    progress = JSON.parse(readFileSync(PROGRESS_FILE, 'utf-8'))
    console.log(`Resuming: ${Object.keys(progress).length} games already scraped\n`)
  }

  const context = await chromium.launchPersistentContext(BROWSER_STATE, { headless: false })
  const page = await context.newPage()

  let totalScraped = Object.keys(progress).length
  let newScraped = 0
  let failed = 0

  for (const file of pairingFiles) {
    const data = JSON.parse(readFileSync(path.join(BCP_DIR, file), 'utf-8'))
    const eventId = data.event.id
    const eventName = data.event.name
    const maxRounds = data.rounds || 9

    console.log(`\n${eventName} (${maxRounds} rounds)`)

    // Visit each round's pairings page and collect game URLs
    for (let round = 1; round <= maxRounds; round++) {
      try {
        await page.goto(
          `https://www.bestcoastpairings.com/event/${eventId}?active_tab=pairings&round=${round}`,
          { waitUntil: 'domcontentloaded', timeout: 30000 },
        )
        await page.waitForTimeout(2000)

        // Scroll to load all pairings
        for (let s = 0; s < 5; s++) {
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
          await page.waitForTimeout(500)
        }

        // Collect game URLs with player names
        const games = await page.evaluate(() => {
          const links = document.querySelectorAll('a[href*="/game/pairing/"]')
          const results: Array<{ url: string; p1: string; p2: string }> = []

          links.forEach(link => {
            const url = (link as HTMLAnchorElement).href
            const ps = Array.from(link.querySelectorAll('p'))
              .map(p => p.textContent?.trim() || '')
              .filter(p => p && p !== 'View List' && p !== 'No List')

            if (ps.length >= 4) {
              results.push({
                url,
                p1: ps[1] || '',
                p2: ps[4] || '',
              })
            }
          })

          return results
        })

        // Visit each game page to get First Turn data
        for (const game of games) {
          // Skip if already scraped
          const gameId = game.url.split('/').pop()!
          if (progress[gameId]) continue

          // Skip byes
          if (!game.p2 || game.p2 === '--------') continue

          try {
            await page.goto(game.url, { waitUntil: 'domcontentloaded', timeout: 15000 })
            // Wait for the scoring sheet to render — checkboxes appear after React hydration
            try {
              await page.waitForSelector('text=First Turn', { timeout: 5000 })
            } catch { /* page may not have First Turn data */ }
            await page.waitForTimeout(500)

            // Use Playwright locators for checkbox state
            const checkboxes = page.getByRole('checkbox', { name: 'First Turn' })
            const count = await checkboxes.count()
            let firstTurn: 'p1' | 'p2' | 'unknown' = 'unknown'

            if (count >= 2) {
              const p1Checked = await checkboxes.nth(0).isChecked()
              const p2Checked = await checkboxes.nth(1).isChecked()
              if (p1Checked && !p2Checked) firstTurn = 'p1'
              else if (p2Checked && !p1Checked) firstTurn = 'p2'
            }

            const result: FirstTurnResult = {
              gameUrl: game.url,
              eventId,
              round,
              player1Name: game.p1,
              player2Name: game.p2,
              firstTurn: firstTurn as 'p1' | 'p2' | 'unknown',
            }

            progress[gameId] = result
            newScraped++
            totalScraped++

            if (firstTurn !== 'unknown') {
              process.stdout.write('.')
            } else {
              process.stdout.write('?')
            }

            // Rate limit
            await page.waitForTimeout(300)
          } catch {
            failed++
            process.stdout.write('x')
          }

          // Save progress every 100 games
          if (newScraped % 100 === 0 && newScraped > 0) {
            writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2))
            const known = Object.values(progress).filter(r => r.firstTurn !== 'unknown').length
            console.log(`\n  [saved: ${totalScraped} total, ${known} with first turn data]`)
          }
        }

        // Check for pagination within the round
        let hasMore = true
        while (hasMore) {
          const nextPageBtn = await page.$('button[aria-label="next page"]:not([disabled])')
          if (nextPageBtn) {
            await nextPageBtn.click()
            await page.waitForTimeout(1500)

            const moreGames = await page.evaluate(() => {
              const links = document.querySelectorAll('a[href*="/game/pairing/"]')
              return Array.from(links).map(l => ({
                url: (l as HTMLAnchorElement).href,
                p1: '', p2: '', // we'll get names from the game page
              }))
            })

            for (const game of moreGames) {
              const gameId = game.url.split('/').pop()!
              if (progress[gameId]) continue

              try {
                await page.goto(game.url, { waitUntil: 'domcontentloaded', timeout: 15000 })
                await page.waitForTimeout(1000)

                // Get player names from page
                const names = await page.evaluate(() => {
                  const ps = Array.from(document.querySelectorAll('p'))
                    .map(p => p.textContent?.trim() || '')
                    .filter(t => t.length > 2 && t.length < 50 && !['First Turn', 'Battle Points', 'Pairing Status', 'Submitted'].some(x => t.includes(x)))
                  return { p1: ps[0] || '', p2: ps[1] || '' }
                })

                // Use Playwright locators for checkbox state
                const cbs = page.getByRole('checkbox', { name: 'First Turn' })
                const cbCount = await cbs.count()
                let ft: 'p1' | 'p2' | 'unknown' = 'unknown'
                if (cbCount >= 2) {
                  const c1 = await cbs.nth(0).isChecked()
                  const c2 = await cbs.nth(1).isChecked()
                  if (c1 && !c2) ft = 'p1'
                  else if (c2 && !c1) ft = 'p2'
                }

                const info = { p1: names.p1, p2: names.p2, firstTurn: ft }

                progress[gameId] = {
                  gameUrl: game.url,
                  eventId: '',
                  round: 0,
                  player1Name: info.p1,
                  player2Name: info.p2,
                  firstTurn: info.firstTurn as 'p1' | 'p2' | 'unknown',
                }
                newScraped++
                totalScraped++
                process.stdout.write(info.firstTurn !== 'unknown' ? '.' : '?')
                await page.waitForTimeout(300)
              } catch {
                failed++
                process.stdout.write('x')
              }
            }
          } else {
            hasMore = false
          }
        }
      } catch (err) {
        console.log(`  Round ${round} error: ${(err as Error).message?.substring(0, 40)}`)
      }
    }
  }

  await page.close()
  await context.close()

  // Final save
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2))

  const known = Object.values(progress).filter(r => r.firstTurn !== 'unknown').length
  const p1First = Object.values(progress).filter(r => r.firstTurn === 'p1').length
  const p2First = Object.values(progress).filter(r => r.firstTurn === 'p2').length

  console.log(`\n\n${'='.repeat(60)}`)
  console.log(`Done. ${totalScraped} games scraped (${newScraped} new), ${failed} failed.`)
  console.log(`First turn data: ${known} known (${((known / totalScraped) * 100).toFixed(1)}%)`)
  console.log(`  P1 went first: ${p1First} (${((p1First / known) * 100).toFixed(1)}%)`)
  console.log(`  P2 went first: ${p2First} (${((p2First / known) * 100).toFixed(1)}%)`)
  console.log(`Saved to ${PROGRESS_FILE}`)
}

main().catch(console.error)

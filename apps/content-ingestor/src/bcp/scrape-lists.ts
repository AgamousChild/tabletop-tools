/**
 * Scrape army list text from BCP list URLs.
 * Second pass after pairings scrape — visits each list URL and extracts the text.
 *
 * Run: npx tsx src/bcp/scrape-lists.ts
 */

import { chromium } from 'playwright'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const BCP_DIR = '.local/ingest/bcp'
const BROWSER_STATE = path.join(BCP_DIR, 'browser-state')

interface PlayerRecord {
  wins: number
  losses: number
  draws: number
  faction: string
  listUrl: string | null
}

async function main() {
  const pairingFiles = readdirSync(BCP_DIR).filter(f => f.startsWith('pairings-') && f.endsWith('.json'))
  console.log(`Found ${pairingFiles.length} events with pairings data\n`)

  // Collect all unique list URLs across all events
  const listsByPlayer = new Map<string, { url: string; faction: string; eventName: string }>()

  for (const file of pairingFiles) {
    const data = JSON.parse(readFileSync(path.join(BCP_DIR, file), 'utf-8'))
    const eventName = data.event?.name || file
    const records = data.records as Record<string, PlayerRecord>

    for (const [, record] of Object.entries(records)) {
      if (record.listUrl) {
        const key = record.listUrl // dedupe by URL
        if (!listsByPlayer.has(key)) {
          listsByPlayer.set(key, { url: record.listUrl, faction: record.faction, eventName })
        }
      }
    }
  }

  console.log(`${listsByPlayer.size} unique army lists to scrape\n`)

  const context = await chromium.launchPersistentContext(BROWSER_STATE, { headless: false })
  const page = await context.newPage()

  const lists = new Map<string, string>() // URL → list text
  let scraped = 0
  let failed = 0

  const entries = [...listsByPlayer.entries()]

  for (let i = 0; i < entries.length; i++) {
    const [url, info] = entries[i]!

    try {
      process.stdout.write(`  [${i + 1}/${entries.length}] ${info.faction.substring(0, 20)}...`)

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await page.waitForTimeout(2000)

      const listText = await page.evaluate(() => {
        // Try multiple strategies to find the army list text
        // Strategy 1: Look for a pre/code block
        const pre = document.querySelector('pre, code')
        if (pre?.textContent && pre.textContent.length > 50) return pre.textContent.trim()

        // Strategy 2: Look for a container with list-like content
        const containers = document.querySelectorAll('[class*="list"], [class*="army"], [class*="roster"]')
        for (const c of containers) {
          if (c.textContent && c.textContent.length > 50) return c.textContent.trim()
        }

        // Strategy 3: Get the main content area
        const main = document.querySelector('main, article, [class*="content"]')
        if (main?.textContent && main.textContent.length > 50) return main.textContent.trim()

        // Strategy 4: Full body text minus nav/header/footer
        const body = document.body.cloneNode(true) as HTMLElement
        body.querySelectorAll('nav, header, footer, [class*="nav"], [class*="header"], [class*="footer"]').forEach(el => el.remove())
        const text = body.innerText?.trim() || ''
        return text.length > 50 ? text : ''
      })

      if (listText) {
        lists.set(url, listText)
        scraped++
        console.log(` ✓ (${listText.length} chars)`)
      } else {
        failed++
        console.log(' ✗ no list found')
      }

      // Save progress every 50 lists
      if ((i + 1) % 50 === 0) {
        saveLists(lists)
        console.log(`  [saved ${lists.size} lists]`)
      }

      // Rate limit
      await page.waitForTimeout(500)
    } catch (err) {
      failed++
      console.log(` ✗ ${(err as Error).message?.substring(0, 40)}`)
    }
  }

  await page.close()
  await context.close()

  // Save all lists
  saveLists(lists)

  // Update pairings files with list text
  let updated = 0
  for (const file of pairingFiles) {
    const data = JSON.parse(readFileSync(path.join(BCP_DIR, file), 'utf-8'))
    const records = data.records as Record<string, PlayerRecord & { listText?: string }>
    let changed = false

    for (const [, record] of Object.entries(records)) {
      if (record.listUrl && lists.has(record.listUrl)) {
        ;(record as any).listText = lists.get(record.listUrl)
        changed = true
        updated++
      }
    }

    if (changed) {
      writeFileSync(path.join(BCP_DIR, file), JSON.stringify(data, null, 2))
    }
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log(`Done. ${scraped} lists scraped, ${failed} failed.`)
  console.log(`${updated} player records updated with list text.`)
}

function saveLists(lists: Map<string, string>) {
  const obj: Record<string, string> = {}
  for (const [url, text] of lists) {
    obj[url] = text
  }
  writeFileSync(path.join(BCP_DIR, 'army-lists.json'), JSON.stringify(obj, null, 2))
}

main().catch(console.error)

/**
 * Scrape Google search results for 40K questions using Playwright.
 * Extracts AI Overviews + featured snippets + result snippets.
 * Writes results as JSON files for upload to R2 brain cache.
 *
 * Usage:
 *   npx playwright install chromium
 *   npx tsx scripts/scrape-brain-cache.ts [--output .local/brain-cache] [--batch 50] [--day 0-6]
 *
 * In GitHub Actions:
 *   npx tsx scripts/scrape-brain-cache.ts --output $RUNNER_TEMP/brain-cache --batch 100
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'

// ── Question lists ──────────────────────────────────────────────────────────

const FIXED_QUESTIONS = [
  // Core rules
  'How does the wound roll work in Warhammer 40K?',
  'What is feel no pain in 40K 10th edition?',
  'How does sustained hits work?',
  'How does lethal hits work?',
  'How does devastating wounds work?',
  'What is the fight phase sequence?',
  'How does overwatch work in 10th edition?',
  'How do stratagems work in 40K?',
  'What is lone operative?',
  'How does deep strike work?',
  'How does hazardous work?',
  'What is indirect fire in 40K?',
  'How do invulnerable saves work?',
  'How does the command phase work?',
  'What are battle-forged army rules?',
  'How does leader attachment work in 10th edition?',
  'What is objective control in 40K?',
  'How does transport work in 10th edition?',
  'What is stealth in 40K 10th edition?',
  'How does deadly demise work?',
  // Competitive / meta
  'Best Warhammer 40K army 2025',
  'Best space marine chapter 10th edition',
  'Death Guard competitive list 10th edition',
  'Tyranids best units 10th edition',
  'How to play Aeldari 10th edition',
  'Necrons strongest units 10th edition',
  'T\'au Empire competitive 10th edition',
  'Chaos Space Marines best detachment',
  'Imperial Knights competitive list',
  'Orks best units 10th edition',
]

const FACTIONS = [
  'Adepta Sororitas', 'Adeptus Custodes', 'Adeptus Mechanicus',
  'Aeldari', 'Astra Militarum', 'Chaos Daemons', 'Chaos Knights',
  'Chaos Space Marines', 'Death Guard', 'Drukhari', "Emperor's Children",
  'Genestealer Cults', 'Grey Knights', 'Imperial Agents', 'Imperial Knights',
  'Leagues of Votann', 'Necrons', 'Orks', 'Space Marines', "T'au Empire",
  'Thousand Sons', 'Tyranids', 'World Eaters',
]

function loadUnitNames(): string[] {
  // Try loading from built inventory
  const invPath = join(__dirname, '../apps/brain/server/.local/brain/test-inventory.json')
  if (existsSync(invPath)) {
    const inv = JSON.parse(readFileSync(invPath, 'utf-8'))
    const allUnits: string[] = []
    for (const units of Object.values(inv.factionUnits) as Array<Array<{ title: string }>>) {
      for (const u of units) {
        if (!allUnits.includes(u.title)) allUnits.push(u.title)
      }
    }
    return allUnits
  }
  return []
}

function hashQuestion(q: string): string {
  const normalized = q.toLowerCase().trim().replace(/\s+/g, ' ')
  let hash = 0
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) - hash + normalized.charCodeAt(i)) | 0
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

// ── Scraping ────────────────────────────────────────────────────────────────

interface ScrapeResult {
  question: string
  answer: string
  sources: Array<{ url: string; title: string }>
  scrapedAt: string
}

async function scrapeGoogle(page: any, question: string): Promise<ScrapeResult | null> {
  const query = `Warhammer 40K 10th Edition ${question}`

  try {
    await page.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    })

    // Wait for results to render
    await page.waitForSelector('#search', { timeout: 10000 }).catch(() => {})

    // Check for CAPTCHA
    const captcha = await page.$('form#captcha-form, div.g-recaptcha')
    if (captcha) {
      console.log(`  CAPTCHA detected for: ${question}`)
      return null
    }

    // Extract AI Overview
    const aiOverview = await page.evaluate(() => {
      // Try various selectors Google uses for AI Overview
      const selectors = [
        '[data-attrid*="ai"]',
        '.ai-dd-osrp',
        '[jsname="N760b"]',
        '.mod[data-md]',  // knowledge panel with AI content
      ]
      for (const sel of selectors) {
        const el = document.querySelector(sel)
        if (el && el.textContent && el.textContent.length > 50) {
          return el.textContent.trim()
        }
      }
      return ''
    }).catch(() => '')

    // Extract featured snippet
    const featuredSnippet = await page.evaluate(() => {
      const el = document.querySelector('.hgKElc, [data-attrid="wa:/description"] span')
      return el?.textContent?.trim() || ''
    }).catch(() => '')

    // Extract search result snippets + links
    const results = await page.evaluate(() => {
      const items: Array<{ url: string; title: string; snippet: string }> = []
      const resultBlocks = document.querySelectorAll('#search .g, #rso .g')
      for (const block of resultBlocks) {
        if (items.length >= 5) break
        const linkEl = block.querySelector('a[href^="http"]') as HTMLAnchorElement
        const titleEl = block.querySelector('h3')
        const snippetEl = block.querySelector('.VwiC3b, [data-sncf] span')
        if (linkEl?.href && titleEl?.textContent) {
          items.push({
            url: linkEl.href,
            title: titleEl.textContent.trim(),
            snippet: snippetEl?.textContent?.trim() || '',
          })
        }
      }
      return items
    }).catch(() => [])

    // Build answer from what we got
    const parts: string[] = []
    if (aiOverview) parts.push(aiOverview)
    if (featuredSnippet && featuredSnippet !== aiOverview) parts.push(featuredSnippet)
    for (const r of results) {
      if (r.snippet && r.snippet.length > 30) parts.push(r.snippet)
    }

    const answer = parts.join('\n\n')
    if (!answer && results.length === 0) {
      console.log(`  No content extracted for: ${question}`)
      return null
    }

    return {
      question,
      answer: answer || results.map(r => `${r.title}: ${r.snippet}`).join('\n'),
      sources: results.map(r => ({ url: r.url, title: r.title })),
      scrapedAt: new Date().toISOString(),
    }
  } catch (err) {
    console.log(`  Error scraping "${question}": ${err instanceof Error ? err.message : err}`)
    return null
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const outputDir = args.includes('--output') ? args[args.indexOf('--output')! + 1]! : '.local/brain-cache'
  const batchSize = args.includes('--batch') ? parseInt(args[args.indexOf('--batch')! + 1]!) : 50
  const dayOfWeek = args.includes('--day') ? parseInt(args[args.indexOf('--day')! + 1]!) : new Date().getDay()

  mkdirSync(outputDir, { recursive: true })

  // Build question list for today
  const questions: string[] = [...FIXED_QUESTIONS]

  // Add faction queries
  for (const f of FACTIONS) {
    questions.push(`${f} all units`)
  }

  // Add unit-name queries — rotate through units based on day
  const unitNames = loadUnitNames()
  if (unitNames.length > 0) {
    const unitsPerDay = Math.ceil(unitNames.length / 7)
    const start = dayOfWeek * unitsPerDay
    const todaysUnits = unitNames.slice(start, start + unitsPerDay)
    // Take up to (batchSize - fixed - factions) unit queries
    const unitSlots = Math.max(0, batchSize - questions.length)
    for (const name of todaysUnits.slice(0, unitSlots)) {
      questions.push(name)
    }
  }

  const total = Math.min(questions.length, batchSize)
  const batch = questions.slice(0, total)

  console.log(`Scraping ${batch.length} questions (day ${dayOfWeek}, batch ${batchSize})`)
  console.log(`  Fixed: ${FIXED_QUESTIONS.length}`)
  console.log(`  Factions: ${FACTIONS.length}`)
  console.log(`  Units: ${total - FIXED_QUESTIONS.length - FACTIONS.length}`)
  console.log(`  Output: ${outputDir}\n`)

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    locale: 'en-US',
  })
  const page = await context.newPage()

  let success = 0
  let failed = 0
  let captchas = 0

  for (let i = 0; i < batch.length; i++) {
    const question = batch[i]!
    const hash = hashQuestion(question)
    const outFile = join(outputDir, `${hash}.json`)

    // Skip if already scraped today
    if (existsSync(outFile)) {
      const existing = JSON.parse(readFileSync(outFile, 'utf-8'))
      const age = Date.now() - new Date(existing.scrapedAt).getTime()
      if (age < 24 * 60 * 60 * 1000) {
        console.log(`[${i + 1}/${batch.length}] CACHED: ${question}`)
        success++
        continue
      }
    }

    console.log(`[${i + 1}/${batch.length}] Searching: ${question}`)
    const result = await scrapeGoogle(page, question)

    if (result) {
      // Write in the format the Worker cache expects
      const cacheEntry = {
        answer: result.answer,
        sources: result.sources,
        cachedAt: result.scrapedAt,
      }
      writeFileSync(outFile, JSON.stringify(cacheEntry, null, 2))
      success++
    } else {
      failed++
      // Check if it was a CAPTCHA
      const pageContent = await page.content().catch(() => '')
      if (pageContent.includes('captcha') || pageContent.includes('recaptcha')) {
        captchas++
        if (captchas >= 3) {
          console.log('\nToo many CAPTCHAs — stopping early')
          break
        }
      }
    }

    // Random delay between requests (2-5 seconds)
    const delay = 2000 + Math.random() * 3000
    await new Promise(r => setTimeout(r, delay))
  }

  await browser.close()

  console.log(`\nDone: ${success} success, ${failed} failed, ${captchas} CAPTCHAs`)
  console.log(`Results in: ${outputDir}`)

  // Write summary for the upload step
  writeFileSync(join(outputDir, '_summary.json'), JSON.stringify({
    date: new Date().toISOString(),
    dayOfWeek,
    total: batch.length,
    success,
    failed,
    captchas,
  }, null, 2))
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

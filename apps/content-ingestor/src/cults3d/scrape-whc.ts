import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'node:fs'

const OUTPUT_DIR = '.local/whc'

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true })

  const browser = await chromium.launch({ headless: false })
  const page = await browser.newPage()

  // Search for 11th edition / new 40k terrain content
  const searches = [
    'https://www.warhammer-community.com/en-gb/?s=11th+edition+40k',
    'https://www.warhammer-community.com/en-gb/?s=new+edition+warhammer+40000',
    'https://www.warhammer-community.com/en-gb/?s=terrain+layout+40k',
    'https://www.warhammer-community.com/en-gb/?s=matched+play+terrain',
  ]

  const allArticles: Array<{ title: string; url: string; date: string; snippet: string }> = []

  for (const searchUrl of searches) {
    console.log(`\nSearching: ${searchUrl}\n`)
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(3000)

    const articles = await page.evaluate(() => {
      const results: Array<{ title: string; url: string; date: string; snippet: string }> = []

      // Try various selectors for article listings
      const links = document.querySelectorAll('a')
      const seen = new Set<string>()

      links.forEach(a => {
        const href = (a as HTMLAnchorElement).href
        if (!href.includes('warhammer-community.com') || seen.has(href)) return
        if (href.includes('?s=') || href.includes('/category/') || href.includes('/tag/')) return

        const heading = a.querySelector('h2, h3, h4')
        const title = heading?.textContent?.trim() || a.textContent?.trim() || ''
        if (!title || title.length < 10 || title.length > 200) return

        // Look for date
        const parent = a.closest('article, .post, [class*="card"], [class*="article"]')
        const dateEl = parent?.querySelector('time, [class*="date"], [datetime]')
        const date = dateEl?.textContent?.trim() || (dateEl as HTMLElement)?.getAttribute('datetime') || ''

        const snippet = parent?.querySelector('p, [class*="excerpt"], [class*="summary"]')?.textContent?.trim() || ''

        if (title.length > 10) {
          seen.add(href)
          results.push({ title: title.substring(0, 150), url: href, date, snippet: snippet.substring(0, 300) })
        }
      })

      return results
    })

    console.log(`  Found ${articles.length} articles`)
    allArticles.push(...articles)
  }

  // Dedup by URL
  const uniqueMap = new Map<string, typeof allArticles[0]>()
  for (const a of allArticles) {
    if (!uniqueMap.has(a.url)) uniqueMap.set(a.url, a)
  }
  const unique = [...uniqueMap.values()]

  console.log(`\nTotal unique articles: ${unique.length}`)

  // Filter for 11th edition / terrain / new 40k
  const relevant = unique.filter(a => {
    const text = `${a.title} ${a.snippet}`.toLowerCase()
    return text.includes('11th') || text.includes('new edition') || text.includes('terrain') ||
           text.includes('matched play') || text.includes('combat patrol') || text.includes('rules') ||
           text.includes('40,000') || text.includes('40k') || text.includes('warhammer 40')
  })

  console.log(`Relevant to 40k/11th/terrain: ${relevant.length}\n`)
  relevant.forEach(a => console.log(`  ${a.title}\n    ${a.url}\n    ${a.date}\n`))

  writeFileSync(`${OUTPUT_DIR}/articles.json`, JSON.stringify(relevant, null, 2))
  console.log(`Saved to ${OUTPUT_DIR}/articles.json`)

  // Now look specifically for terrain layout images
  console.log('\n\n=== Searching for terrain layouts ===\n')
  await page.goto('https://www.warhammer-community.com/en-gb/?s=terrain+layout+matched+play', { waitUntil: 'domcontentloaded', timeout: 15000 })
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${OUTPUT_DIR}/terrain-search.png`, fullPage: true })
  console.log('Screenshot saved to terrain-search.png')

  await page.close()
  await browser.close()
}

main().catch(console.error)

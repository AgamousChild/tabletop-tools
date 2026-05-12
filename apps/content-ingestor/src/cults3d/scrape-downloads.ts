import { chromium } from 'playwright'
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

const BROWSER_STATE = '.local/cults3d/browser-state'
const OUTPUT_DIR = '.local/cults3d'

async function main() {
  const context = await chromium.launchPersistentContext(BROWSER_STATE, { headless: false })
  const page = await context.newPage()

  await page.goto('https://cults3d.com/en/orders', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(3000)

  // Try clicking "EXPORT TO CSV" button
  const csvButton = page.getByText('EXPORT TO CSV')
  if (await csvButton.count() > 0) {
    // Set up download listener
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }),
      csvButton.click(),
    ])
    const csvPath = path.join(OUTPUT_DIR, 'downloads.csv')
    await download.saveAs(csvPath)
    console.log('CSV saved to', csvPath)
  } else {
    console.log('No CSV export button found, scraping page directly...')
  }

  // Also scrape the page for detail — the CSV might not have everything
  // Scroll to load all items
  let prevCount = 0
  for (let i = 0; i < 50; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(1000)

    const currentCount = await page.evaluate(() =>
      document.querySelectorAll('tr[class], .order-row, a[href*="/3d-model/"]').length
    )

    if (currentCount === prevCount && i > 2) break
    prevCount = currentCount
    if (i % 5 === 0) console.log(`  scrolling... ${currentCount} items loaded`)
  }

  // Scrape all download entries
  const downloads = await page.evaluate(() => {
    const rows = document.querySelectorAll('table tbody tr, .order-item')
    const results: Array<{
      orderNo: string
      date: string
      name: string
      price: string
      url: string
      designerUrl: string
    }> = []

    // Try table rows first
    const tableRows = document.querySelectorAll('table tbody tr')
    if (tableRows.length > 0) {
      tableRows.forEach(row => {
        const cells = row.querySelectorAll('td')
        if (cells.length < 3) return

        const orderNo = cells[0]?.textContent?.trim() || ''
        const date = cells[1]?.textContent?.trim() || ''
        const designCell = cells[2]
        const price = cells[3]?.textContent?.trim() || ''

        // Get the design link
        const designLink = designCell?.querySelector('a[href*="/3d-model/"]') as HTMLAnchorElement | null
        const name = designLink?.textContent?.trim() || designCell?.textContent?.trim() || ''
        const url = designLink?.href || ''

        // Get designer link
        const designerLink = designCell?.querySelector('a[href*="/users/"]') as HTMLAnchorElement | null
        const designerUrl = designerLink?.href || ''

        if (orderNo || name) {
          results.push({ orderNo, date, name, price, url, designerUrl })
        }
      })
    }

    // Fallback: try links directly
    if (results.length === 0) {
      document.querySelectorAll('a[href*="/3d-model/"]').forEach(link => {
        const a = link as HTMLAnchorElement
        results.push({
          orderNo: '',
          date: '',
          name: a.textContent?.trim() || '',
          price: '',
          url: a.href,
          designerUrl: '',
        })
      })
    }

    return results
  })

  console.log(`\nScraped ${downloads.length} downloads`)

  // Check for pagination — "Load More" or next page
  const hasMore = await page.evaluate(() => {
    const loadMore = document.querySelector('a[href*="page="], button:has-text("Load more"), .pagination a')
    return !!loadMore
  })

  if (hasMore) {
    console.log('Pagination detected — there are more pages')

    // Get all page links
    let pageNum = 2
    while (true) {
      const nextUrl = `https://cults3d.com/en/orders?page=${pageNum}`
      console.log(`  Loading page ${pageNum}...`)
      await page.goto(nextUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await page.waitForTimeout(2000)

      const pageDownloads = await page.evaluate(() => {
        const tableRows = document.querySelectorAll('table tbody tr')
        const results: Array<{
          orderNo: string
          date: string
          name: string
          price: string
          url: string
          designerUrl: string
        }> = []

        tableRows.forEach(row => {
          const cells = row.querySelectorAll('td')
          if (cells.length < 3) return

          const orderNo = cells[0]?.textContent?.trim() || ''
          const date = cells[1]?.textContent?.trim() || ''
          const designCell = cells[2]
          const price = cells[3]?.textContent?.trim() || ''
          const designLink = designCell?.querySelector('a[href*="/3d-model/"]') as HTMLAnchorElement | null
          const name = designLink?.textContent?.trim() || designCell?.textContent?.trim() || ''
          const url = designLink?.href || ''
          const designerLink = designCell?.querySelector('a[href*="/users/"]') as HTMLAnchorElement | null
          const designerUrl = designerLink?.href || ''

          if (orderNo || name) {
            results.push({ orderNo, date, name, price, url, designerUrl })
          }
        })

        return results
      })

      if (pageDownloads.length === 0) break
      downloads.push(...pageDownloads)
      console.log(`  ${pageDownloads.length} items on page ${pageNum} (${downloads.length} total)`)
      pageNum++

      if (pageNum > 100) break // safety limit
    }
  }

  // Save results
  writeFileSync(path.join(OUTPUT_DIR, 'downloads.json'), JSON.stringify(downloads, null, 2))
  console.log(`\nSaved ${downloads.length} downloads to ${OUTPUT_DIR}/downloads.json`)

  // Summary
  const free = downloads.filter(d => d.price.toLowerCase().includes('free')).length
  const paid = downloads.length - free
  console.log(`  Free: ${free}`)
  console.log(`  Paid: ${paid}`)

  await page.close()
  await context.close()
}

main().catch(console.error)

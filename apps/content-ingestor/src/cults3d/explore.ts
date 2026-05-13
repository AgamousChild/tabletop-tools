import { chromium } from 'playwright'

async function main() {
  const context = await chromium.launchPersistentContext('.local/cults3d/browser-state', {
    headless: false,
  })
  const page = await context.newPage()

  // Check the orders page structure - just one page, one screenshot
  await page.goto('https://cults3d.com/en/orders', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(3000)

  // Get all links on the page to understand navigation
  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a'))
      .map(a => ({ text: a.textContent?.trim(), href: a.href }))
      .filter(l => l.href.includes('cults3d') && l.text && l.text.length > 0 && l.text.length < 80)
      .filter(l => !l.href.includes('cdn') && !l.href.includes('javascript'))
  })

  console.log('Links on orders page:')
  const unique = new Map<string, string>()
  links.forEach(l => { if (!unique.has(l.href)) unique.set(l.href, l.text!) })
  for (const [href, text] of unique) {
    console.log(`  ${text} → ${href}`)
  }

  // Check if there's a CSV export and what months are available
  const csvLinks = links.filter(l => l.text?.includes('CSV') || l.href.includes('csv') || l.href.includes('export'))
  console.log('\nCSV links:', csvLinks)

  // Check for pagination
  const pagination = links.filter(l => l.href.includes('page='))
  console.log('\nPagination:', pagination.length, 'page links')

  // Count rows on first page
  const rowCount = await page.evaluate(() => document.querySelectorAll('table tbody tr').length)
  console.log('\nRows on page 1:', rowCount)

  // Get first 3 model links to understand structure
  const modelLinks = links.filter(l => l.href.includes('/3d-model/'))
  console.log('\nModel links found:', modelLinks.length)
  modelLinks.slice(0, 3).forEach(l => console.log(`  ${l.text} → ${l.href}`))

  await page.close()
  await context.close()
}

main().catch(console.error)

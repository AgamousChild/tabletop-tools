import { chromium } from 'playwright'

async function main() {
  const pageNum = parseInt(process.argv[2] || '62')
  const c = await chromium.launchPersistentContext('.local/cults3d/browser-state', { headless: false })
  const p = await c.newPage()

  const url = `https://cults3d.com/en/orders?page=${pageNum}`
  console.log(`Checking page ${pageNum}: ${url}\n`)

  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
  await p.waitForTimeout(3000)

  const info = await p.evaluate(() => {
    const rows = document.querySelectorAll('table tbody tr')
    const links = document.querySelectorAll('a[href*="/3d-model/"]')
    const allLinks = document.querySelectorAll('a')
    const pageLinks = Array.from(allLinks).filter(a => a.href.includes('page=')).map(a => a.textContent?.trim())

    const rowData = Array.from(rows).slice(0, 3).map(row => {
      const cells = row.querySelectorAll('td')
      return Array.from(cells).map(c => c.textContent?.trim().substring(0, 50))
    })

    return {
      rowCount: rows.length,
      modelLinkCount: links.length,
      pageLinks: pageLinks.slice(0, 10),
      sampleRows: rowData,
      bodyPreview: document.body.innerText.substring(0, 500),
    }
  })

  console.log('Rows:', info.rowCount)
  console.log('Model links:', info.modelLinkCount)
  console.log('Page links:', info.pageLinks)
  console.log('\nSample rows:')
  info.sampleRows.forEach((r, i) => console.log(`  Row ${i}:`, r))

  await p.close()
  await c.close()
}

main().catch(console.error)

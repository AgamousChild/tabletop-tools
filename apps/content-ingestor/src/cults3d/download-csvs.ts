import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const BROWSER_STATE = '.local/cults3d/browser-state'
const CSV_DIR = '.local/cults3d/csvs'

async function main() {
  mkdirSync(CSV_DIR, { recursive: true })

  const c = await chromium.launchPersistentContext(BROWSER_STATE, { headless: false })
  const p = await c.newPage()

  await p.goto('https://cults3d.com/en/orders/exports/new', { waitUntil: 'domcontentloaded', timeout: 15000 })
  await p.waitForTimeout(3000)

  // Get all month links
  const monthLinks = await p.evaluate(() => {
    return Array.from(document.querySelectorAll('a'))
      .filter(a => /^(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+\d{4}$/i.test(a.textContent?.trim() || ''))
      .map(a => ({
        text: a.textContent?.trim() || '',
        href: (a as HTMLAnchorElement).href,
      }))
  })

  console.log(`Found ${monthLinks.length} months\n`)

  for (let i = 0; i < monthLinks.length; i++) {
    const month = monthLinks[i]!
    const filename = month.text.toLowerCase().replace(/\s+/g, '-') + '.csv'
    const filepath = path.join(CSV_DIR, filename)

    process.stdout.write(`  [${i + 1}/${monthLinks.length}] ${month.text}...`)

    try {
      const [download] = await Promise.all([
        p.waitForEvent('download', { timeout: 10000 }),
        p.evaluate((href: string) => {
          const link = document.querySelector(`a[href="${href}"]`) as HTMLAnchorElement
          if (link) link.click()
        }, month.href),
      ])

      await download.saveAs(filepath)
      console.log(' saved')
    } catch {
      // Maybe it's not a download link but a navigation link
      try {
        await p.goto(month.href, { waitUntil: 'domcontentloaded', timeout: 10000 })
        await p.waitForTimeout(1000)

        // Check if this page has a download button or CSV content
        const content = await p.evaluate(() => document.body.innerText.substring(0, 200))
        console.log(` (page: ${content.substring(0, 50).replace(/\n/g, ' ')}...)`)

        // Go back to the exports page
        await p.goto('https://cults3d.com/en/orders/exports/new', { waitUntil: 'domcontentloaded', timeout: 10000 })
        await p.waitForTimeout(1000)
      } catch {
        console.log(' failed')
      }
    }
  }

  await p.close()
  await c.close()
  console.log(`\nDone. CSVs saved to ${CSV_DIR}`)
}

main().catch(console.error)

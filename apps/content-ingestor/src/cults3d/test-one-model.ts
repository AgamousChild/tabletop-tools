import { chromium } from 'playwright'

const BROWSER_STATE = '.local/cults3d/browser-state'

async function main() {
  const context = await chromium.launchPersistentContext(BROWSER_STATE, { headless: false })
  const page = await context.newPage()

  // Test ONE model page
  const testUrl = 'https://cults3d.com/en/3d-model/game/crusade-addict-lieutenant'
  console.log('Testing:', testUrl)

  await page.goto(testUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(3000)

  const status = page.url().includes('404') ? 404 : 200
  console.log('Status:', status)

  const data = await page.evaluate(() => {
    const name = document.querySelector('h1')?.textContent?.trim() || ''
    const description = document.querySelector('[class*="description"], .creation-description, .text-block')?.textContent?.trim() || ''
    const thumbnail = (document.querySelector('meta[property="og:image"]') as HTMLMetaElement)?.content ||
                      (document.querySelector('.creation-image img, .main-image img') as HTMLImageElement)?.src || ''
    const designer = document.querySelector('a[href*="/users/"]')?.textContent?.trim() || ''

    // Get all text for debugging
    const bodyText = document.body.innerText.substring(0, 2000)

    return { name, description, thumbnail, designer, bodyText }
  })

  console.log('\n=== RESULT ===')
  console.log('Name:', data.name)
  console.log('Thumbnail:', data.thumbnail)
  console.log('Designer:', data.designer)
  console.log('Description:', data.description.substring(0, 200))
  console.log('\n=== PAGE TEXT (first 1000 chars) ===')
  console.log(data.bodyText.substring(0, 1000))

  await page.close()
  await context.close()
}

main().catch(console.error)

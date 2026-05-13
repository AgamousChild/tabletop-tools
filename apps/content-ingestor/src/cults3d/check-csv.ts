import { chromium } from 'playwright'

async function main() {
  const c = await chromium.launchPersistentContext('.local/cults3d/browser-state', { headless: false })
  const p = await c.newPage()
  await p.goto('https://cults3d.com/en/orders/exports/new', { waitUntil: 'domcontentloaded', timeout: 15000 })
  await p.waitForTimeout(3000)

  const text = await p.evaluate(() => document.body.innerText.substring(0, 2000))
  console.log('CSV Export page:\n')
  console.log(text)

  // Get all form elements
  const forms = await p.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input, select, button'))
    return inputs.map(el => ({
      tag: el.tagName,
      type: (el as HTMLInputElement).type || '',
      name: (el as HTMLInputElement).name || '',
      value: (el as HTMLInputElement).value || '',
      text: el.textContent?.trim().substring(0, 50) || '',
    }))
  })
  console.log('\nForm elements:', JSON.stringify(forms, null, 2))

  await p.close()
  await c.close()
}

main().catch(console.error)

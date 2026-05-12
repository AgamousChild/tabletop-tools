import { chromium } from 'playwright'

async function main() {
  const context = await chromium.launchPersistentContext('.local/cults3d/browser-state2', {
    headless: false,
  })
  const page = await context.newPage()
  await page.goto('https://cults3d.com/en')
  console.log('Log into Cults3D in the browser window.')
  console.log('When done, press Ctrl+C to save your session.')
  await new Promise(r => setTimeout(r, 600000))
  await context.close()
}

main().catch(console.error)

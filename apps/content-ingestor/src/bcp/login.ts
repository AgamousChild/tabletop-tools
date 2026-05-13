/**
 * Opens a persistent browser so you can log into BCP.
 * Run: npx tsx src/bcp/login.ts
 * Log in, then press Ctrl+C.
 */
import { chromium } from 'playwright'

const ctx = await chromium.launchPersistentContext('.local/ingest/bcp/browser-state', {
  headless: false,
})
const page = await ctx.newPage()
await page.goto('https://www.bestcoastpairings.com')
console.log('Log into BCP in the browser, then press Ctrl+C to close.')
await new Promise(() => {})

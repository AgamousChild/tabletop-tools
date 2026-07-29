/**
 * Standalone entry point for a one-off events + pairings scrape.
 *
 * Wraps runScrape() from src/lib/scrape.ts for direct Node invocation —
 * the Worker's cron calls runScrape() internally; this script makes it
 * callable from the ops MCP and the command line.
 *
 * Run from apps/bcp-scraper/server/:
 *   set -a && source ../../../.env && set +a
 *   NODE_OPTIONS=--dns-result-order=ipv4first \
 *     node --import tsx/esm scripts/run-scrape.ts
 *
 * Args (all optional):
 *   --start YYYY-MM-DD   Override start date (default: 7 days ago)
 *   --end   YYYY-MM-DD   Override end date   (default: today)
 */

import { createDb } from '@tabletop-tools/db'

import { runScrape } from '../src/lib/scrape.js'

function parseArgs() {
  const args = process.argv.slice(2)
  let start: string | null = null
  let end: string | null = null
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--start' || args[i] === '--since') && args[i + 1]) start = args[++i]!
    if ((args[i] === '--end' || args[i] === '--until') && args[i + 1]) end = args[++i]!
  }
  return { start, end }
}

async function main() {
  const dbUrl = process.env.TURSO_DB_URL
  const authToken = process.env.TURSO_AUTH_TOKEN
  const bcpEmail = process.env.BCP_EMAIL
  const bcpPassword = process.env.BCP_PASSWORD

  if (!dbUrl) {
    console.error('TURSO_DB_URL required')
    process.exit(1)
  }
  if (!bcpEmail || !bcpPassword) {
    console.error('BCP_EMAIL and BCP_PASSWORD required')
    process.exit(1)
  }

  const db = createDb({ url: dbUrl, authToken })

  const { start, end } = parseArgs()
  if (start || end) {
    console.log(`Date range override: ${start ?? 'default'} → ${end ?? 'default'}`)
    console.log('Note: runScrape() uses a fixed 7-day rolling window internally.')
    console.log('For arbitrary date-range backfill, use scripts/scrape-jun-jul.ts as a template.')
  }

  console.log('Starting BCP events + pairings scrape...')
  const { jobId } = await runScrape({ bcpEmail, bcpPassword, db }, 'manual-ops')
  console.log(`\nJob complete. jobId=${jobId}`)
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})

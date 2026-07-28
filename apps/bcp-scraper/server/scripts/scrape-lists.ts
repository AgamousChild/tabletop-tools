/**
 * Fetch army list text for meta_event_players rows that have source_list_id
 * set but no list_text yet.
 *
 * BCP list API (2026-07-27):
 *   Endpoint: GET https://newprod-api.bestcoastpairings.com/v1/lists/{listId}
 *   Auth: requires Bearer token from Cognito (same flow as events scrape).
 *   Returns 403 without auth, 200 with a response body containing the list text.
 *   The HTML page (https://www.bestcoastpairings.com/list/{listId}) is public
 *   but client-side rendered — not accessible via plain fetch.
 *
 * This script authenticates via BCP Cognito, then fetches each pending list.
 * Idempotent: skips rows where list_text IS NOT NULL.
 * Scope: optional --since / --until date filter (event date, ISO string).
 * Optional: --event-id to restrict to one BCP source event ID.
 *
 * Run from apps/bcp-scraper/server/:
 *   set -a && source ../../../.env && set +a
 *   NODE_OPTIONS=--dns-result-order=ipv4first \
 *     node --import tsx/esm scripts/scrape-lists.ts [--since 2026-06-01] [--until 2026-07-31]
 *
 * Required env vars: TURSO_DB_URL, TURSO_AUTH_TOKEN, BCP_EMAIL, BCP_PASSWORD
 */

import { createDb } from '@tabletop-tools/db'
import { sql } from 'drizzle-orm'

import { authenticateBcp } from '../src/lib/cognito.js'

const BASE_URL = 'https://newprod-api.bestcoastpairings.com'

/** Batch size: how many list fetches to do per pass (100 is comfortably within rate limits). */
const BATCH_SIZE = 100

interface PendingRow {
  id: string
  source_list_id: string
  player_name: string
  event_date: number
}

interface BcpListResponse {
  listText?: string | null
  list?: string | null
  armyList?: string | null
  rosters?: string | null
}

/**
 * Fetch list text from the BCP REST API for a single listId.
 * Returns null if the player did not submit a list.
 * Throws on unexpected errors (non-200, non-404).
 */
async function fetchListText(listId: string, token: string): Promise<string | null> {
  const resp = await fetch(`${BASE_URL}/v1/lists/${listId}`, {
    headers: {
      'client-id': 'web-app',
      env: 'bcp',
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
  })

  if (resp.status === 404) return null
  if (resp.status === 403) {
    throw new Error(`BCP list API returned 403 for listId=${listId} — token may have expired`)
  }
  if (!resp.ok) {
    throw new Error(`BCP list API error ${resp.status} for listId=${listId}`)
  }

  const body = (await resp.json()) as BcpListResponse

  // Try known field names — BCP API field naming is not fully documented
  const text = body.listText ?? body.list ?? body.armyList ?? body.rosters ?? null
  if (!text || String(text).trim().length < 10) return null
  return String(text).trim()
}

function parseArgs() {
  const args = process.argv.slice(2)
  let since: number | null = null
  let until: number | null = null
  let eventId: string | null = null

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--since' && args[i + 1]) {
      since = new Date(args[++i]!).getTime()
    } else if (args[i] === '--until' && args[i + 1]) {
      until = new Date(args[++i]!).getTime()
    } else if (args[i] === '--event-id' && args[i + 1]) {
      eventId = args[++i]!
    }
  }

  return { since, until, eventId }
}

async function main() {
  const startTime = Date.now()
  const { since, until, eventId } = parseArgs()

  const dbUrl = process.env.TURSO_DB_URL
  const authToken = process.env.TURSO_AUTH_TOKEN
  const bcpEmail = process.env.BCP_EMAIL
  const bcpPassword = process.env.BCP_PASSWORD

  if (!dbUrl) {
    console.error('TURSO_DB_URL required')
    process.exit(1)
  }
  if (!bcpEmail || !bcpPassword) {
    console.error('BCP_EMAIL and BCP_PASSWORD required — the BCP list API requires auth')
    process.exit(1)
  }

  const db = createDb({ url: dbUrl, authToken })

  // Verify migration has run
  const cols = (await db.all(sql`PRAGMA table_info(meta_event_players)`)) as Array<{
    name: string
  }>
  const hasSourceListId = cols.some((c) => c.name === 'source_list_id')
  if (!hasSourceListId) {
    console.error(
      'meta_event_players.source_list_id column missing — run migration 0014_bcp_source_list_id.sql first',
    )
    process.exit(1)
  }

  // Authenticate with BCP
  console.log('Authenticating with BCP...')
  const token = await authenticateBcp({ email: bcpEmail, password: bcpPassword })
  console.log('Auth OK.')

  // Build query for pending rows
  const conditions: string[] = [
    `mep.source_list_id IS NOT NULL`,
    `(mep.list_text IS NULL OR mep.list_text = '')`,
    `me.source = 'bcp'`,
  ]

  if (since !== null) conditions.push(`me.date >= ${since}`)
  if (until !== null) conditions.push(`me.date <= ${until}`)
  if (eventId !== null) conditions.push(`me.source_id = '${eventId.replace(/'/g, "''")}'`)

  const whereClause = conditions.join(' AND ')

  const pending = (await db.all(
    sql.raw(`
    SELECT mep.id, mep.source_list_id, mep.player_name, me.date as event_date
    FROM meta_event_players mep
    JOIN meta_events me ON mep.event_id = me.id
    WHERE ${whereClause}
    ORDER BY me.date DESC
    LIMIT ${BATCH_SIZE}
  `),
  )) as PendingRow[]

  console.log(`\nPending rows (up to ${BATCH_SIZE}): ${pending.length}`)
  if (since || until || eventId) {
    console.log(
      `  Filter: since=${since ? new Date(since).toISOString().slice(0, 10) : 'none'}, until=${until ? new Date(until).toISOString().slice(0, 10) : 'none'}, event=${eventId ?? 'none'}`,
    )
  }

  if (pending.length === 0) {
    console.log('Nothing to do.')
    return
  }

  let fetched = 0
  let skipped = 0
  let failed = 0
  const errors: string[] = []

  for (let i = 0; i < pending.length; i++) {
    const row = pending[i]!
    process.stdout.write(
      `  [${i + 1}/${pending.length}] ${row.player_name.substring(0, 30)} (listId=${row.source_list_id})...`,
    )

    try {
      const listText = await fetchListText(row.source_list_id, token)

      if (!listText) {
        skipped++
        console.log(' (no list submitted)')
        // Mark with a sentinel so we don't retry indefinitely on non-submitters.
        // Empty string means "checked — no list".
        await db.run(sql`UPDATE meta_event_players SET list_text = '' WHERE id = ${row.id}`)
        continue
      }

      await db.run(sql`UPDATE meta_event_players SET list_text = ${listText} WHERE id = ${row.id}`)
      fetched++
      console.log(` OK (${listText.length} chars)`)

      // Polite rate limit
      await new Promise((r) => setTimeout(r, 150))
    } catch (err) {
      failed++
      const msg = `${row.id} (${row.player_name}): ${(err as Error).message}`
      errors.push(msg)
      console.log(` ERROR: ${(err as Error).message?.substring(0, 80)}`)
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`\n===== LIST SCRAPE COMPLETE =====`)
  console.log(`Duration: ${elapsed}s`)
  console.log(`Fetched: ${fetched}, skipped (no list): ${skipped}, failed: ${failed}`)
  if (errors.length > 0) {
    console.log('\nErrors:')
    for (const e of errors) console.log(`  - ${e}`)
  }

  // Verify: how many rows still need lists?
  const remaining = (await db.all(
    sql.raw(`
    SELECT COUNT(*) as cnt
    FROM meta_event_players mep
    JOIN meta_events me ON mep.event_id = me.id
    WHERE ${whereClause}
  `),
  )) as Array<{ cnt: number }>
  console.log(`\nRows still pending: ${remaining[0]?.cnt ?? '?'}`)
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})

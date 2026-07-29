/**
 * CLI wrapper around parsePendingLists() — parses meta_event_players.list_text
 * into list_ttt for every row that has text but no parse yet.
 *
 * parsePendingLists is chunked at 100 rows per call (Worker CPU budget, root
 * CLAUDE.md rule 9). This wrapper loops it until a pass does no work, so a
 * backfill of thousands of rows completes in one command without any single
 * invocation running long.
 *
 * Run from the repo root:
 *   set -a && source .env && set +a
 *   NODE_OPTIONS=--dns-result-order=ipv4first \
 *     npx --prefix apps/bcp-scraper/server tsx apps/bcp-scraper/server/scripts/parse-lists.ts
 *
 * Required env vars: TURSO_DB_URL, TURSO_AUTH_TOKEN
 */
import { createDb } from '@tabletop-tools/db'
import { sql } from 'drizzle-orm'

import { loadFactionMap } from '../src/lib/faction-map.js'
import { parsePendingLists } from '../src/lib/parse-lists.js'

/** Safety stop so a bug in the pending-rows query can't spin forever. */
const MAX_PASSES = 200

async function main() {
  const startTime = Date.now()
  const dbUrl = process.env.TURSO_DB_URL
  if (!dbUrl) {
    console.error('TURSO_DB_URL required')
    process.exit(1)
  }

  const db = createDb({ url: dbUrl, authToken: process.env.TURSO_AUTH_TOKEN })

  // parseList -> gw-parser -> normalizeFaction throws unless the faction map is
  // loaded first. runScrape() does this before calling parsePendingLists in the
  // Worker; a standalone parse run has to do it itself.
  await loadFactionMap(db)

  const pendingCount = async (): Promise<number> => {
    const rows = (await db.all(sql`
      SELECT COUNT(*) AS cnt
      FROM meta_event_players mep
      JOIN meta_events me ON mep.event_id = me.id
      WHERE mep.list_ttt IS NULL
        AND mep.list_text IS NOT NULL
        AND mep.list_text != ''
        AND me.date > ${new Date('2026-01-01').getTime()}
    `)) as Array<{ cnt: number }>
    return rows[0]?.cnt ?? 0
  }

  // --retry-failed clears list_ttt on rows whose stored parse failed, putting
  // them back in the pending queue. Use after a parser fix; rows that parsed
  // ok or partial are left alone.
  if (process.argv.includes('--retry-failed')) {
    const res = await db.run(sql`
      UPDATE meta_event_players
      SET list_ttt = NULL
      WHERE list_ttt LIKE '%"parseStatus":"failed"%'
    `)
    console.log(`--retry-failed: cleared ${res.rowsAffected} failed parses for re-parse`)
  }

  const before = await pendingCount()
  console.log(`Rows awaiting parse: ${before}`)
  if (before === 0) {
    console.log('Nothing to do.')
    return
  }

  const totals = { parsed: 0, partial: 0, failed: 0, skipped: 0 }
  let pass = 0

  for (; pass < MAX_PASSES; pass++) {
    const r = await parsePendingLists(db)
    const touched = r.parsed + r.partial + r.failed + r.skipped
    totals.parsed += r.parsed
    totals.partial += r.partial
    totals.failed += r.failed
    totals.skipped += r.skipped

    console.log(
      `  pass ${pass + 1}: parsed=${r.parsed} partial=${r.partial} failed=${r.failed} skipped=${r.skipped}`,
    )

    // A pass that touches nothing means the queue is drained. `skipped` rows
    // are counted as touched but never get list_ttt written, so bail rather
    // than loop on them forever.
    if (touched === 0 || touched === r.skipped) break
  }

  const after = await pendingCount()
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  console.log('\n===== PARSE COMPLETE =====')
  console.log(`Duration: ${elapsed}s over ${pass + 1} passes`)
  console.log(
    `parsed=${totals.parsed} partial=${totals.partial} failed=${totals.failed} skipped=${totals.skipped}`,
  )
  console.log(`Rows awaiting parse: ${before} → ${after}`)
  if (pass >= MAX_PASSES - 1) {
    console.log(`WARNING: hit the ${MAX_PASSES}-pass safety stop — re-run to continue.`)
  }
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})

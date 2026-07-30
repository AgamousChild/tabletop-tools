/**
 * CLI wrapper around backfillDetachmentsFromLists() + a cube rebuild.
 *
 * Populates meta_event_players.detachment_id from the parsed list blob
 * (list_ttt), then rebuilds fact_game_results for the events it touched —
 * without that second half the cube keeps serving the old NULL detachments.
 *
 * Loops the backfill (chunked per call, root CLAUDE.md rule 9) until the
 * queue drains, then rebuilds once for the union of touched events.
 *
 * Run from the repo root:
 *   set -a && source .env && set +a
 *   NODE_OPTIONS=--dns-result-order=ipv4first \
 *     npx --prefix apps/bcp-scraper/server tsx \
 *       apps/bcp-scraper/server/scripts/backfill-detachments.ts [--since 2026-06-01] [--until 2026-07-31] [--dry-run] [--skip-cube]
 *
 * Required env vars: TURSO_DB_URL, TURSO_AUTH_TOKEN
 */
import { createDb } from '@tabletop-tools/db'
import { backfillDetachmentsFromLists, buildCubeForEvents } from '@tabletop-tools/server-core'

/** Safety stop so a resolver bug can't spin forever. */
const MAX_PASSES = 200
const CHUNK = 500

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag)
  return i === -1 || i + 1 >= process.argv.length ? null : (process.argv[i + 1] ?? null)
}

async function main() {
  const startTime = Date.now()
  const dbUrl = process.env.TURSO_DB_URL
  if (!dbUrl) {
    console.error('TURSO_DB_URL required')
    process.exit(1)
  }

  const dryRun = process.argv.includes('--dry-run')
  const skipCube = process.argv.includes('--skip-cube')
  const sinceArg = argValue('--since')
  const untilArg = argValue('--until')
  const since = sinceArg ? Date.parse(`${sinceArg}T00:00:00Z`) : undefined
  const until = untilArg ? Date.parse(`${untilArg}T23:59:59Z`) : undefined

  const db = createDb({ url: dbUrl, authToken: process.env.TURSO_AUTH_TOKEN })

  console.log(
    `Backfilling detachment_id from list_ttt${dryRun ? ' (DRY RUN — no writes)' : ''}` +
      `${sinceArg || untilArg ? `  window: ${sinceArg ?? 'any'} → ${untilArg ?? 'any'}` : ''}`,
  )

  const touched = new Set<string>()
  const unmatched = new Map<string, { raw: string; factionId: string; count: number }>()
  let scanned = 0
  let updated = 0
  let noDetachment = 0
  let pass = 0

  for (; pass < MAX_PASSES; pass++) {
    const r = await backfillDetachmentsFromLists(db, { limit: CHUNK, since, until, dryRun })
    scanned += r.scanned
    updated += r.updated
    noDetachment += r.noDetachmentInList
    for (const id of r.eventIds) touched.add(id)
    for (const m of r.unmatched) {
      const key = `${m.factionId}::${m.raw}`
      const cur = unmatched.get(key)
      if (cur) cur.count += m.count
      else unmatched.set(key, { ...m })
    }

    console.log(
      `  pass ${pass + 1}: scanned=${r.scanned} updated=${r.updated} no-detachment=${r.noDetachmentInList} unresolved=${r.unmatched.reduce((a, b) => a + b.count, 0)}`,
    )

    // A dry run never writes, so rows stay pending and the query returns the
    // same chunk forever — one pass is all the signal it can give.
    if (dryRun) break
    if (r.scanned === 0) break
    // Nothing written and nothing left to write means the rest are all
    // unresolvable; another pass would return the identical chunk.
    if (r.updated === 0) break
  }

  console.log('\n===== BACKFILL SUMMARY =====')
  console.log(`scanned=${scanned}  updated=${updated}  no-detachment-in-list=${noDetachment}`)
  console.log(`events touched: ${touched.size}`)

  const unresolvedTotal = [...unmatched.values()].reduce((a, b) => a + b.count, 0)
  console.log(`\nunresolved: ${unresolvedTotal} rows across ${unmatched.size} distinct values`)
  const top = [...unmatched.values()].sort((a, b) => b.count - a.count).slice(0, 25)
  for (const m of top) {
    console.log(`  ${String(m.count).padStart(4)}  ${m.factionId}  ${m.raw}`)
  }
  if (unmatched.size > top.length) {
    console.log(`  ... and ${unmatched.size - top.length} more distinct values`)
  }
  console.log('\nUnresolved values usually mean dim_detachment is missing the entry.')

  if (dryRun) {
    console.log('\nDry run — no rows written, cube not rebuilt.')
    return
  }

  if (skipCube) {
    console.log(`\n--skip-cube set. fact_game_results still holds the OLD detachment values.`)
    console.log(`Rebuild before trusting cube output.`)
    return
  }

  if (touched.size === 0) {
    console.log('\nNo events touched — cube rebuild not needed.')
    return
  }

  console.log(`\nRebuilding cube for ${touched.size} events...`)
  await buildCubeForEvents(db, [...touched])
  console.log('Cube rebuilt.')

  console.log(
    `\nDuration: ${((Date.now() - startTime) / 1000).toFixed(1)}s over ${pass + 1} passes`,
  )
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})

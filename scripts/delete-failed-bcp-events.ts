/**
 * One-off: delete the 2 events that FK-failed on the BCP Jun-Jul backfill so
 * the scraper's existingSourceIds filter no longer skips them, then a
 * re-run of scrape-jun-jul.ts picks them up cleanly.
 *
 *   npx tsx scripts/delete-failed-bcp-events.ts
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { createClient } from '@libsql/client'

function loadEnv(): void {
  const p = join(process.cwd(), '.env')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let v = m[2]!
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1)
    if (!process.env[m[1]!]) process.env[m[1]!] = v
  }
}
loadEnv()

const FAILED = ['lcXJ8EOAP6ax', 'T7olutX9PTqa'] // Terracon 2026, Warhammer Open Tacoma

async function main(): Promise<void> {
  const url = process.env.TURSO_DB_URL
  const authToken = process.env.TURSO_AUTH_TOKEN
  if (!url || !authToken) {
    console.error('TURSO_DB_URL / TURSO_AUTH_TOKEN missing')
    process.exit(1)
  }
  const client = createClient({ url, authToken })

  for (const sourceId of FAILED) {
    const before = await client.execute({
      sql: 'SELECT id, name FROM meta_events WHERE source = ? AND source_id = ?',
      args: ['bcp', sourceId],
    })
    console.log(`before ${sourceId}: ${JSON.stringify(before.rows[0] ?? '(not present)')}`)

    const players = await client.execute({
      sql: 'DELETE FROM meta_event_players WHERE event_id IN (SELECT id FROM meta_events WHERE source = ? AND source_id = ?)',
      args: ['bcp', sourceId],
    })
    console.log(`  deleted ${players.rowsAffected} meta_event_players rows`)

    const pairings = await client.execute({
      sql: 'DELETE FROM meta_pairings WHERE event_id IN (SELECT id FROM meta_events WHERE source = ? AND source_id = ?)',
      args: ['bcp', sourceId],
    })
    console.log(`  deleted ${pairings.rowsAffected} meta_pairings rows`)

    const events = await client.execute({
      sql: 'DELETE FROM meta_events WHERE source = ? AND source_id = ?',
      args: ['bcp', sourceId],
    })
    console.log(`  deleted ${events.rowsAffected} meta_events rows`)
  }

  console.log('\nAliases now in dim_faction_alias for chapter names:')
  const aliases = await client.execute(
    "SELECT alias, faction_id FROM dim_faction_alias WHERE alias IN ('Space Wolves','Dark Angels','Black Templars','Blood Angels','Deathwatch','Imperial Fists','Iron Hands','Raven Guard','Salamanders','Ultramarines','White Scars') ORDER BY alias",
  )
  for (const row of aliases.rows) console.log(`  ${row.alias} -> ${row.faction_id}`)

  console.log('\nDone. Re-run scrape-jun-jul.ts to pick these back up.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

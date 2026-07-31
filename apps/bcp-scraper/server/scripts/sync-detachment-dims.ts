/**
 * Sync the 11e detachment registry + Detachment Points from the brain cube
 * export into dim_detachment (the canonical registry, root CLAUDE.md rule 1).
 *
 *   set -a && source .env && set +a
 *   NODE_OPTIONS=--dns-result-order=ipv4first \
 *     npx --prefix apps/bcp-scraper/server tsx \
 *       apps/bcp-scraper/server/scripts/sync-detachment-dims.ts [--dry-run]
 *
 * Reads apps/brain/server/.local/brain/cube/fact_node.jsonl by default; override
 * with --brain-dir. The pure planning/reconciliation logic lives in
 * @tabletop-tools/server-core (meta-detachment-sync) so it is unit-testable and
 * Worker-safe; only the file read happens here.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createDb } from '@tabletop-tools/db'
import {
  applyDetachmentSync,
  type DimDetachmentRow,
  parseBrainDetachments,
  planDetachmentSync,
} from '@tabletop-tools/server-core'
import { sql } from 'drizzle-orm'

/** apps/bcp-scraper/server/scripts -> repo root. Resolved from this file, not
 *  cwd, so the script works from anywhere. */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')

function loadEnv(): void {
  const p = join(REPO_ROOT, '.env')
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

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag)
  return i === -1 || i + 1 >= process.argv.length ? null : (process.argv[i + 1] ?? null)
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run')
  const brainDir =
    argValue('--brain-dir') ?? join(REPO_ROOT, 'apps', 'brain', 'server', '.local', 'brain')
  const factPath = join(brainDir, 'cube', 'fact_node.jsonl')

  if (!existsSync(factPath)) {
    console.error(`brain cube export not found: ${factPath}`)
    console.error('Run a brain build first, or pass --brain-dir.')
    process.exit(1)
  }

  const url = process.env.TURSO_DB_URL
  if (!url) {
    console.error('TURSO_DB_URL missing')
    process.exit(1)
  }
  const db = createDb({ url, authToken: process.env.TURSO_AUTH_TOKEN })

  const brain = parseBrainDetachments(readFileSync(factPath, 'utf-8').split(/\r?\n/))
  console.log(`brain 11e detachments (dp 1-3): ${brain.length}`)

  const dims = (await db.all(
    sql`SELECT id, name, faction_id AS factionId, dp FROM dim_detachment`,
  )) as unknown as DimDetachmentRow[]
  console.log(`dim_detachment rows: ${dims.length}`)

  const factionRows = (await db.all(sql`SELECT id FROM dim_faction`)) as unknown as Array<{
    id: string
  }>
  const knownFactions = new Set(factionRows.map((f) => f.id))
  console.log(`dim_faction rows: ${knownFactions.size}`)

  const plan = planDetachmentSync(brain, dims, knownFactions)

  console.log(`\n=== PLAN${dryRun ? ' (DRY RUN)' : ''}`)
  console.log(`  dp updates : ${plan.dpUpdates.length}`)
  console.log(`  inserts    : ${plan.inserts.length}`)
  console.log(`  blocked    : ${plan.blockedByFaction.length}  (faction missing from dim_faction)`)
  console.log(`  dim-only   : ${plan.dimOnly.length}  (no brain counterpart — left alone)`)

  if (plan.inserts.length) {
    console.log('\n  inserts:')
    for (const i of plan.inserts.slice(0, 30)) {
      console.log(`    + ${i.id}  dp=${i.dp}  ${i.name}`)
    }
    if (plan.inserts.length > 30) console.log(`    ... ${plan.inserts.length - 30} more`)
  }
  if (plan.blockedByFaction.length) {
    console.log('\n  BLOCKED (add these factions to dim_faction first):')
    const factions = [...new Set(plan.blockedByFaction.map((b) => b.factionId))]
    for (const f of factions) console.log(`    ! ${f}`)
  }

  if (dryRun) {
    console.log('\nDry run — nothing written.')
    return
  }

  const res = await applyDetachmentSync(db, plan)
  console.log(`\n=== APPLIED`)
  console.log(`  dp updated: ${res.dpUpdated}`)
  console.log(`  inserted  : ${res.inserted}`)

  const after = (await db.all(
    sql`SELECT COUNT(*) AS total, SUM(CASE WHEN dp IS NOT NULL THEN 1 ELSE 0 END) AS with_dp
        FROM dim_detachment`,
  )) as unknown as Array<{ total: number; with_dp: number }>
  console.log(
    `\nVerification: dim_detachment total=${after[0]?.total} with_dp=${after[0]?.with_dp}`,
  )
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})

/**
 * Populate dim_detachment_combo with every legal 11e detachment combination.
 *
 * A combo is legal when its members' Detachment Points sum to no more than the
 * budget (2 at Incursion, 3 at Strike Force — the competitive default). Rows are
 * written whether or not anyone has played them, which is what makes "which
 * legal pairing is nobody playing" an answerable question instead of a guess
 * from observed data alone.
 *
 * Prerequisite: dim_detachment.dp must be populated — run
 * scripts/sync-detachment-dims.ts first. Detachments without dp are skipped and
 * reported rather than assumed legal.
 *
 * Idempotent: re-running updates member counts and never downgrades a legal
 * combo to illegal.
 *
 *   set -a && source .env && set +a
 *   NODE_OPTIONS=--dns-result-order=ipv4first \
 *     npx --prefix apps/bcp-scraper/server tsx \
 *       apps/bcp-scraper/server/scripts/enumerate-detachment-combos.ts [--budget 3] [--dry-run]
 *
 * Required env vars: TURSO_DB_URL, TURSO_AUTH_TOKEN
 */
import { createDb } from '@tabletop-tools/db'
import {
  DP_BUDGET,
  enumerateLegalCombos,
  loadDetachmentsWithDp,
  upsertCombos,
} from '@tabletop-tools/server-core'

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag)
  return i === -1 || i + 1 >= process.argv.length ? null : (process.argv[i + 1] ?? null)
}

async function main(): Promise<void> {
  const startTime = Date.now()
  const dbUrl = process.env.TURSO_DB_URL
  if (!dbUrl) {
    console.error('TURSO_DB_URL required')
    process.exit(1)
  }

  const dryRun = process.argv.includes('--dry-run')
  const budgetArg = argValue('--budget')
  const budget = budgetArg ? Number(budgetArg) : DP_BUDGET.strikeForce
  if (!Number.isInteger(budget) || budget < 1) {
    console.error(`--budget must be a positive integer (got ${budgetArg})`)
    process.exit(1)
  }

  const db = createDb({ url: dbUrl, authToken: process.env.TURSO_AUTH_TOKEN })

  const detachments = await loadDetachmentsWithDp(db)
  const withDp = detachments.filter((d) => d.dp !== null)
  const withoutDp = detachments.filter((d) => d.dp === null)

  console.log(`dim_detachment: ${detachments.length} rows`)
  console.log(`  with dp   : ${withDp.length}`)
  console.log(`  without dp: ${withoutDp.length}  (skipped — cannot judge legality)`)
  console.log(`DP budget   : ${budget}`)

  const combos = enumerateLegalCombos(detachments, budget)

  const byCount = new Map<number, number>()
  for (const c of combos) byCount.set(c.memberCount, (byCount.get(c.memberCount) ?? 0) + 1)

  console.log(`\nenumerated combos: ${combos.length}`)
  for (const [count, n] of [...byCount.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  ${count} detachment${count === 1 ? ' ' : 's'}: ${n}`)
  }

  const factions = new Set(combos.map((c) => c.factionId))
  console.log(`  across ${factions.size} factions`)

  console.log('\nexamples:')
  for (const c of combos.filter((c) => c.memberCount > 1).slice(0, 8)) {
    console.log(`  ${c.id}  (${c.totalDp} DP)`)
  }

  if (dryRun) {
    console.log('\nDry run — nothing written.')
    return
  }

  const res = await upsertCombos(db, combos, true)
  console.log(`\nwrote ${res.combos} combos, ${res.members} membership rows`)
  console.log(`Duration: ${((Date.now() - startTime) / 1000).toFixed(1)}s`)
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})

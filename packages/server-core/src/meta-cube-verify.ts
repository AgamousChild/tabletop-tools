import type { Db } from '@tabletop-tools/db'
import { sql } from 'drizzle-orm'

/**
 * Post-build integrity checks for the meta cube.
 *
 * A cube build can report success and still leave wrong data behind, and the
 * failure is silent: nothing errors, the dashboard just shows numbers that are
 * off. The 2026-08-01 full rebuild is the case in point — 401 of 403 events
 * rebuilt correctly while two ended up holding stale rows from before
 * `pairing_id` existed, one of them with 36 rows where the build log said it
 * had written 136. Every rollup for those events was then aggregated from the
 * stale rows.
 *
 * Nothing about that was visible without running these queries, so they run
 * automatically now rather than living in someone's scratch script.
 */
export interface CubeCheck {
  name: string
  ok: boolean
  detail: string
}

export interface CubeVerification {
  ok: boolean
  checks: CubeCheck[]
}

async function count(db: Db, query: ReturnType<typeof sql>): Promise<number> {
  const rows = (await db.all(query)) as unknown as Array<Record<string, unknown>>
  return Number(Object.values(rows[0] ?? { n: 0 })[0] ?? 0)
}

export async function verifyCube(db: Db): Promise<CubeVerification> {
  const checks: CubeCheck[] = []

  const total = await count(db, sql`SELECT COUNT(*) AS n FROM fact_game_results`)

  // The grain is one row per player per game. Duplicates here are what a
  // non-transactional delete-then-reinsert produced on 2026-07-30: 23,995 extra
  // rows, every affected win rate counting those games twice.
  //
  // Group by the full game key, NOT (event, player, round): 27 players
  // legitimately have two pairings in one round against different opponents.
  const distinctGames = await count(
    db,
    sql`SELECT COUNT(*) AS n FROM (
          SELECT DISTINCT event_id, player_id, round, opponent_id FROM fact_game_results)`,
  )
  checks.push({
    name: 'no duplicate games',
    ok: total === distinctGames,
    detail: `${total} rows, ${distinctGames} distinct games`,
  })

  // uq_fact_game_results_pairing_player is what makes a duplicate unstorable,
  // and it is the reason retrying a write batch is safe. But SQLite treats
  // NULLs as distinct, so a NULL pairing_id slips straight past it — which is
  // exactly how the stale rows hid. A NULL here means the row was not written
  // by the current builder.
  const nullPairing = await count(
    db,
    sql`SELECT COUNT(*) AS n FROM fact_game_results WHERE pairing_id IS NULL`,
  )
  checks.push({
    name: 'every fact row has a pairing',
    ok: nullPairing === 0,
    detail: `${nullPairing} rows with NULL pairing_id`,
  })

  // Two rows per pairing, one per player. A mismatch means an event's writes
  // landed partially — the shape of a build that was interrupted mid-event.
  const pairingMismatch = await count(
    db,
    sql`SELECT COUNT(*) AS n FROM (
          SELECT e.id FROM meta_events e
          WHERE (SELECT COUNT(*) FROM fact_game_results f WHERE f.event_id = e.id)
             <> (SELECT COUNT(*) FROM meta_pairings p WHERE p.event_id = e.id) * 2)`,
  )
  checks.push({
    name: 'fact rows are twice the pairings, per event',
    ok: pairingMismatch === 0,
    detail: `${pairingMismatch} events with a fact/pairing mismatch`,
  })

  // A rollup pointing at a frame that no longer exists renders as a blank row
  // rather than an error.
  const orphanFrames = await count(
    db,
    sql`SELECT COUNT(*) AS n FROM meta_top t
        WHERE NOT EXISTS (SELECT 1 FROM meta_for f WHERE f.id = t.meta_for_id)`,
  )
  checks.push({
    name: 'no rollups point at missing frames',
    ok: orphanFrames === 0,
    detail: `${orphanFrames} orphan meta_top rows`,
  })

  const orphanCombos = await count(
    db,
    sql`SELECT COUNT(*) AS n FROM fact_game_results f
        WHERE f.combo_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM dim_detachment_combo d WHERE d.id = f.combo_id)`,
  )
  checks.push({
    name: 'no facts point at missing combos',
    ok: orphanCombos === 0,
    detail: `${orphanCombos} facts with an unresolvable combo`,
  })

  return { ok: checks.every((c) => c.ok), checks }
}

/** Render a verification as lines for a build log. */
export function formatVerification(v: CubeVerification): string {
  const lines = v.checks.map((c) => `  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name} — ${c.detail}`)
  return [`cube verification: ${v.ok ? 'PASS' : 'FAIL'}`, ...lines].join('\n')
}

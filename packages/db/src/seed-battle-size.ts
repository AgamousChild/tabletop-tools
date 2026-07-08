/**
 * Canonical battle-size (points bracket) taxonomy + seed function.
 *
 * Structural tournament-format data, not GW datasheet content — same class
 * as dim_dataslate/dim_tournament_pack/dim_edition (seeded by
 * apps/content-ingestor/src/meta/seed-dimensions.ts) and scoring_mission/
 * game_state (packages/db/src/schema.ts). Defined here as a small importable
 * module per Rule 4 (every data process is a callable function) rather than
 * a loose script, then re-used by seed-dimensions.ts / any CLI entrypoint.
 *
 * Grounding for the canonical mapping (2026-07-07): repo's own 11e research
 * note docs/superpowers/specs/2026-05-26-11th-edition-game-flow.md §1.1
 * ("Incursion (~1,000 pts), Strike Force (2,000 pts)") plus this package's
 * `list.battle_size` enum (list-schema.ts), which already encodes 4 distinct
 * names (Combat Patrol / Incursion / Strike Force / Onslaught). Matches
 * bcp-scraper's bs-parser.ts / gw-parser.ts convention. list-builder's
 * armyRules.ts BATTLE_SIZES (Incursion=500/Strike Force=1000/Strike
 * Force=2000/Onslaught=3000) is the outlier and is NOT carried forward here
 * — see wargame/w2/decisions/D2-04-data-in-code-cleanup.md items 4-7 and the
 * PR description for the flag to Micah. Phase 3 (not this change) points the
 * consumer call sites at this table.
 */
import { eq } from 'drizzle-orm'

import type { Db } from './client'
import { battleSize, battleSizeAlias } from './schema'

export interface BattleSizeSeedRow {
  id: string
  name: string
  points: number
  maxDuplicates: number
  description: string
  sortOrder: number
}

export const BATTLE_SIZES: BattleSizeSeedRow[] = [
  {
    id: 'combat-patrol',
    name: 'Combat Patrol',
    points: 500,
    maxDuplicates: 1,
    description: 'Small-scale skirmish',
    sortOrder: 0,
  },
  {
    id: 'incursion',
    name: 'Incursion',
    points: 1000,
    maxDuplicates: 2,
    description: 'Standard matched play',
    sortOrder: 1,
  },
  {
    id: 'strike-force',
    name: 'Strike Force',
    points: 2000,
    maxDuplicates: 3,
    description: 'Tournament standard',
    sortOrder: 2,
  },
  {
    id: 'onslaught',
    name: 'Onslaught',
    points: 3000,
    maxDuplicates: 3,
    description: 'Large-scale battle',
    sortOrder: 3,
  },
]

/**
 * Seed the battle_size table (idempotent — INSERT OR IGNORE semantics via
 * onConflictDoNothing). Callable from a CLI script, a one-off admin action,
 * or another seed pipeline (e.g. content-ingestor's seed-dimensions.ts).
 */
export async function seedBattleSizes(db: Db): Promise<void> {
  for (const row of BATTLE_SIZES) {
    await db.insert(battleSize).values(row).onConflictDoNothing()
  }
}

/** Get all battle sizes, ordered for UI display. */
export async function getAllBattleSizes(db: Db): Promise<BattleSizeSeedRow[]> {
  const rows = await db.select().from(battleSize)
  return rows
    .map((r) => ({ ...r, description: r.description ?? '' }))
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

/** Resolve a battle-size reference (canonical id, canonical name, or alias) to its row. */
export async function resolveBattleSize(db: Db, input: string): Promise<BattleSizeSeedRow | null> {
  const [byId] = await db.select().from(battleSize).where(eq(battleSize.id, input)).limit(1)
  if (byId) return { ...byId, description: byId.description ?? '' }

  const [byName] = await db.select().from(battleSize).where(eq(battleSize.name, input)).limit(1)
  if (byName) return { ...byName, description: byName.description ?? '' }

  const [alias] = await db
    .select({ battleSizeId: battleSizeAlias.battleSizeId })
    .from(battleSizeAlias)
    .where(eq(battleSizeAlias.alias, input))
    .limit(1)
  if (alias) {
    const [row] = await db
      .select()
      .from(battleSize)
      .where(eq(battleSize.id, alias.battleSizeId))
      .limit(1)
    if (row) return { ...row, description: row.description ?? '' }
  }

  return null
}

/** Resolve a points total to the battle size whose points cap is the smallest value >= totalPoints. */
export async function battleSizeForPoints(
  db: Db,
  totalPoints: number,
): Promise<BattleSizeSeedRow | null> {
  const rows = await getAllBattleSizes(db)
  const sorted = [...rows].sort((a, b) => a.points - b.points)
  return sorted.find((r) => totalPoints <= r.points) ?? sorted[sorted.length - 1] ?? null
}

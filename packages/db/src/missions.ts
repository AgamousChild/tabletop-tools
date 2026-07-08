/**
 * Scoring mission catalog — single source of truth for the tournament mission
 * pool. Replaces the hardcoded `MISSIONS` array that used to live in
 * apps/tournament/server/src/routers/round.ts (Rule 6 / D2-04 item #2 —
 * see wargame/w2/decisions/D2-04-data-in-code-cleanup.md).
 *
 * `scoring_mission` rows are a 1:1 game-tracker projection of a
 * `content_entity` row (type='mission') — see packages/db/src/schema.ts:1389.
 * Seeding a mission therefore requires the matching content_entity parent
 * row to exist first (FK, onDelete: cascade).
 */
import { eq } from 'drizzle-orm'

import type { Db } from './client'
import { contentEntity, scoringMission } from './schema'

export interface SeedMission {
  id: string
  name: string
  kind: 'primary' | 'secondary'
}

/**
 * The 11th-edition primary mission pool (Chapter Approved 2025 rotation).
 * Content fact, not a heuristic — lives here as the single seed source,
 * not hand-restated in apps/tournament.
 */
export const MISSIONS: readonly SeedMission[] = [
  { id: 'mission-sweeping-engagement', name: 'Sweeping Engagement', kind: 'primary' },
  { id: 'mission-priority-targets', name: 'Priority Targets', kind: 'primary' },
  { id: 'mission-scorched-earth', name: 'Scorched Earth', kind: 'primary' },
  { id: 'mission-search-and-destroy', name: 'Search and Destroy', kind: 'primary' },
  { id: 'mission-take-and-hold', name: 'Take and Hold', kind: 'primary' },
  { id: 'mission-vital-ground', name: 'Vital Ground', kind: 'primary' },
]

/**
 * Seed (or re-seed) the scoring_mission catalog from MISSIONS.
 *
 * Idempotent: safe to call repeatedly (e.g. on deploy or from a one-off
 * script) — upserts both the content_entity parent row and the
 * scoring_mission projection by id.
 */
export async function seedScoringMissions(
  db: Db,
  missions: readonly SeedMission[] = MISSIONS,
): Promise<void> {
  for (const mission of missions) {
    await db
      .insert(contentEntity)
      .values({
        id: mission.id,
        type: 'mission',
        name: mission.name,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: contentEntity.id,
        set: { name: mission.name, updatedAt: new Date() },
      })

    await db
      .insert(scoringMission)
      .values({
        id: mission.id,
        name: mission.name,
        kind: mission.kind,
        side: 'symmetric',
        uiPattern: 'count',
      })
      .onConflictDoUpdate({
        target: scoringMission.id,
        set: { name: mission.name, kind: mission.kind },
      })
  }
}

/**
 * Pick a random mission from the scoring_mission catalog.
 *
 * Fails loudly (D2-06 — no silent undefined) if the catalog is empty:
 * a tournament round can't generate pairings without a mission to assign,
 * and returning `undefined` would silently corrupt every pairing's
 * `mission` column instead of surfacing the missing seed step.
 */
export async function getRandomMission(db: Db): Promise<string> {
  const rows = await db.select({ name: scoringMission.name }).from(scoringMission).all()
  if (rows.length === 0) {
    throw new Error(
      'scoring_mission table is empty — run seedScoringMissions() before generating pairings',
    )
  }
  const row = rows[Math.floor(Math.random() * rows.length)]
  if (!row) {
    throw new Error('scoring_mission query returned no row despite non-empty result set')
  }
  return row.name
}

// Re-exported for callers that need to check a specific mission's presence
// without duplicating the eq() import.
export async function missionExists(db: Db, id: string): Promise<boolean> {
  const row = await db
    .select({ id: scoringMission.id })
    .from(scoringMission)
    .where(eq(scoringMission.id, id))
    .get()
  return row !== undefined
}

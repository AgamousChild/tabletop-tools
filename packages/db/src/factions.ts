/**
 * Shared faction lookup — single source of truth for faction/subfaction resolution.
 *
 * All apps use these functions instead of hardcoded maps.
 * Data lives in dim_faction, dim_subfaction, and dim_faction_alias tables.
 */
import { eq } from 'drizzle-orm'

import type { Db } from './client'
import { dimFaction, dimFactionAlias, dimSubfaction } from './schema'

export interface Faction {
  id: string
  name: string
  allegiance: string
}

export interface Subfaction {
  id: string
  name: string
  factionId: string
}

/**
 * Resolve any faction reference (slug, BCP name, Wahapedia code, chapter name) to a canonical slug.
 * Returns null if not found.
 */
export async function resolveFaction(db: Db, input: string): Promise<string | null> {
  // Direct slug match
  const [direct] = await db
    .select({ id: dimFaction.id })
    .from(dimFaction)
    .where(eq(dimFaction.id, input))
    .limit(1)
  if (direct) return direct.id

  // Alias match (case-sensitive — aliases are stored as-is)
  const [alias] = await db
    .select({ factionId: dimFactionAlias.factionId })
    .from(dimFactionAlias)
    .where(eq(dimFactionAlias.alias, input))
    .limit(1)
  if (alias) return alias.factionId

  return null
}

/**
 * Get all factions.
 */
export async function getAllFactions(db: Db): Promise<Faction[]> {
  return db.select().from(dimFaction)
}

/**
 * Get all subfactions, optionally filtered by parent faction.
 */
export async function getSubfactions(db: Db, factionId?: string): Promise<Subfaction[]> {
  if (factionId) {
    return db.select().from(dimSubfaction).where(eq(dimSubfaction.factionId, factionId))
  }
  return db.select().from(dimSubfaction)
}

/**
 * Get all aliases as a Map<alias, factionSlug>.
 * Useful for batch processing (BCP scraper, brain builder).
 */
export async function getFactionAliasMap(db: Db): Promise<Map<string, string>> {
  const rows = await db.select().from(dimFactionAlias)
  return new Map(rows.map((r) => [r.alias, r.factionId]))
}

/**
 * Get faction display name from slug.
 */
export async function getFactionName(db: Db, slug: string): Promise<string | null> {
  const [row] = await db
    .select({ name: dimFaction.name })
    .from(dimFaction)
    .where(eq(dimFaction.id, slug))
    .limit(1)
  return row?.name ?? null
}

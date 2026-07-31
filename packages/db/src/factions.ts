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
 * Load the whole faction lookup once and resolve from memory.
 *
 * resolveFaction() costs one or two SELECTs per call, which is fine for a
 * one-off but not inside a loop: a 129-event BCP refresh resolves a faction per
 * player, and that alone was thousands of round trips (~4 hours, with the
 * per-row inserts). Callers resolving more than a handful should preload.
 *
 * Same precedence as resolveFaction — direct slug first, then alias — so the
 * two cannot disagree.
 */
export async function createFactionResolver(db: Db): Promise<(input: string) => string | null> {
  const [factions, aliases] = await Promise.all([
    db.select({ id: dimFaction.id }).from(dimFaction),
    db
      .select({ alias: dimFactionAlias.alias, factionId: dimFactionAlias.factionId })
      .from(dimFactionAlias),
  ])

  const slugs = new Set(factions.map((f) => f.id))
  // Aliases are case-sensitive and stored as-is, matching resolveFaction.
  const byAlias = new Map(aliases.map((a) => [a.alias, a.factionId]))

  return (input: string) => (slugs.has(input) ? input : (byAlias.get(input) ?? null))
}

/**
 * Resolve any faction reference (slug, BCP name, Wahapedia code, chapter name) to a canonical slug.
 * Returns null if not found.
 *
 * Resolving many in a row? Use createFactionResolver() — this hits the DB on
 * every call.
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

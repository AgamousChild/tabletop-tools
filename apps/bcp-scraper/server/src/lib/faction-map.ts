/**
 * Faction name resolution — backed by dim_faction_alias table.
 *
 * Call loadFactionMap(db) once at the start of a scrape/parse operation,
 * then use normalizeFaction() synchronously throughout.
 */
import type { Db } from '@tabletop-tools/db'
import { getFactionAliasMap, getSubfactions } from '@tabletop-tools/db'

let cachedAliasMap: Map<string, string> | null = null
let cachedSubfactionParent: Map<string, string> | null = null

/**
 * Load faction alias map and subfaction parents from DB.
 * Must be called before normalizeFaction() or getSubfactionParent().
 */
export async function loadFactionMap(db: Db): Promise<void> {
  cachedAliasMap = await getFactionAliasMap(db)
  const subfactions = await getSubfactions(db)
  cachedSubfactionParent = new Map(subfactions.map((s) => [s.id, s.factionId]))
}

/**
 * Resolve a BCP faction name to a canonical slug.
 * Requires loadFactionMap() to have been called first.
 */
export function normalizeFaction(bcpFaction: string): string {
  if (!cachedAliasMap) {
    throw new Error('Faction map not loaded — call loadFactionMap(db) first')
  }
  return cachedAliasMap.get(bcpFaction) ?? ''
}

/**
 * Get the parent faction for a subfaction slug.
 * Requires loadFactionMap() to have been called first.
 */
export function getSubfactionParent(slug: string): string | undefined {
  if (!cachedSubfactionParent) {
    throw new Error('Faction map not loaded — call loadFactionMap(db) first')
  }
  return cachedSubfactionParent.get(slug)
}

/**
 * Reset cached maps (for testing).
 */
export function resetFactionMapCache(): void {
  cachedAliasMap = null
  cachedSubfactionParent = null
}

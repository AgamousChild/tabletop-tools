/**
 * Faction code resolution — backed by dim_faction / dim_faction_alias tables.
 *
 * Call loadFactionCodes(db) once at the start of a build-graph run,
 * then use normalizeFactionId() synchronously throughout.
 */
import type { Db } from '@tabletop-tools/db'
import { getAllFactions, getFactionAliasMap } from '@tabletop-tools/db'

import { slugify } from './slugify'

/** alias/code → canonical slug (e.g. 'SM' → 'space-marines', 'Adepta Sororitas' → 'adepta-sororitas') */
let cachedCodeToSlug: Map<string, string> | null = null

/** canonical slug set for fast "is this already a slug?" checks */
let cachedSlugs: Set<string> | null = null

/**
 * Load faction alias map from DB. Must be called before normalizeFactionId().
 */
export async function loadFactionCodes(db: Db): Promise<void> {
  cachedCodeToSlug = await getFactionAliasMap(db)
  const factions = await getAllFactions(db)
  cachedSlugs = new Set(factions.map((f) => f.id))
  // Also add slugs as identity mappings so alias lookups work for slugs too
  for (const slug of cachedSlugs) {
    cachedCodeToSlug.set(slug, slug)
  }
}

/**
 * Normalize a faction ID from Wahapedia short code to canonical kebab-case slug.
 * Requires loadFactionCodes() to have been called first.
 */
export function normalizeFactionId(code: string): string {
  if (!cachedCodeToSlug || !cachedSlugs) {
    throw new Error('Faction codes not loaded — call loadFactionCodes(db) first')
  }
  // Direct slug match
  if (cachedSlugs.has(code)) return code
  // Alias/code lookup
  const slug = cachedCodeToSlug.get(code)
  if (slug) return slug
  // Fallback: slugify unknown codes
  return slugify(code)
}

/**
 * Reset cached maps (for testing).
 */
export function resetFactionCodes(): void {
  cachedCodeToSlug = null
  cachedSlugs = null
}

/**
 * Prime the cache directly without going through a DB. Test-only — lets
 * parser tests that don't spin up an in-memory libsql use `normalizeFactionId`
 * without throwing.
 */
export function _setFactionCodesForTesting(
  codeToSlug: Map<string, string>,
  slugs: Set<string>,
): void {
  cachedCodeToSlug = codeToSlug
  cachedSlugs = slugs
}

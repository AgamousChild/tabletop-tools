/**
 * Faction code resolution — backed by dim_faction / dim_faction_alias tables.
 *
 * Call loadFactionCodes(db) once at the start of a build-graph run,
 * then use normalizeFactionId() synchronously throughout.
 */
import type { Db } from '@tabletop-tools/db'
import { getAllFactions, getFactionAliasMap } from '@tabletop-tools/db'

import { slugify } from './slugify'

/**
 * Code-side faction slug rewrites — applied AFTER the DB alias lookup and
 * BEFORE the "slug-in-cached-set?" check inside `normalizeFactionId`.
 *
 * Rationale: this table lives in code so that faction restructures can land
 * in the same commit as the code that consumes them, without waiting for a
 * Turso dim_faction/dim_faction_alias seed to be re-run. When Micah runs the
 * seed after code review, these rewrites become redundant with the DB
 * aliases and the same result flows through either path.
 *
 * Two shapes of rewrite:
 *   1. Legacy slug → new canonical (e.g. `adeptus-titanicus` → `titan-legions`
 *      per Micah's 2026-07-05 directive that AT IS Titan Legions).
 *   2. Wahapedia display-name-slug → new canonical (e.g. Wahapedia labels
 *      TL datasheets `factionId: "Adeptus Titanicus"` which slugifies to
 *      `adeptus-titanicus`; same target as #1).
 *
 * Add entries here for merges/renames that need to take effect before the
 * DB seed is refreshed. Remove them once dim_faction/dim_faction_alias
 * carries the same mapping.
 */
const LEGACY_FACTION_REWRITES: ReadonlyMap<string, string> = new Map([
  ['adeptus-titanicus', 'titan-legions'],
  // Apostrophe-drop fallbacks — the DB alias table carries these entries
  // per apps/brain/server/src/lib/faction-codes.test.ts, but pinning them
  // here means a fresh Turso snapshot without the aliases still resolves
  // correctly.
  ['emperor-s-children', 'emperors-children'],
  ['t-au-empire', 'tau-empire'],
])

/**
 * Factions that should be dropped entirely from the graph — nodes with any
 * of these factionIds are filtered out at build time. Kept in code (not the
 * DB) so the runtime never emits them even when a stale dim_faction row
 * survives the seed refresh.
 */
export const DROPPED_FACTION_IDS: ReadonlySet<string> = new Set([
  'unaligned-forces',
  'unaligned',
  'unbound-adversaries',
])

/**
 * Extra canonical slugs that are guaranteed to exist post-seed but may not
 * appear in the local `dim_faction` snapshot yet. Added to the canonical
 * set returned by `getCanonicalFactionIds()` so the merge factionId-gate
 * doesn't fail while the DB catches up.
 *
 * The First Founding SM chapters (imperial-fists, iron-hands, raven-guard,
 * salamanders, ultramarines, white-scars) are added here per Micah's
 * 2026-07-05 directive matching GW's official 40K app. `seed-dimensions.ts`
 * carries the same set — this pin lets chapter-specific characters route to
 * `factionId=<chapter-slug>` from a build that hasn't re-run the Turso seed.
 * Remove once dim_faction/dim_subfaction ships the six new rows in prod.
 */
const CANONICAL_ADDITIONS: ReadonlySet<string> = new Set([
  'titan-legions',
  'imperial-fists',
  'iron-hands',
  'raven-guard',
  'salamanders',
  'ultramarines',
  'white-scars',
])

/** alias/code → canonical slug (e.g. 'SM' → 'space-marines', 'Adepta Sororitas' → 'adepta-sororitas') */
let cachedCodeToSlug: Map<string, string> | null = null

/** lowercase(alias) → canonical slug for case-insensitive fallback */
let cachedLowerCodeToSlug: Map<string, string> | null = null

/** canonical slug set for fast "is this already a slug?" checks */
let cachedSlugs: Set<string> | null = null

/**
 * Load faction alias map from DB. Must be called before normalizeFactionId().
 *
 * Both the canonical map and the lowercase index are built once and read
 * thousands of times per build — keep them O(1) at lookup time.
 */
export async function loadFactionCodes(db: Db): Promise<void> {
  cachedCodeToSlug = await getFactionAliasMap(db)
  const factions = await getAllFactions(db)
  cachedSlugs = new Set(factions.map((f) => f.id))
  // Fold in code-side canonical additions (see CANONICAL_ADDITIONS above)
  // and drop retired canonical slugs so the merge factionId gate agrees
  // with LEGACY_FACTION_REWRITES on the target set.
  for (const slug of CANONICAL_ADDITIONS) cachedSlugs.add(slug)
  for (const legacy of LEGACY_FACTION_REWRITES.keys()) cachedSlugs.delete(legacy)
  for (const dropped of DROPPED_FACTION_IDS) cachedSlugs.delete(dropped)
  // Also add slugs as identity mappings so alias lookups work for slugs too
  for (const slug of cachedSlugs) {
    cachedCodeToSlug.set(slug, slug)
  }
  // Fold LEGACY_FACTION_REWRITES into the alias map so a legacy slug that
  // reaches `normalizeFactionId` before the identity check runs still lands
  // on the new canonical.
  for (const [legacy, target] of LEGACY_FACTION_REWRITES) {
    cachedCodeToSlug.set(legacy, target)
  }
  // Lowercase index so Wahapedia's mixed-case short codes (`AoI`, `Dru`, `GC`)
  // resolve against the same alias rows as their lowercase variants. dim_faction_alias
  // owns the canonical mapping; this index just makes the lookup case-tolerant.
  cachedLowerCodeToSlug = new Map()
  for (const [code, slug] of cachedCodeToSlug) {
    cachedLowerCodeToSlug.set(code.toLowerCase(), slug)
  }
}

/**
 * Normalize a faction ID from Wahapedia short code to canonical kebab-case slug.
 * Requires loadFactionCodes() to have been called first.
 */
export function normalizeFactionId(code: string): string {
  if (!cachedCodeToSlug || !cachedSlugs || !cachedLowerCodeToSlug) {
    throw new Error('Faction codes not loaded — call loadFactionCodes(db) first')
  }
  // Compute the resolved slug through the DB alias table, then apply the
  // code-side legacy rewrite. Doing rewrite AFTER alias lookup means a
  // Wahapedia short code (`AT` → `adeptus-titanicus`) lands on the new
  // canonical (`titan-legions`) in one call, and a code that already reads
  // as the legacy slug (`adeptus-titanicus`) is also rewritten.
  let resolved: string
  if (cachedSlugs.has(code)) {
    resolved = code
  } else {
    const slug = cachedCodeToSlug.get(code) ?? cachedLowerCodeToSlug.get(code.toLowerCase())
    resolved = slug ?? slugify(code)
  }
  return LEGACY_FACTION_REWRITES.get(resolved) ?? resolved
}

/**
 * Read-only snapshot of the canonical factionId slugs loaded into the cache.
 *
 * Used by post-merge invariant gates (e.g. `mergeSources`) to detect shadow
 * factionIds — values that survived `normalizeFactionId()` but still aren't
 * in `dim_faction`. Throws if called before `loadFactionCodes()`.
 */
export function getCanonicalFactionIds(): ReadonlySet<string> {
  if (!cachedSlugs) {
    throw new Error('Faction codes not loaded — call loadFactionCodes(db) first')
  }
  return cachedSlugs
}

/**
 * Reset cached maps (for testing).
 */
export function resetFactionCodes(): void {
  cachedCodeToSlug = null
  cachedLowerCodeToSlug = null
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
  cachedCodeToSlug = new Map(codeToSlug)
  cachedSlugs = new Set(slugs)
  // Mirror the code-level legacy rewrites + canonical additions that
  // `loadFactionCodes` performs so tests use the same normalize semantics
  // as production.
  for (const slug of CANONICAL_ADDITIONS) cachedSlugs.add(slug)
  for (const legacy of LEGACY_FACTION_REWRITES.keys()) cachedSlugs.delete(legacy)
  for (const dropped of DROPPED_FACTION_IDS) cachedSlugs.delete(dropped)
  for (const [legacy, target] of LEGACY_FACTION_REWRITES) {
    cachedCodeToSlug.set(legacy, target)
  }
  cachedLowerCodeToSlug = new Map()
  for (const [k, v] of cachedCodeToSlug) cachedLowerCodeToSlug.set(k.toLowerCase(), v)
}

/**
 * Pull chapter-catalog membership from BSData rollups.
 *
 * The data-import worker publishes `bsdata-units.json` to R2 — each row is a
 * `UnitProfile` shape (`packages/game-content/src/types.ts`). Since PR #46
 * (`rollupChapterFaction()` in `apps/data-import/server/src/lib/sources/bsdata.ts`)
 * chapter-catalog units land with `faction: "Space Marines"` plus a
 * `subfaction: "ultramarines"` slug. BSData ships every SM chapter catalog with
 * the FULL shared unit list embedded (each catalog is a self-contained army-list
 * source), so most rows aren't actually chapter-locked — they just repeat.
 *
 * This parser rolls up the per-(unit-name) SET of chapter catalogs each unit
 * appears in. Downstream (see `game-data.ts`) that set is the discriminator:
 *
 *   - `size <= 2` → chapter-specific (real home). Assign the chapter as
 *     `factionId`.
 *   - `size >= 3` → shared across the SM pool. Keep `factionId=space-marines`,
 *     no chapter tag.
 *
 * Wahapedia's own `unit_keywords.isFactionKeyword` chapter tags are a stronger
 * signal (that's structured Wahapedia data, not a catalog-shape inference) —
 * the caller prefers Wahapedia when both fire.
 *
 * @see docs/superpowers/plans/2026-07-03-scalar-to-ref-refactor.md — PR B
 * @see apps/brain/server/src/lib/parsers/mfm-costing.ts — same on-disk shape
 */
import { existsSync, readFileSync } from 'fs'

import { normalizeFactionId } from '../faction-codes'

/** Shape of one row in `bsdata-units.json` — only the fields we read. */
export interface BsdataUnitRow {
  id: string
  name: string
  faction: string
  subfaction?: string
}

export interface BsdataSubfactionParseResult {
  /**
   * Lookup key → set of chapter catalog slugs the unit appears in.
   * Key shape: `${factionSlug}::${normalizedName}` where `factionSlug` is the
   * canonical brain slug (e.g. `space-marines`) and `normalizedName` is
   * `normalizeName()` (lowercased, special chars stripped, whitespace
   * collapsed).
   *
   * A unit that appears in a single chapter catalog is chapter-specific (that
   * catalog is its home). A unit that appears in many is shared across the
   * SM pool. See `chapterSpecificHome()` for the discriminator.
   */
  byKey: Map<string, Set<string>>
  /** Total rows seen in the input. */
  totalRows: number
  /** Rows that contributed a subfaction tag to the lookup. */
  taggedRows: number
}

/**
 * Read `bsdata-units.json` from disk. Mirrors `loadMfmCostingFromFile` —
 * missing file returns an empty result so the build still completes when
 * the BSData mirror hasn't been copied locally yet.
 */
export function loadBsdataSubfactionsFromFile(path: string): BsdataSubfactionParseResult {
  if (!existsSync(path)) {
    return { byKey: new Map(), totalRows: 0, taggedRows: 0 }
  }
  const text = readFileSync(path, 'utf-8')
  return parseBsdataSubfactions(text)
}

/**
 * Parse `bsdata-units.json` text into a `(factionSlug, normalizedName) →
 * Set<chapterSlug>` map. Only rows whose BSData row carries `subfaction` are
 * indexed — every other row is a no-op for this lookup.
 *
 * `normalizeFactionId` must be primed (`loadFactionCodes(db)`) before calling
 * this — same constraint as `convertGameData`.
 */
export function parseBsdataSubfactions(jsonText: string): BsdataSubfactionParseResult {
  const raw = JSON.parse(jsonText) as BsdataUnitRow[]
  if (!Array.isArray(raw)) {
    throw new Error('bsdata-units.json: expected a JSON array at root')
  }

  const byKey = new Map<string, Set<string>>()
  let taggedRows = 0

  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    if (!row.subfaction || !row.name || !row.faction) continue
    const factionSlug = normalizeFactionId(row.faction)
    const key = bsdataSubfactionKey(factionSlug, row.name)
    let set = byKey.get(key)
    if (!set) {
      set = new Set<string>()
      byKey.set(key, set)
    }
    set.add(row.subfaction)
    taggedRows++
  }

  return { byKey, totalRows: raw.length, taggedRows }
}

/**
 * Given a unit's catalog-membership set, return its chapter home when the unit
 * is chapter-specific, or `undefined` when it's shared across the SM pool.
 *
 * A unit appearing in one or two chapter catalogs is treated as chapter-specific
 * (the two-catalog case covers legitimate cross-catalog duplication — e.g. a
 * chapter-locked Legends variant filed under both the main chapter and a
 * shared "Legends" bucket). Three or more catalogs — including every SM
 * chapter catalog carrying the full shared list — means shared.
 */
export function chapterSpecificHome(catalogSet: Set<string> | undefined): string | undefined {
  if (!catalogSet || catalogSet.size === 0) return undefined
  if (catalogSet.size >= 3) return undefined
  // For size 1 or 2, return the (alphabetically first) chapter as the home.
  // Size-1 is unambiguous. Size-2 is rare enough that the first sorted entry
  // is deterministic and equivalent to any other choice for downstream indexing.
  return [...catalogSet].sort()[0]
}

/**
 * Build the lookup key for a `(factionSlug, unitName)` pair. Exported so the
 * brain's datasheet emission can build the same key from its inputs.
 *
 * Uses the same `normalizeName` rules as `apps/data-import/server/src/lib/id-mapping.ts`
 * (lowercased, smart quotes folded, non-word chars stripped, whitespace
 * collapsed). Re-implemented here to avoid the brain depending on the
 * data-import server package.
 */
export function bsdataSubfactionKey(factionSlug: string, unitName: string): string {
  return `${factionSlug}::${normalizeName(unitName)}`
}

/**
 * Mirror of `normalizeName` from `apps/data-import/server/src/lib/id-mapping.ts`.
 * Re-implemented here so the brain parser doesn't pull in the data-import
 * server package (which would create a brain → data-import dependency we don't
 * want). The two functions must stay in sync — if you change one, change both.
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[‘’′`]/g, "'")
    .replace(/[^\w\s'-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

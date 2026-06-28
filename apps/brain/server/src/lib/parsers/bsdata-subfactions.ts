/**
 * Pull subfaction tags from BSData chapter catalogs.
 *
 * The data-import worker publishes `bsdata-units.json` to R2 — each row is a
 * `UnitProfile` shape (`packages/game-content/src/types.ts`). Since PR #46
 * (`rollupChapterFaction()` in `apps/data-import/server/src/lib/sources/bsdata.ts`)
 * chapter-catalog units land with `faction: "Space Marines"` plus a
 * `subfaction: "ultramarines"` slug. Brain datasheets emitted by the Wahapedia
 * pipeline don't carry per-unit chapter keywords for most units — only
 * chapter-iconic models (e.g. Marneus Calgar = Ultramarines, Astorath = Blood
 * Angels) get the keyword. This parser fills the gap by joining BSData's
 * subfaction-tagged rows back onto brain datasheets via a normalized
 * `${factionSlug}::${normalizedName}` key.
 *
 * Brain `convertGameData` then prefers this BSData-derived subfaction over the
 * Wahapedia-keyword-derived one when both fire.
 *
 * @see docs/superpowers/plans/2026-06-27-data-problems-followup.md step 7
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
   * Lookup key → subfaction slug. Key shape: `${factionSlug}::${normalizedName}`
   * where `factionSlug` is the canonical brain slug (e.g. `space-marines`) and
   * `normalizedName` is `normalizeName()` from id-mapping (lowercased, special
   * chars stripped, whitespace collapsed).
   */
  byKey: Map<string, string>
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
 * subfactionSlug` map. Only rows whose BSData row carries `subfaction` are
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

  const byKey = new Map<string, string>()
  let taggedRows = 0

  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    if (!row.subfaction || !row.name || !row.faction) continue
    const factionSlug = normalizeFactionId(row.faction)
    const key = bsdataSubfactionKey(factionSlug, row.name)
    // First write wins. Chapter catalogs name the same unit in many forms only
    // when BSData has a true duplicate — and the right answer is the same
    // subfaction either way, so first-write is safe.
    if (!byKey.has(key)) {
      byKey.set(key, row.subfaction)
      taggedRows++
    }
  }

  return { byKey, totalRows: raw.length, taggedRows }
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

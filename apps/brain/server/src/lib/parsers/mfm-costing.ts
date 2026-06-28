/**
 * Parse MFM (Munitorum Field Manual) unit costing rows produced by
 * `apps/data-import` and joined to canonical BSData datasheet ids.
 *
 * MFM is the source of truth for 11e points. Each row carries the full tiered
 * pricing (e.g. `[1,2]` first-and-second copy, `[3,)` 3rd-and-beyond) plus the
 * minimum-tier costs that the brain currently uses for `points[]` rendering.
 *
 * This parser does NOT touch the network — sync to R2 happens in the
 * data-import worker, sync down to disk happens via the build script. We just
 * read the local JSON file and reshape it into a datasheetId-keyed map.
 *
 * @see apps/data-import/server/src/lib/sources/mfm.ts — upstream YAML parser
 * @see apps/brain/server/src/lib/merge-sources.ts — where this map is applied
 */
import { existsSync, readFileSync } from 'fs'

/** One row of `mfm-unit-costing.json` as emitted by the data-import worker. */
export interface MfmCostingRow {
  /** BSData datasheet GUID, or null when the upstream mapper could not match. */
  datasheetId: string | null
  factionSlug: string
  name: string
  costing: MfmCostingTier[]
  role?: 'leader' | 'support'
  attachTo?: string[]
  wargear?: unknown
  legends?: true
}

export interface MfmCostingTier {
  /** Range over unit copies, e.g. `[1,)` (always) or `[3,)` (3rd+). */
  range: string
  /** Verbatim heading from the source page. */
  label: string
  costs: MfmCostOption[]
}

export interface MfmCostOption {
  models: number
  points: number
  desc?: string
  addon?: true
}

/**
 * Pre-derived points info per datasheet, ready for emission into a Node.
 *
 * - `pointsArray` mirrors the existing brain `points: [{models, cost}]` shape
 *   and renders the same way card-layout already expects.
 * - `minCost` is the minimum-tier minimum cost — the "what does one of these
 *   cost" number used by downstream consumers (list-builder, versus).
 * - `tiers` retains the full structured costing for any consumer that wants
 *   tiered pricing.
 */
export interface MfmCostingForDatasheet {
  pointsArray: Array<{ models: string; cost: number }>
  minCost: number
  tiers: MfmCostingTier[]
}

export interface MfmCostingParseResult {
  /** Datasheet id → costing. Only rows with a non-null `datasheetId` land here. */
  byDatasheetId: Map<string, MfmCostingForDatasheet>
  totalRows: number
  mappedRows: number
}

/**
 * Read and parse `mfm-unit-costing.json` from a local path.
 *
 * Returns an empty result when the file does not exist — the brain build is
 * resilient to missing MFM data (it just falls back to Wahapedia points).
 */
export function loadMfmCostingFromFile(path: string): MfmCostingParseResult {
  if (!existsSync(path)) {
    return { byDatasheetId: new Map(), totalRows: 0, mappedRows: 0 }
  }
  const text = readFileSync(path, 'utf-8')
  return parseMfmCosting(text)
}

/**
 * Parse `mfm-unit-costing.json` text into a datasheetId-keyed map.
 *
 * Rows where `datasheetId === null` are counted but excluded from the map —
 * we have no canonical entity to attach the costing to.
 */
export function parseMfmCosting(jsonText: string): MfmCostingParseResult {
  const raw = JSON.parse(jsonText) as MfmCostingRow[]
  if (!Array.isArray(raw)) {
    throw new Error('mfm-unit-costing.json: expected a JSON array at root')
  }

  const byDatasheetId = new Map<string, MfmCostingForDatasheet>()
  let mappedRows = 0

  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    if (!row.datasheetId) continue
    if (!Array.isArray(row.costing) || row.costing.length === 0) continue

    const derived = deriveCostingForDatasheet(row.costing)
    if (!derived) continue

    // First row wins per datasheetId. The upstream mapper should produce one
    // row per datasheet, but if a duplicate slips through we keep the lower
    // minimum (i.e. the cheaper variant) to be safe.
    const existing = byDatasheetId.get(row.datasheetId)
    if (!existing || derived.minCost < existing.minCost) {
      byDatasheetId.set(row.datasheetId, derived)
    }
    mappedRows++
  }

  return { byDatasheetId, totalRows: raw.length, mappedRows }
}

/**
 * Convert MFM tier costing into the brain's existing `points: [{models, cost}]`
 * shape and surface the minimum-tier minimum cost.
 *
 * Strategy: pick the first tier whose range begins at copy 1 — that's the
 * always-on baseline cost — and convert each `{models, points}` option into
 * a `{models: "<n> models" | "<n> model", cost: number}` entry. Tiers with
 * higher start indices represent repeat-cost rules; we keep those in `tiers`
 * for downstream consumers but don't surface them in `pointsArray` (the
 * existing card layout cannot render tiered pricing yet).
 */
function deriveCostingForDatasheet(tiers: MfmCostingTier[]): MfmCostingForDatasheet | null {
  if (tiers.length === 0) return null

  // Find the always-on tier — range starts at 1, e.g. `[1,)` or `[1,2]`.
  const baselineTier = tiers.find((t) => isBaselineRange(t.range)) ?? tiers[0]
  if (!baselineTier || !Array.isArray(baselineTier.costs) || baselineTier.costs.length === 0) {
    return null
  }

  const pointsArray: Array<{ models: string; cost: number }> = []
  let minCost = Number.POSITIVE_INFINITY
  for (const opt of baselineTier.costs) {
    if (typeof opt.models !== 'number' || typeof opt.points !== 'number') continue
    // Skip add-on rows — they represent wargear surcharges, not full unit prices.
    if (opt.addon === true) continue
    const label = opt.models === 1 ? '1 model' : `${opt.models} models`
    pointsArray.push({ models: label, cost: opt.points })
    if (opt.points < minCost) minCost = opt.points
  }

  if (pointsArray.length === 0) return null
  return { pointsArray, minCost, tiers }
}

/**
 * `true` for ranges that start at copy 1 — the baseline price of the unit.
 * Examples: `[1,)`, `[1,2]`. Excludes ranges like `[3,)` (3rd+ copy).
 */
function isBaselineRange(range: string): boolean {
  // Range syntax is mathematical interval notation: `[start,end)` or `[start,)`.
  const m = range.match(/^\[(\d+),/)
  if (!m) return false
  return m[1] === '1'
}

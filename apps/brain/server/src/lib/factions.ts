/**
 * Runtime faction expansion — walks dim_subfaction relationships so a
 * chapter-scoped query (e.g. blood-angels) also includes its parent faction's
 * shared unit pool (space-marines).
 *
 * The Worker has no DB binding; build-graph.ts dumps the dim_subfaction table
 * to `dim/subfactions.json` in R2 (see build-graph.ts + sync.ts). This module
 * loads that snapshot once per isolate and returns Set<string> expansions
 * synchronously after the first call warms the cache.
 *
 * See docs/superpowers/plans/2026-07-03-scalar-to-ref-refactor.md (PR C).
 */

// Minimal R2 shape — keeps the module free of Cloudflare Workers types so
// tests can wire a plain fake bucket.
interface R2Bucket {
  get(key: string): Promise<{ json<T>(): Promise<T> } | null>
}

interface SubfactionRow {
  id: string
  name: string
  factionId: string
}

// Module-scope cache. dim_subfaction is ~5 rows today; caching the full list
// per isolate is cheap and means every expansion after the first is O(1).
let cachedSubfactions: SubfactionRow[] | null = null

/** Reset the cache. Used in tests to isolate runs. */
export function resetSubfactionCache(): void {
  cachedSubfactions = null
}

async function loadSubfactions(bucket: R2Bucket): Promise<SubfactionRow[]> {
  if (cachedSubfactions) return cachedSubfactions
  const obj = await bucket.get('dim/subfactions.json')
  if (!obj) {
    // Fail-open: no dump means no expansions are known. A brain built before
    // this PR (or a test with no dim file) still works — chapter queries just
    // don't broaden.
    cachedSubfactions = []
    return cachedSubfactions
  }
  cachedSubfactions = await obj.json<SubfactionRow[]>()
  return cachedSubfactions
}

/**
 * Expand a factionId to include its parent faction when the chapter's own
 * shared pool lives under a different faction slug.
 *
 * - `blood-angels` (chapter) → `{blood-angels, space-marines}`
 * - `orks` (no parent) → `{orks}`
 * - `unknown-slug` → `{unknown-slug}`
 *
 * The expansion is a one-hop parent walk — dim_subfaction rows have shape
 * `{id: <chapter-slug>, factionId: <parent-slug>}`. No transitive walking;
 * the model doesn't have grandchildren today and adding it prematurely is
 * out of scope.
 */
export async function expandFactionForRetrieval(
  factionId: string,
  bucket: R2Bucket,
): Promise<Set<string>> {
  const result = new Set<string>([factionId])
  const rows = await loadSubfactions(bucket)
  const row = rows.find((r) => r.id === factionId)
  if (row?.factionId && row.factionId !== factionId) {
    result.add(row.factionId)
  }
  return result
}

/**
 * Batch variant — expand every faction slug in the input and return the
 * union. Convenient for callers that already have a list (retrieve's
 * detected.factions, worker.ts /graph-data's factionScope).
 */
export async function expandFactionsForRetrieval(
  factionIds: string[],
  bucket: R2Bucket,
): Promise<Set<string>> {
  const union = new Set<string>()
  for (const id of factionIds) {
    const expanded = await expandFactionForRetrieval(id, bucket)
    for (const slug of expanded) union.add(slug)
  }
  return union
}

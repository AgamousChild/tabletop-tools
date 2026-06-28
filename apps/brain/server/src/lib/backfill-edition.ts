/**
 * Backfill `edition` (and optionally `factionId`) on community nodes that
 * the content-ingestor emitted before PR #43 added the `'11th'` default.
 *
 * Pure, importable function — the script wrapper at
 * `src/scripts/backfill-edition.ts` reads/writes the on-disk JSON.
 *
 * @see docs/superpowers/plans/2026-06-27-data-problems-followup.md (Step 1)
 * @see docs/reports/2026-06-27-inconsistency-deep-dive.md §4
 */
import type { Node } from './model'

export interface BackfillEditionStats {
  /** Total nodes inspected. */
  total: number
  /** Nodes that had `edition` set after the pass (delta). */
  editionSet: number
  /** Nodes that had `factionId` inferred from keywords (delta). */
  factionIdSet: number
  /** Nodes that were untouched because they were already tagged. */
  alreadyTagged: number
}

export interface BackfillEditionOptions {
  /**
   * Canonical faction slugs (from `dim_faction.id`). Used as the lookup set
   * when inferring `factionId` from a node's keywords. If omitted, no
   * factionId inference happens.
   */
  knownFactionSlugs?: ReadonlySet<string>
  /** Edition to set on nodes missing one. Defaults to `'11th'` per Rule 5. */
  defaultEdition?: string
}

/**
 * Look at each node's `keywords[]` and return the first one that, after
 * slugification, matches a known canonical faction slug. Returns undefined
 * if no keyword maps to a known faction.
 *
 * Intentionally cheap — single pass, lowercase + hyphenate, no fuzzy match.
 * If the keyword set has no clear faction signal we leave `factionId` unset
 * rather than guess wrong.
 */
export function inferFactionIdFromKeywords(
  keywords: readonly string[],
  knownFactionSlugs: ReadonlySet<string>,
): string | undefined {
  for (const kw of keywords) {
    const slug = kw
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    if (slug && knownFactionSlugs.has(slug)) return slug
  }
  return undefined
}

/**
 * Apply the backfill in place to a list of nodes. Returns the mutated array
 * plus a stats summary describing what changed.
 *
 * - Nodes missing `edition` get `defaultEdition` (default `'11th'`).
 * - If `knownFactionSlugs` is provided, nodes missing `factionId` get
 *   one inferred from their `keywords[]` when a single keyword matches a
 *   known slug. Nodes already carrying `factionId` are not overwritten.
 */
export function backfillEdition(
  nodes: Node[],
  options: BackfillEditionOptions = {},
): { nodes: Node[]; stats: BackfillEditionStats } {
  const defaultEdition = options.defaultEdition ?? '11th'
  const knownSlugs = options.knownFactionSlugs

  const stats: BackfillEditionStats = {
    total: nodes.length,
    editionSet: 0,
    factionIdSet: 0,
    alreadyTagged: 0,
  }

  for (const node of nodes) {
    const hadEdition = Boolean(node.edition)
    const hadFactionId = Boolean(node.factionId)

    if (!hadEdition) {
      node.edition = defaultEdition
      stats.editionSet++
    }

    if (!hadFactionId && knownSlugs) {
      const inferred = inferFactionIdFromKeywords(node.keywords ?? [], knownSlugs)
      if (inferred) {
        node.factionId = inferred
        stats.factionIdSet++
      }
    }

    if (hadEdition && hadFactionId) stats.alreadyTagged++
  }

  return { nodes, stats }
}

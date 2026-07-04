/**
 * Edition filter — Step 10 of 2026-06-27-data-problems-followup.
 *
 * Wahapedia stays on 10e; BSData+MFM are the 11e source. Every brain node carries
 * an `edition` ('9th' | '10th' | '11th'). Callers can ask for a specific edition,
 * for `any`, or fall through to the Worker's default. Default is configurable via
 * `BRAIN_DEFAULT_EDITION` — unset means `any` (preserve historical behaviour).
 */
import type { Node } from './model'

export type EditionFilter = '9th' | '10th' | '11th' | 'any'

const VALID_EDITIONS = new Set<EditionFilter>(['9th', '10th', '11th', 'any'])

/**
 * Coerce an arbitrary input (query string, env var) into an EditionFilter, or
 * return `undefined` when the input is missing/empty. Unknown values fall back
 * to `undefined` (callers then apply their own default).
 */
export function parseEditionParam(raw: string | undefined | null): EditionFilter | undefined {
  if (!raw) return undefined
  const trimmed = raw.trim().toLowerCase()
  if (!trimmed) return undefined
  if (VALID_EDITIONS.has(trimmed as EditionFilter)) return trimmed as EditionFilter
  return undefined
}

/**
 * Resolve the effective edition filter to apply to a request. Query-string
 * value wins; env-var default is the fallback; if neither is set we use `any`
 * (no filter) to preserve historical behaviour until 11e coverage is good
 * enough to flip the default.
 */
export function resolveEdition(
  queryEdition: string | undefined | null,
  envDefault: string | undefined | null,
): EditionFilter {
  return parseEditionParam(queryEdition) ?? parseEditionParam(envDefault) ?? 'any'
}

/**
 * Categories that are inherently edition-agnostic — the entity exists across
 * every edition and should not be filtered out when the caller picks a specific
 * edition. Faction records are the canonical example: an Orks faction is the
 * same identity in 10e and 11e, so the Factions browse layer must remain
 * populated regardless of `?edition=`.
 *
 * Only add a category here when the entity itself is truly edition-invariant.
 * Datasheets, abilities, stratagems, enhancements, detachments, missions,
 * core rules, and terrain all vary by edition and MUST stay filtered.
 */
export const EDITION_AGNOSTIC_CATEGORIES = new Set<string>(['faction'])

/**
 * Predicate that returns true when a node's edition matches the requested
 * filter. `any` is always true. Nodes in an edition-agnostic category (e.g.
 * `faction`) always match — they represent identities that span every edition.
 * Nodes without an edition tag are treated as 11th per Rule 5 (matches PR #54's
 * content-ingestor default).
 */
export function nodeMatchesEdition(
  node: { edition?: string | undefined; category?: string | undefined },
  edition: EditionFilter,
): boolean {
  if (edition === 'any') return true
  if (node.category && EDITION_AGNOSTIC_CATEGORIES.has(node.category)) return true
  const nodeEdition = node.edition ?? '11th'
  return nodeEdition === edition
}

/** Filter an array of nodes (or node-like records) by edition. */
export function filterByEdition<
  T extends { edition?: string | undefined; category?: string | undefined },
>(nodes: T[], edition: EditionFilter): T[] {
  if (edition === 'any') return nodes
  return nodes.filter((n) => nodeMatchesEdition(n, edition))
}

/**
 * Which editions exist in `nodes` for a given id. Used by /browse/unit/:id
 * and /browse/detachment/:id to populate the `X-Available-Editions` hint
 * header when a direct fetch is rejected by the edition filter.
 */
export function editionsAvailableForId(nodes: Node[], id: string): string[] {
  const editions = new Set<string>()
  for (const n of nodes) {
    if (n.id === id) editions.add(n.edition ?? '11th')
  }
  return [...editions].sort()
}

/**
 * Errata-to-rule matching module.
 *
 * Provides fuzzy matching between errata/FAQ nodes and the rules they clarify.
 * The parser generates `clarifies` refs using the errata's own title as the
 * target ID, which rarely matches the actual core rule IDs. This module fills
 * that gap at runtime using title, content, and keyword heuristics.
 *
 * All functions are pure — no R2/bucket access, operates on pre-fetched arrays.
 */

import type { ErrataAnnotation, Node } from './model'

// ── Types ────────────────────────────────────────────────────────────────────

export interface ErrataMatch {
  targetId: string
  score: number // 0–1 confidence
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Normalise text for comparison: lowercase, strip punctuation, collapse whitespace.
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Minimum character length required for substring / content-mention matching. */
const MIN_MATCH_CHARS = 4

// ── matchErrataToTargets ─────────────────────────────────────────────────────

/**
 * Match a single errata node against a list of potential target nodes.
 * Returns scored matches sorted by confidence descending.
 *
 * Matching strategy (priority order, best score wins per target):
 *  1. Exact title match         → 1.0
 *  2. Substring title           → 0.8  (min 4 chars, either direction)
 *  3. Content mentions title    → 0.5  (min 4 chars)
 *  4. Keyword overlap (≥2)      → 0.3
 */
export function matchErrataToTargets(errataNode: Node, targetNodes: Node[]): ErrataMatch[] {
  const errataTitle = normalize(errataNode.title)
  const errataContent = normalize(errataNode.content)
  const errataKeywords = new Set(errataNode.keywords.map((k) => k.toLowerCase()))

  const matches: ErrataMatch[] = []

  for (const target of targetNodes) {
    // Never match a node against itself
    if (target.id === errataNode.id) continue

    const targetTitle = normalize(target.title)
    let score = 0

    // 1. Exact title match
    if (errataTitle === targetTitle) {
      score = 1.0
      // 2. Substring title containment (min 4 chars)
    } else if (
      errataTitle.length >= MIN_MATCH_CHARS &&
      targetTitle.length >= MIN_MATCH_CHARS &&
      (targetTitle.includes(errataTitle) || errataTitle.includes(targetTitle))
    ) {
      score = 0.8
      // 3. Errata content mentions target title (min 4 chars)
    } else if (targetTitle.length >= MIN_MATCH_CHARS && errataContent.includes(targetTitle)) {
      score = 0.5
      // 4. Keyword overlap (≥2 shared keywords)
    } else {
      const sharedCount = target.keywords.filter((k) => errataKeywords.has(k.toLowerCase())).length
      if (sharedCount >= 2) {
        score = 0.3
      }
    }

    if (score > 0) {
      matches.push({ targetId: target.id, score })
    }
  }

  // Sort by score descending, then by targetId for determinism at equal scores
  matches.sort((a, b) => b.score - a.score || a.targetId.localeCompare(b.targetId))

  return matches
}

// ── findErrataForNode ────────────────────────────────────────────────────────

/**
 * Given a rule/unit/stratagem node, find all errata that apply to it.
 *
 * Matching criteria (any one is sufficient):
 *  - Title match (normalized equality)
 *  - Errata content mentions the node title (min 4 chars)
 *  - Errata has a `clarifies` ref whose targetId matches the node's ID
 *
 * Returns `ErrataAnnotation[]` using the first source of each errata node.
 */
export function findErrataForNode(node: Node, allErrataNodes: Node[]): ErrataAnnotation[] {
  const nodeTitle = normalize(node.title)
  const annotations: ErrataAnnotation[] = []

  for (const errata of allErrataNodes) {
    const errataTitle = normalize(errata.title)
    const errataContent = normalize(errata.content)

    const titleMatch = errataTitle === nodeTitle

    const contentMatch = nodeTitle.length >= MIN_MATCH_CHARS && errataContent.includes(nodeTitle)

    const refMatch = errata.refs.some((ref) => ref.rel === 'clarifies' && ref.targetId === node.id)

    if (!titleMatch && !contentMatch && !refMatch) continue

    const primarySource = errata.sources[0]
    annotations.push({
      nodeId: errata.id,
      title: errata.title,
      content: errata.content,
      source: {
        type: primarySource.type,
        title: primarySource.title,
        page: primarySource.page,
      },
    })
  }

  return annotations
}

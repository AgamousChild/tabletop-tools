import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { DraftNode } from '../types'

// ── Node shape from community.json ────────────────────────────────────────

interface CommunityNode {
  id: string
  title: string
  keywords: string[]
  [key: string]: unknown
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Read community.json from brainNodesDir and extract the id, title, and
 * keywords from each node. Returns an empty array if the file does not exist.
 */
export async function loadExistingNodes(
  brainNodesDir: string,
): Promise<Array<{ id: string; title: string; keywords: string[] }>> {
  const filePath = join(brainNodesDir, 'community.json')

  if (!existsSync(filePath)) {
    return []
  }

  const raw = readFileSync(filePath, 'utf-8')
  const nodes = JSON.parse(raw) as CommunityNode[]

  return nodes.map(({ id, title, keywords }) => ({ id, title, keywords }))
}

/**
 * Check whether a draft is similar to any existing brain node.
 *
 * Two similarity checks are applied:
 * 1. Title: if the draft title is a substring of an existing title, or the
 *    existing title is a substring of the draft title (case-insensitive).
 * 2. Keywords: if strictly more than 50% of the draft's keywords appear in
 *    an existing node's keyword set.
 *
 * Returns the ID of the first matching node, or undefined if none match.
 */
export function findSimilar(
  draft: DraftNode,
  existing: Array<{ id: string; title: string; keywords: string[] }>,
): string | undefined {
  const draftTitleLower = draft.title.toLowerCase()

  for (const node of existing) {
    const nodeTitleLower = node.title.toLowerCase()

    // Title substring check (bidirectional)
    if (draftTitleLower.includes(nodeTitleLower) || nodeTitleLower.includes(draftTitleLower)) {
      return node.id
    }

    // Keyword overlap check (>50% of draft keywords present in existing keywords)
    if (draft.keywords.length > 0) {
      const existingKeywordSet = new Set(node.keywords.map((k) => k.toLowerCase()))
      const matchCount = draft.keywords.filter((k) =>
        existingKeywordSet.has(k.toLowerCase()),
      ).length
      if (matchCount / draft.keywords.length > 0.5) {
        return node.id
      }
    }
  }

  return undefined
}

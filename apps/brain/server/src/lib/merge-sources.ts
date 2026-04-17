import type { Node, NodeRef } from './model'
import { normalizeFactionId } from './faction-codes'

export interface MergeStats {
  inputNodes: number
  outputNodes: number
  mergedByIdCount: number
  factionNormalizedCount: number
  refsDeduped: number
  summaryTagged: number
}

export interface MergeResult {
  nodes: Node[]
  refs: NodeRef[]
  stats: MergeStats
}

/** Convert a kebab-case slug to Title Case for display. */
function slugToTitleCase(slug: string): string {
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

/**
 * Merge nodes and refs from multiple sources (BSData + Wahapedia) into a
 * deduplicated, enriched graph ready for embedding.
 *
 * Operations (in order):
 * 1. Normalize all factionIds to canonical kebab-case slugs
 * 2. Deduplicate nodes by ID — first occurrence wins for content, keywords merged
 * 3. Prepend faction name to datasheet summaries for embedding disambiguation
 * 4. Tag non-datasheet nodes whose title collides with a datasheet title
 * 5. Deduplicate refs by sourceId + targetId + rel
 * 6. Remove orphan refs where either endpoint is absent from the final node set
 */
export function mergeSources(allNodes: Node[], allRefs: NodeRef[]): MergeResult {
  const stats: MergeStats = {
    inputNodes: allNodes.length,
    outputNodes: 0,
    mergedByIdCount: 0,
    factionNormalizedCount: 0,
    refsDeduped: 0,
    summaryTagged: 0,
  }

  // Step 1: Normalize factionIds (mutates a working copy — nodes from caller should be treated as mutable)
  for (const node of allNodes) {
    if (node.factionId) {
      const canonical = normalizeFactionId(node.factionId)
      if (canonical !== node.factionId) {
        node.factionId = canonical
        stats.factionNormalizedCount++
      }
    }
  }

  // Step 2: Deduplicate by ID — first occurrence wins, keywords from all occurrences merged
  const nodeMap = new Map<string, Node>()
  const extraKeywords = new Map<string, Set<string>>()

  for (const node of allNodes) {
    if (nodeMap.has(node.id)) {
      stats.mergedByIdCount++
      const kwSet = extraKeywords.get(node.id) ?? new Set<string>()
      for (const kw of node.keywords) kwSet.add(kw)
      extraKeywords.set(node.id, kwSet)
    } else {
      nodeMap.set(node.id, node)
      // Seed the extra-keywords set with the first node's keywords too so we
      // accumulate correctly even if duplicates appear later.
      const kwSet = new Set<string>(node.keywords)
      extraKeywords.set(node.id, kwSet)
    }
  }

  // Apply merged keywords back to winning nodes
  for (const [id, kwSet] of extraKeywords) {
    const node = nodeMap.get(id)!
    const existing = new Set(node.keywords)
    for (const kw of kwSet) {
      if (!existing.has(kw)) {
        node.keywords.push(kw)
      }
    }
  }

  // Step 3: Build a set of lowercase datasheet titles for collision detection
  const datasheetTitles = new Set<string>()
  for (const node of nodeMap.values()) {
    if (node.category === 'datasheet') {
      datasheetTitles.add(node.title.toLowerCase())
    }
  }

  // Step 4: Enrich summaries
  for (const node of nodeMap.values()) {
    // 4a: Datasheets — prepend faction name if not already present in summary
    if (node.category === 'datasheet' && node.factionId) {
      const factionLabel = slugToTitleCase(node.factionId)
      if (!node.summary.toLowerCase().includes(factionLabel.toLowerCase())) {
        node.summary = `${factionLabel}: ${node.summary}`
        stats.summaryTagged++
      }
    }

    // 4b: Non-datasheets whose title matches a datasheet title — append rule tag
    if (node.category !== 'datasheet' && datasheetTitles.has(node.title.toLowerCase())) {
      const alreadyTagged =
        node.summary.toLowerCase().includes('faction rule') ||
        node.summary.toLowerCase().includes('enhancement rule') ||
        node.summary.toLowerCase().includes('ability rule') ||
        node.summary.toLowerCase().includes('(rule)')

      if (!alreadyTagged) {
        const tag =
          node.category === 'faction-ability' ? 'faction rule' :
          node.category === 'enhancement'     ? 'enhancement rule' :
          node.category === 'unit-ability'    ? 'ability rule' :
          'rule'
        node.summary = `${node.summary} (${tag})`
        stats.summaryTagged++
      }
    }
  }

  const nodes = [...nodeMap.values()]
  stats.outputNodes = nodes.length

  // Step 5 + 6: Deduplicate refs and drop orphans (either endpoint missing)
  const nodeIdSet = new Set(nodes.map(n => n.id))
  const refKeySet = new Set<string>()
  const dedupedRefs: NodeRef[] = []

  for (const ref of allRefs) {
    // Drop orphan refs — remove if EITHER endpoint is absent
    if (!nodeIdSet.has(ref.sourceId) || !nodeIdSet.has(ref.targetId)) continue

    const key = `${ref.sourceId}|${ref.targetId}|${ref.rel}`
    if (refKeySet.has(key)) {
      stats.refsDeduped++
      continue
    }
    refKeySet.add(key)
    dedupedRefs.push(ref)
  }

  return { nodes, refs: dedupedRefs, stats }
}

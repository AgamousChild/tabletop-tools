import type { Node, NodeRef } from './model'
import { normalizeFactionId } from './faction-codes'

/** Slug → preferred English display name (ALL CAPS). */
const FACTION_DISPLAY_NAMES: Record<string, string> = {
  'space-marines': 'SPACE MARINES',
  'chaos-space-marines': 'CHAOS SPACE MARINES',
  't-au-empire': "T'AU EMPIRE",
  'astra-militarum': 'ASTRA MILITARUM',
  'adepta-sororitas': 'ADEPTA SORORITAS',
  'adeptus-custodes': 'ADEPTUS CUSTODES',
  'adeptus-mechanicus': 'ADEPTUS MECHANICUS',
  'grey-knights': 'GREY KNIGHTS',
  'imperial-agents': 'IMPERIAL AGENTS',
  'imperial-knights': 'IMPERIAL KNIGHTS',
  'chaos-knights': 'CHAOS KNIGHTS',
  'death-guard': 'DEATH GUARD',
  'thousand-sons': 'THOUSAND SONS',
  'world-eaters': 'WORLD EATERS',
  'chaos-daemons': 'CHAOS DAEMONS',
  'leagues-of-votann': 'LEAGUES OF VOTANN',
  'genestealer-cults': 'GENESTEALER CULTS',
  'aeldari': 'AELDARI',
  'drukhari': 'DRUKHARI',
  'tyranids': 'TYRANIDS',
  'necrons': 'NECRONS',
  'orks': 'ORKS',
  'emperors-children': "EMPEROR'S CHILDREN",
  'unaligned': 'UNALIGNED',
}

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

  // Step 1: Normalize factionIds and assign factionName (mutates a working copy)
  for (const node of allNodes) {
    if (node.factionId) {
      const canonical = normalizeFactionId(node.factionId)
      if (canonical !== node.factionId) {
        node.factionId = canonical
        stats.factionNormalizedCount++
      }
      // Assign display name from slug
      node.factionName = FACTION_DISPLAY_NAMES[canonical] ?? canonical.replace(/-/g, ' ').toUpperCase()
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

  // Step 2b: Deduplicate detachment-rules by title + faction
  // Different sources produce the same detachment with different IDs
  // (e.g. "det:dark-angels:wrath-of-the-rock:wrath-of-the-rock" from Wahapedia
  // vs "det:space-marines:wrath-of-the-rock" from faction packs with subfaction "dark angels")
  // Keep the one with more content, redirect refs from the dropped ID to the kept ID.
  // Map subfaction factionIds to their canonical subfaction name for dedup matching
  const SUBFACTION_ALIASES: Record<string, string> = {
    'blood-angels': 'blood angels', 'dark-angels': 'dark angels', 'space-wolves': 'space wolves',
    'black-templars': 'black templars', 'deathwatch': 'deathwatch', 'ultramarines': 'ultramarines',
    'iron-hands': 'iron hands', 'imperial-fists': 'imperial fists', 'raven-guard': 'raven guard',
    'salamanders': 'salamanders', 'white-scars': 'white scars',
  }

  // Step 2c: Normalize subfactions on SM nodes before dedup
  // Wahapedia uses factionId: "space-marines" for chapter-specific detachments
  // but doesn't set subfaction. The faction pack parser uses factionId: "dark-angels" etc.
  // Unify by detecting chapter slugs in node IDs and setting subfaction.
  const CHAPTER_SLUGS_TO_SUBFACTION: Record<string, string> = {
    'blood-angels': 'blood angels', 'dark-angels': 'dark angels', 'space-wolves': 'space wolves',
    'black-templars': 'black templars', 'deathwatch': 'deathwatch', 'ultramarines': 'ultramarines',
    'iron-hands': 'iron hands', 'imperial-fists': 'imperial fists', 'raven-guard': 'raven guard',
    'salamanders': 'salamanders', 'white-scars': 'white scars', 'blood-ravens': 'blood ravens',
  }
  for (const node of nodeMap.values()) {
    if (node.factionId === 'space-marines' && !node.subfaction) {
      // Check if node ID or detachmentId contains a chapter slug
      const idToCheck = node.detachmentId || node.id
      for (const [slug, sub] of Object.entries(CHAPTER_SLUGS_TO_SUBFACTION)) {
        if (idToCheck.includes(slug)) {
          node.subfaction = sub
          break
        }
      }
    }
  }

  const DEDUP_CATEGORIES = new Set(['detachment-rule', 'stratagem', 'enhancement', 'faction-ability'])
  const byTitleFaction = new Map<string, Node[]>()
  for (const node of nodeMap.values()) {
    if (!DEDUP_CATEGORIES.has(node.category)) continue
    // For detachment-rules, dedup by title only — the same detachment often appears
    // under different factionIds (e.g., "Wrath of the Rock" under both "dark-angels" and "space-marines")
    // For other categories, include faction to avoid collapsing legitimately different abilities
    const faction = node.category === 'detachment-rule'
      ? '' // title-only dedup for detachments
      : (node.subfaction || SUBFACTION_ALIASES[node.factionId ?? ''] || node.factionId || '')
    const key = `${node.category}|${node.title.toLowerCase().trim()}|${faction}`
    if (!byTitleFaction.has(key)) byTitleFaction.set(key, [])
    byTitleFaction.get(key)!.push(node)
  }

  const redirectIds = new Map<string, string>() // droppedId → keptId
  let titleDeduped = 0
  for (const [, dupes] of byTitleFaction) {
    if (dupes.length <= 1) continue
    // Keep the one with more content
    dupes.sort((a, b) => (b.content?.length ?? 0) - (a.content?.length ?? 0))
    const keeper = dupes[0]!
    for (let i = 1; i < dupes.length; i++) {
      const dropped = dupes[i]!
      redirectIds.set(dropped.id, keeper.id)
      nodeMap.delete(dropped.id)
      // Merge keywords from dropped into keeper
      const existing = new Set(keeper.keywords)
      for (const kw of dropped.keywords) {
        if (!existing.has(kw)) keeper.keywords.push(kw)
      }
      titleDeduped++
    }
  }

  console.log(`   Title-based dedup: ${titleDeduped} nodes removed, ${redirectIds.size} IDs redirected`)

  // Redirect refs that pointed to dropped nodes
  if (redirectIds.size > 0) {
    for (const ref of allRefs) {
      const newSource = redirectIds.get(ref.sourceId)
      if (newSource) ref.sourceId = newSource
      const newTarget = redirectIds.get(ref.targetId)
      if (newTarget) ref.targetId = newTarget
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

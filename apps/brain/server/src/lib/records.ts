import type { CrossRef, ErrataAnnotation, Node, RecordType } from './model'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Classification {
  recordType: RecordType
  containerId: string
}

/**
 * A record groups a primary node with matched child nodes, cross-references,
 * and errata annotations. crossRefs and errata are populated by later pipeline
 * stages (cross-refs module, errata linker).
 */
export interface AggregatedRecord {
  type: RecordType
  primaryNode: Node
  childNodes: Node[]
  crossRefs: CrossRef[]
  errata: ErrataAnnotation[]
  matchedChildIds: string[]
}

// ── R2 type (minimal — avoids Cloudflare Workers type deps) ──────────────────

interface R2Bucket {
  get(key: string): Promise<{ json<T>(): Promise<T>; text(): Promise<string> } | null>
}

// ── Unit child categories ─────────────────────────────────────────────────────

const UNIT_CHILD_CATEGORIES = new Set<Node['category']>([
  'weapon',
  'unit-ability',
  'wargear-option',
  'leader-attachment',
  'unit-composition',
])

// ── Mission/deployment categories that map 1:1 to RecordType ─────────────────

const PASSTHROUGH_CATEGORIES = new Set<Node['category']>([
  'primary-mission',
  'secondary-mission',
  'deployment-zone',
  'twist',
  'challenger',
  'terrain-layout',
])

// ── classifyNode ──────────────────────────────────────────────────────────────

/**
 * Determines which record a node belongs to, returning the record type and
 * the container ID (the primary node's ID for that record).
 *
 * Nodes that are children of a datasheet (weapons, abilities, etc.) map to
 * their parent's ID. Standalone nodes (stratagems, detachment rules, etc.)
 * map to themselves.
 *
 * Army rule sub-rules are identified by a parenthetical suffix in the title
 * AND 4+ colon-separated segments in the ID. They are grouped under the parent
 * by stripping the last segment from the ID.
 */
export function classifyNode(node: Node): Classification {
  const { category, id, datasheetId } = node

  // Unit child nodes → group under parent datasheet
  if (UNIT_CHILD_CATEGORIES.has(category) && datasheetId) {
    return { recordType: 'unit', containerId: datasheetId }
  }

  // Datasheet → unit record (self as primary)
  if (category === 'datasheet') {
    return { recordType: 'unit', containerId: id }
  }

  // Faction root nodes
  if (category === 'faction') {
    return { recordType: 'faction', containerId: id }
  }

  // Detachment container nodes
  if (category === 'detachment') {
    return { recordType: 'detachment', containerId: id }
  }

  // Army rules
  if (category === 'army-rule') {
    const hasParenthetical = /\(.+\)$/.test(node.title.trim())
    const segments = id.split(':')
    if (hasParenthetical && segments.length >= 4) {
      const parentId = segments.slice(0, -1).join(':')
      return { recordType: 'army-rule', containerId: parentId }
    }
    return { recordType: 'army-rule', containerId: id }
  }

  // Faction abilities (detachment-scoped abilities)
  if (category === 'faction-ability') {
    return { recordType: 'rule', containerId: id }
  }

  // Detachment rules (the mechanic inside a detachment)
  if (category === 'detachment-rule') {
    return { recordType: 'rule', containerId: id }
  }

  // Stratagems and enhancements are always standalone
  if (category === 'stratagem') return { recordType: 'stratagem', containerId: id }
  if (category === 'enhancement') return { recordType: 'enhancement', containerId: id }

  // Errata overlay nodes
  if (category === 'faq' || category === 'commentary') {
    return { recordType: 'errata', containerId: id }
  }

  // Balance dataslate changes
  if (category === 'balance-change') {
    return { recordType: 'balance', containerId: id }
  }

  // Mission & deployment categories map 1:1 to RecordType
  if (PASSTHROUGH_CATEGORIES.has(category)) {
    return { recordType: category as RecordType, containerId: id }
  }

  // Everything else (core-mechanic, phase-sequence, terrain, mission, keyword,
  // army-construction, ruling, tactic, worked-example) → generic rule
  return { recordType: 'rule', containerId: id }
}

// ── aggregateToRecords ────────────────────────────────────────────────────────

/**
 * Groups search result nodes into records by their container.
 *
 * Algorithm:
 * 1. Classify each result node to find its containerId.
 * 2. Accumulate matched children per container, preserving first-seen order.
 * 3. Resolve the primary node for each container — from resultNodes first,
 *    then from the allNodes lookup map, then skip if not found.
 * 4. Build AggregatedRecord for each container.
 */
export function aggregateToRecords(
  resultNodes: Node[],
  allNodes: Map<string, Node>,
): AggregatedRecord[] {
  // Map<containerId, { type, childIds, childNodes }>
  const containers = new Map<
    string,
    {
      type: RecordType
      childIds: string[] // IDs of matched child nodes (not the primary)
      childNodes: Node[] // the matched child node objects
      order: number // first-seen index for stable ordering
    }
  >()

  // Index result nodes for fast lookup
  const resultById = new Map<string, Node>()
  for (const node of resultNodes) {
    resultById.set(node.id, node)
  }

  let containerOrder = 0

  for (const node of resultNodes) {
    const { recordType, containerId } = classifyNode(node)

    if (!containers.has(containerId)) {
      containers.set(containerId, {
        type: recordType,
        childIds: [],
        childNodes: [],
        order: containerOrder++,
      })
    }

    const container = containers.get(containerId)!

    // If this node IS the primary (containerId === node.id), don't add as a child
    if (containerId !== node.id) {
      container.childIds.push(node.id)
      container.childNodes.push(node)
    }
  }

  // Build sorted records (by first-seen order)
  const sorted = [...containers.entries()].sort((a, b) => a[1].order - b[1].order)

  const records: AggregatedRecord[] = []

  for (const [containerId, container] of sorted) {
    // Resolve primary node — result set first, then allNodes lookup
    const primaryNode = resultById.get(containerId) ?? allNodes.get(containerId) ?? null

    if (!primaryNode) continue // can't build a record without a primary

    records.push({
      type: container.type,
      primaryNode,
      childNodes: container.childNodes,
      crossRefs: [],
      errata: [],
      matchedChildIds: container.childIds,
    })
  }

  return records
}

// ── fetchAllChildren ──────────────────────────────────────────────────────────

/**
 * Scans all R2 node files and collects every node whose datasheetId is in
 * the given containerIds set.
 *
 * Used to populate unit records with their complete weapon/ability lists
 * (not just the nodes that matched the search query).
 */
export async function fetchAllChildren(bucket: R2Bucket, containerIds: string[]): Promise<Node[]> {
  if (containerIds.length === 0) return []

  const manifestObj = await bucket.get('manifest.json')
  if (!manifestObj) return []

  const manifest = await manifestObj.json<{ files: Record<string, string> }>()
  const nodeFiles = Object.keys(manifest.files).filter((f) => f.startsWith('nodes/'))

  const idSet = new Set(containerIds)
  const results: Node[] = []

  for (const file of nodeFiles) {
    const obj = await bucket.get(file)
    if (!obj) continue
    const fileNodes = await obj.json<Node[]>()
    for (const node of fileNodes) {
      if (node.datasheetId && idSet.has(node.datasheetId)) {
        results.push(node)
      }
    }
  }

  return results
}

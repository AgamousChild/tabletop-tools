import type { Node } from './model'

// ── Module-scope manifest cache ──────────────────────────────────────────────

let cachedManifest: { files: Record<string, string> } | null = null

/** Reset the manifest cache. Used in tests to ensure isolation between test runs. */
export function resetManifestCache(): void {
  cachedManifest = null
}

// ── R2 type (minimal — avoids Cloudflare Workers type deps) ─────────────────

interface R2Bucket {
  get(key: string): Promise<{ json<T>(): Promise<T>; text(): Promise<string> } | null>
}

// ── fetchNodesFromR2 ─────────────────────────────────────────────────────────

/**
 * Fetch full node objects from R2 by their IDs.
 * Uses a module-scope manifest cache so the manifest is only fetched once per
 * Worker isolate lifetime.
 */
export async function fetchNodesFromR2(bucket: R2Bucket, nodeIds: string[]): Promise<Node[]> {
  // Load manifest (from cache if available)
  if (!cachedManifest) {
    const manifestObj = await bucket.get('manifest.json')
    if (!manifestObj) return []
    cachedManifest = await manifestObj.json<{ files: Record<string, string> }>()
  }

  const nodeFiles = Object.keys(cachedManifest.files).filter(f => f.startsWith('nodes/'))

  const nodes: Node[] = []
  const idSet = new Set(nodeIds)

  for (const file of nodeFiles) {
    const obj = await bucket.get(file)
    if (!obj) continue
    const fileNodes = await obj.json<Node[]>()
    for (const node of fileNodes) {
      if (idSet.has(node.id)) {
        nodes.push(node)
        idSet.delete(node.id)
      }
    }
    if (idSet.size === 0) break
  }

  return nodes
}

// ── fetchConnectedNodes ──────────────────────────────────────────────────────

type RevEntry = { sourceId: string; rel: string; context: string; factionId?: string }
type FwdEntry = { targetId: string; rel: string; context: string }

const CHAPTER_KEYWORDS = [
  'space wolves', 'dark angels', 'blood angels', 'black templars',
  'deathwatch', 'iron hands', 'ultramarines', 'salamanders', 'raven guard',
  'imperial fists', 'white scars', 'crimson fists', 'any chapter',
]

/**
 * Walk the graph from the given node IDs using both indexes.
 *
 * Reverse index: find what points TO these nodes.
 * Forward index: resolve part_of parents (ability → datasheet name).
 *
 * The factionFilter.subfaction field is used to filter connected nodes:
 * only nodes whose subfaction matches (or is empty/undefined — generic content)
 * are kept. This fixes the bug where "blood angels sustained hits" would
 * return space wolves content.
 */
export async function fetchConnectedNodes(
  bucket: R2Bucket,
  nodeIds: string[],
  depth: number,
  factionFilter?: { factionId?: string; subfaction?: string },
): Promise<{ nodes: Node[]; parentMap: Map<string, string> }> {
  if (depth <= 0) return { nodes: [], parentMap: new Map() }

  // Load both indexes in parallel
  const [revObj, fwdObj] = await Promise.all([
    bucket.get('refs/reverse-index.json'),
    bucket.get('refs/forward-index.json'),
  ])
  if (!revObj) return { nodes: [], parentMap: new Map() }

  const reverseIndex = await revObj.json<Record<string, RevEntry[]>>()
  const forwardIndex = fwdObj
    ? await fwdObj.json<Record<string, FwdEntry[]>>()
    : {} as Record<string, FwdEntry[]>

  // Step 1: Reverse lookup — find all nodes that reference our search results
  const inboundRefs: RevEntry[] = []
  for (const nodeId of nodeIds) {
    const refs = reverseIndex[nodeId]
    if (refs) inboundRefs.push(...refs)
  }

  if (inboundRefs.length === 0) return { nodes: [], parentMap: new Map() }

  // Step 2: Collect unique candidate refs (excluding already-known nodes)
  const known = new Set(nodeIds)
  const uniqueRefs = new Map<string, RevEntry>()
  for (const r of inboundRefs) {
    if (!known.has(r.sourceId) && !uniqueRefs.has(r.sourceId)) {
      uniqueRefs.set(r.sourceId, r)
    }
  }

  // Priority by ID prefix: abilities/stratagems first, weapons last
  function refPriority(id: string): number {
    if (id.startsWith('faction:')) return 0  // army-wide abilities — highest impact
    if (id.startsWith('det:')) return 1      // detachment rules, stratagems, enhancements
    if (id.startsWith('ability:')) return 2  // unit abilities (leader grants)
    if (id.startsWith('weapon:')) return 4   // weapons — lowest priority (high volume)
    return 3
  }

  const factionHint = factionFilter?.factionId

  const sortedRefs = [...uniqueRefs.entries()]
    .sort((a, b) => {
      const pa = refPriority(a[0])
      const pb = refPriority(b[0])
      if (pa !== pb) return pa - pb
      const fa = a[1].factionId === factionHint ? 0 : 1
      const fb = b[1].factionId === factionHint ? 0 : 1
      return fa - fb
    })

  // Take all high-priority nodes (abilities, stratagems), cap weapons at 15
  const highPriority = sortedRefs.filter(([id]) => refPriority(id) <= 3)
  const weapons = sortedRefs.filter(([id]) => refPriority(id) === 4)
  const selectedIds = [
    ...highPriority.map(([id]) => id),
    ...weapons.map(([id]) => id).slice(0, 15),
  ]

  if (selectedIds.length === 0) return { nodes: [], parentMap: new Map() }

  // Step 3: Forward lookup — resolve part_of parents
  const parentMap = new Map<string, string>() // child nodeId → parent nodeId
  const parentIdsToFetch = new Set<string>()

  for (const id of selectedIds) {
    const fwdRefs = forwardIndex[id]
    if (!fwdRefs) continue
    for (const ref of fwdRefs) {
      if (ref.rel === 'part_of') {
        parentMap.set(id, ref.targetId)
        if (!known.has(ref.targetId)) {
          parentIdsToFetch.add(ref.targetId)
        }
        break // first parent only
      }
    }
  }

  // Step 4: Fetch connected nodes + their parents in one batch
  const allToFetch = [...new Set([...selectedIds, ...parentIdsToFetch])]
    .filter(id => !known.has(id))

  let nodes = await fetchNodesFromR2(bucket, allToFetch)

  // Step 5: Subfaction filtering (THE MAIN BUG FIX)
  // If a subfaction filter is set, only keep nodes whose subfaction matches
  // OR is empty/undefined (generic content applicable to all).
  const subfactionFilter = factionFilter?.subfaction
  if (subfactionFilter) {
    // Determine which IDs are parents (needed for parentMap resolution) — keep them always
    const parentNodeIds = new Set<string>(parentIdsToFetch)

    nodes = nodes.filter(node => {
      // Always keep parent nodes (they're needed for title resolution, not returned as content)
      if (parentNodeIds.has(node.id)) return true
      // Keep nodes with matching subfaction
      if (node.subfaction === subfactionFilter) return true
      // Keep generic nodes (no subfaction set)
      if (!node.subfaction) return true
      // Exclude nodes with a different subfaction
      return false
    })
  }

  // Step 6: Resolve parentMap IDs to titles
  const nodeById = new Map<string, Node>()
  for (const n of nodes) nodeById.set(n.id, n)

  const resolvedParentMap = new Map<string, string>()
  for (const [childId, parentId] of parentMap) {
    const parent = nodeById.get(parentId)
    if (parent) {
      const chapter = parent.keywords?.find(k => CHAPTER_KEYWORDS.includes(k))
      let chapterSuffix = ''
      if (chapter && chapter !== 'any chapter') {
        chapterSuffix = ` [${chapter.split(' ').map(w => w[0]!.toUpperCase() + w.slice(1)).join(' ')} only]`
      } else if (chapter === 'any chapter') {
        chapterSuffix = ' [any chapter]'
      }
      resolvedParentMap.set(childId, `${parent.title}${chapterSuffix}`)
    }
  }

  // Remove parent-only nodes from the returned list (they're only for title resolution)
  // Only return nodes that were in selectedIds (not parent-only fetches)
  const selectedIdSet = new Set(selectedIds)
  const contentNodes = nodes.filter(n => selectedIdSet.has(n.id))

  return { nodes: contentNodes, parentMap: resolvedParentMap }
}

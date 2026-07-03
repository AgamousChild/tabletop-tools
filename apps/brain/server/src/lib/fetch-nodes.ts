import type { Node } from './model'

/**
 * Chapter keyword list for parent-title enrichment when a parent node's
 * structured `keywords` field carries a chapter marker (e.g. from BSData
 * catalog membership or Wahapedia datasheet_keywords).
 *
 * This is DISPLAY-side lookup against structured data — it doesn't infer
 * chapters from text. The fuzzy text-detection variants (`CHAPTERS`,
 * `CHAPTER_KEYWORDS` exported from `filters.ts`) were removed in PR A of the
 * scalar-to-ref refactor. See docs/superpowers/plans/2026-07-03-scalar-to-ref-refactor.md.
 */
const CHAPTER_KEYWORDS = [
  'space wolves',
  'dark angels',
  'blood angels',
  'black templars',
  'deathwatch',
  'iron hands',
  'ultramarines',
  'salamanders',
  'raven guard',
  'imperial fists',
  'white scars',
  'crimson fists',
  'any chapter',
]

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

  const nodeFiles = Object.keys(cachedManifest.files).filter((f) => f.startsWith('nodes/'))

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

/**
 * Walk the graph from the given node IDs using both indexes.
 *
 * Reverse index: find what points TO these nodes.
 * Forward index: resolve part_of parents (ability → datasheet name).
 *
 * The optional `factionFilter.factionId` restricts connected nodes to that
 * faction (or generic — nodes with no factionId). Chapter identity now lives
 * on `factionId` directly (PR D of the scalar-to-ref refactor); the caller
 * must pass the chapter slug it wants (or the expanded parent-faction pool)
 * — there's no side-channel subfaction filter here anymore.
 */
export async function fetchConnectedNodes(
  bucket: R2Bucket,
  nodeIds: string[],
  depth: number,
  factionFilter?: { factionId?: string },
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
    : ({} as Record<string, FwdEntry[]>)

  // Step 1: Reverse lookup — find all nodes that reference our search results
  const inboundRefs: RevEntry[] = []
  for (const nodeId of nodeIds) {
    const refs = reverseIndex[nodeId]
    if (refs) inboundRefs.push(...refs)
  }

  if (inboundRefs.length === 0) return { nodes: [], parentMap: new Map() }

  // Step 2: Collect unique candidate refs (excluding already-known nodes)
  // Pre-filter by factionId if a faction filter is set — this prevents pulling in
  // hundreds of nodes from other factions that reference generic core rules like
  // "sustained hits". Keep refs that match the faction OR have no faction (generic).
  const known = new Set(nodeIds)
  const uniqueRefs = new Map<string, RevEntry>()
  for (const r of inboundRefs) {
    if (known.has(r.sourceId) || uniqueRefs.has(r.sourceId)) continue
    if (factionFilter?.factionId && r.factionId && r.factionId !== factionFilter.factionId) continue
    uniqueRefs.set(r.sourceId, r)
  }

  // Priority by ID prefix: abilities/stratagems first, weapons last
  function refPriority(id: string): number {
    if (id.startsWith('faction:')) return 0 // army-wide abilities — highest impact
    if (id.startsWith('det:')) return 1 // detachment rules, stratagems, enhancements
    if (id.startsWith('ability:')) return 2 // unit abilities (leader grants)
    if (id.startsWith('weapon:')) return 4 // weapons — lowest priority (high volume)
    return 3
  }

  const factionHint = factionFilter?.factionId

  const sortedRefs = [...uniqueRefs.entries()].sort((a, b) => {
    const pa = refPriority(a[0])
    const pb = refPriority(b[0])
    if (pa !== pb) return pa - pb
    const fa = a[1].factionId === factionHint ? 0 : 1
    const fb = b[1].factionId === factionHint ? 0 : 1
    return fa - fb
  })

  // Cap all categories — prevent flooding R2 fetches with hundreds of nodes.
  // The real relevance filter is downstream in the /ask handler (keyword scoring).
  const MAX_HIGH_PRIORITY = 30
  const MAX_WEAPONS = 30
  const highPriority = sortedRefs.filter(([id]) => refPriority(id) <= 3).slice(0, MAX_HIGH_PRIORITY)
  const weapons = sortedRefs.filter(([id]) => refPriority(id) === 4).slice(0, MAX_WEAPONS)
  const selectedIds = [...highPriority.map(([id]) => id), ...weapons.map(([id]) => id)]

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
  const allToFetch = [...new Set([...selectedIds, ...parentIdsToFetch])].filter(
    (id) => !known.has(id),
  )

  const nodes = await fetchNodesFromR2(bucket, allToFetch)

  const selectedIdSet = new Set(selectedIds)

  // Step 5b: Follow stacks_with refs from connected nodes
  // This finds combo partners: if Immolation Protocols is connected (grants dev wounds),
  // follow its stacks_with ref to find Forgefather (grants wound re-rolls).
  const comboIds = new Set<string>()
  for (const node of nodes) {
    const fwdRefs = forwardIndex[node.id]
    if (!fwdRefs) continue
    for (const ref of fwdRefs) {
      if (
        ref.rel === 'stacks_with' &&
        !known.has(ref.targetId) &&
        !selectedIdSet.has(ref.targetId)
      ) {
        // Apply faction filter to combo partners too
        if (factionFilter?.factionId) {
          // We don't have factionId on forward refs — fetch the node and check
          comboIds.add(ref.targetId)
        } else {
          comboIds.add(ref.targetId)
        }
      }
    }
    // Also check reverse — if something stacks_with this node
    const revRefs = reverseIndex[node.id]
    if (revRefs) {
      for (const ref of revRefs) {
        if (
          ref.rel === 'stacks_with' &&
          !known.has(ref.sourceId) &&
          !selectedIdSet.has(ref.sourceId)
        ) {
          if (
            !factionFilter?.factionId ||
            !ref.factionId ||
            ref.factionId === factionFilter.factionId
          ) {
            comboIds.add(ref.sourceId)
          }
        }
      }
    }
  }

  if (comboIds.size > 0) {
    const comboNodes = await fetchNodesFromR2(bucket, [...comboIds])
    // Filter combos by faction
    const filteredCombos = comboNodes.filter((n) => {
      if (factionFilter?.factionId && n.factionId && n.factionId !== factionFilter.factionId)
        return false
      return true
    })
    nodes.push(...filteredCombos)
    // Add combo node IDs to selectedIdSet so they appear in results
    for (const n of filteredCombos) selectedIdSet.add(n.id)
  }

  // Step 6: Resolve parentMap IDs to titles
  const nodeById = new Map<string, Node>()
  for (const n of nodes) nodeById.set(n.id, n)

  const resolvedParentMap = new Map<string, string>()
  for (const [childId, parentId] of parentMap) {
    const parent = nodeById.get(parentId)
    if (parent) {
      const chapter = parent.keywords?.find((k) => CHAPTER_KEYWORDS.includes(k))
      let chapterSuffix = ''
      if (chapter && chapter !== 'any chapter') {
        chapterSuffix = ` [${chapter
          .split(' ')
          .map((w) => w[0]!.toUpperCase() + w.slice(1))
          .join(' ')} only]`
      } else if (chapter === 'any chapter') {
        chapterSuffix = ' [any chapter]'
      }
      resolvedParentMap.set(childId, `${parent.title}${chapterSuffix}`)
    }
  }

  // Remove parent-only nodes from the returned list (they're only for title resolution)
  // Only return nodes that were in selectedIds (not parent-only fetches)
  const contentNodes = nodes.filter((n) => selectedIdSet.has(n.id))

  return { nodes: contentNodes, parentMap: resolvedParentMap }
}

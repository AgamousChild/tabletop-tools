import type { CrossRef } from './model'
import type { AggregatedRecord } from './records'

// ── Internal index types ──────────────────────────────────────────────────────

type FwdEntry = { targetId: string; rel: string; context: string }
type RevEntry = { sourceId: string; rel: string; context: string }

// ── Module-scope cache (one per Worker isolate) ───────────────────────────────

let cachedFwdIndex: Record<string, FwdEntry[]> | null = null
let cachedRevIndex: Record<string, RevEntry[]> | null = null

/** Reset cache — used in tests */
export function resetCrossRefCache(): void {
  cachedFwdIndex = null
  cachedRevIndex = null
}

/**
 * Load forward and reverse reference indexes from R2.
 * Cached per Worker isolate lifetime — the 14MB total is loaded once, not per request.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadIndexes(bucket: any): Promise<{
  fwd: Record<string, FwdEntry[]>
  rev: Record<string, RevEntry[]>
}> {
  if (cachedFwdIndex && cachedRevIndex) {
    return { fwd: cachedFwdIndex, rev: cachedRevIndex }
  }

  const [fwdObj, revObj] = await Promise.all([
    bucket.get('refs/forward-index.json'),
    bucket.get('refs/reverse-index.json'),
  ])

  cachedFwdIndex = fwdObj ? await fwdObj.json() : {}
  cachedRevIndex = revObj ? await revObj.json() : {}

  return { fwd: cachedFwdIndex!, rev: cachedRevIndex! }
}

/**
 * Build cross-reference links for each record in the result set.
 *
 * Algorithm:
 * 1. Build a nodeId → recordId lookup covering primaryNode and all childNodes.
 * 2. For each record, walk forward + reverse refs for every node it contains.
 * 3. Exclude part_of refs (structural) and self-references.
 * 4. Accumulate an edge count per target record (multiple children → same target counts up).
 * 5. Resolve target title and type from the record set; default type to 'rule' for externals.
 * 6. Sort by refCount descending, cap at 20.
 *
 * Does not mutate input records — returns new record objects with crossRefs populated.
 */
export function buildCrossRefs(
  records: AggregatedRecord[],
  fwd: Record<string, FwdEntry[]>,
  rev: Record<string, RevEntry[]>,
  factionScope?: string[],
  nodeFactionMap?: Map<string, string>,
  nodeSubfactionMap?: Map<string, string>,
  subfactionScope?: string,
): AggregatedRecord[] {
  // When factionScope is set, only include cross-refs to nodes that share
  // a faction or are generic (no faction). Uses the nodeFactionMap (nodeId → factionId)
  // built from actual node data, not ID string parsing.
  const factionSet = factionScope && factionScope.length > 0 ? new Set(factionScope) : null

  function factionAllowed(nodeId: string): boolean {
    if (!factionSet) return true
    if (!nodeFactionMap) return true
    const nodeFaction = nodeFactionMap.get(nodeId)
    if (!nodeFaction) return true // no faction = generic/core, always allowed
    if (!factionSet.has(nodeFaction)) return false
    // Subfaction check: if we have a subfaction scope, reject other subfactions
    if (subfactionScope && nodeSubfactionMap) {
      const nodeSub = nodeSubfactionMap.get(nodeId)
      if (nodeSub && nodeSub !== subfactionScope) return false
    }
    return true
  }
  // nodeId → owning record's primaryNode.id
  const nodeToRecord = new Map<string, string>()
  // nodeId → title (best-effort, used when target record isn't in result set)
  const titleIndex = new Map<string, string>()
  // primaryNode.id → RecordType
  const recordTypeMap = new Map<string, AggregatedRecord['type']>()

  for (const record of records) {
    const pid = record.primaryNode.id
    nodeToRecord.set(pid, pid)
    titleIndex.set(pid, record.primaryNode.title)
    recordTypeMap.set(pid, record.type)
    for (const child of record.childNodes) {
      nodeToRecord.set(child.id, pid)
      titleIndex.set(child.id, child.title)
    }
  }

  return records.map((record) => {
    const myId = record.primaryNode.id
    const allMyIds = [myId, ...record.childNodes.map((c) => c.id)]

    // targetRecordId → accumulated edge data
    const refCounts = new Map<
      string,
      {
        rel: string
        context: string
        count: number
        title: string
      }
    >()

    for (const nodeId of allMyIds) {
      // Forward refs: this record → something else
      for (const ref of fwd[nodeId] ?? []) {
        if (ref.rel === 'part_of') continue
        if (!factionAllowed(ref.targetId)) continue
        const targetRecordId = nodeToRecord.get(ref.targetId) ?? ref.targetId
        if (targetRecordId === myId) continue // self-reference

        const existing = refCounts.get(targetRecordId)
        if (existing) {
          existing.count++
        } else {
          refCounts.set(targetRecordId, {
            rel: ref.rel,
            context: ref.context,
            count: 1,
            title: titleIndex.get(ref.targetId) ?? ref.targetId.split(':').pop() ?? ref.targetId,
          })
        }
      }

      // Reverse refs: something else → this record
      for (const ref of rev[nodeId] ?? []) {
        if (ref.rel === 'part_of') continue
        if (!factionAllowed(ref.sourceId)) continue
        const sourceRecordId = nodeToRecord.get(ref.sourceId) ?? ref.sourceId
        if (sourceRecordId === myId) continue // self-reference

        const existing = refCounts.get(sourceRecordId)
        if (existing) {
          existing.count++
        } else {
          refCounts.set(sourceRecordId, {
            rel: ref.rel,
            context: ref.context,
            count: 1,
            title: titleIndex.get(ref.sourceId) ?? ref.sourceId.split(':').pop() ?? ref.sourceId,
          })
        }
      }
    }

    // Build sorted, capped CrossRef array
    const crossRefs: CrossRef[] = [...refCounts.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 20)
      .map(([targetId, data]) => ({
        targetRecordId: targetId,
        targetTitle: recordTypeMap.has(targetId)
          ? (titleIndex.get(targetId) ?? data.title)
          : data.title,
        targetType: recordTypeMap.get(targetId) ?? 'rule',
        rel: data.rel,
        context: data.context,
        refCount: data.count,
      }))

    return { ...record, crossRefs }
  })
}

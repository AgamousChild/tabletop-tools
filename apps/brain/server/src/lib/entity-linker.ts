import type { Node } from './model'

/** Map of lowercased entity name → nodeId + display title */
export type EntityMap = Map<string, { nodeId: string; title: string }>

/** Cached entity index — one per Worker isolate lifetime */
let cachedEntityIndex: EntityMap | null = null

/** Reset cache — used in tests */
export function resetEntityCache(): void {
  cachedEntityIndex = null
}

/**
 * Build a global entity index from R2 node data.
 * Indexes stratagems, detachment rules, enhancements, datasheets, and faction abilities.
 * Cached per Worker isolate lifetime.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getEntityIndex(bucket: any): Promise<EntityMap> {
  if (cachedEntityIndex) return cachedEntityIndex

  const map: EntityMap = new Map()
  const manifestObj = await bucket.get('manifest.json')
  if (!manifestObj) return map
  const manifest = (await manifestObj.json()) as { files: Record<string, string> }

  for (const file of Object.keys(manifest.files)) {
    if (!file.startsWith('nodes/')) continue
    const obj = await bucket.get(file)
    if (!obj) continue
    const nodes = (await obj.json()) as Node[]
    for (const n of nodes) {
      if (
        ['stratagem', 'detachment-rule', 'enhancement', 'datasheet', 'faction-ability'].includes(
          n.category,
        )
      ) {
        const key = n.title.toLowerCase()
        if (key.length > 2 && !map.has(key)) {
          map.set(key, { nodeId: n.id, title: n.title })
        }
      }
    }
  }

  cachedEntityIndex = map
  return map
}

/**
 * Replace entity names in text with [Name](brain:nodeId) links.
 * Only links the first occurrence of each entity. Case-insensitive matching.
 * Longest names matched first (greedy). Skips replacement inside existing brain: links.
 */
export function linkEntitiesInContent(text: string, entityMap: EntityMap): string {
  if (entityMap.size === 0) return text

  // Sort names longest-first for greedy matching
  const names = Array.from(entityMap.keys()).sort((a, b) => b.length - a.length)

  // Escape regex special chars in names
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi')

  // Track which entity IDs we've already linked (only link first occurrence)
  const linked = new Set<string>()

  // Build a set of ranges that are already inside brain: links — skip those
  const skipRanges: Array<[number, number]> = []
  const existingLinkPattern = /\[[^\]]+\]\(brain:[^)]+\)/g
  let m: RegExpExecArray | null
  while ((m = existingLinkPattern.exec(text)) !== null) {
    skipRanges.push([m.index, m.index + m[0].length])
  }

  return text.replace(pattern, (match, _group, offset: number) => {
    // Skip if this match falls inside an existing brain: link
    for (const [start, end] of skipRanges) {
      if (offset >= start && offset + match.length <= end) return match
    }

    const key = match.toLowerCase()
    const entity = entityMap.get(key)
    if (!entity || linked.has(entity.nodeId)) return match
    linked.add(entity.nodeId)
    return `[${match}](brain:${entity.nodeId})`
  })
}

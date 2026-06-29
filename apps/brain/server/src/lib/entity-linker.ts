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
 * Replace entity names in text with `[Name](brain:nodeId)` markdown links.
 *
 * Each successful match consumes its span — a long match like "Captain in
 * Terminator Armour" prevents the substring "Captain" from being relinked
 * inside it (the 2026-06-29 bug where the shorter Captain datasheet was
 * picked over the longer one). The walker also skips ranges already occupied
 * by an existing `[label](brain:...)` link in the input so it never emits
 * nested markdown brackets.
 *
 * Only the first occurrence of each entity (per node id) is linked, matching
 * the prior contract of this function.
 */
export function linkEntitiesInContent(text: string, entityMap: EntityMap): string {
  if (entityMap.size === 0 || !text) return text

  // Sort entity names longest-first — at every position we want the longest
  // candidate to win, regardless of the order they were inserted into the map.
  // Tie-break alphabetically so output is deterministic.
  const names = Array.from(entityMap.keys()).sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length
    return a.localeCompare(b)
  })

  // Pre-compute the ranges of existing brain links in the text — those ranges
  // are "claimed" and must be skipped by the walker so we don't nest brackets.
  const claimed: Array<[number, number]> = []
  const existingLinkPattern = /\[[^\]]+\]\(brain:[^)]+\)/g
  let em: RegExpExecArray | null
  while ((em = existingLinkPattern.exec(text)) !== null) {
    claimed.push([em.index, em.index + em[0].length])
  }

  const linkedIds = new Set<string>()

  // Track existing links' node IDs so subsequent occurrences of the same
  // entity remain unlinked (the same first-occurrence-only rule applies even
  // when the first occurrence was already authored as a brain: link).
  const existingIdPattern = /\]\(brain:([^)]+)\)/g
  let idm: RegExpExecArray | null
  while ((idm = existingIdPattern.exec(text)) !== null) {
    linkedIds.add(idm[1]!)
  }

  // Position-by-position walker. At each cursor, try each candidate longest-first;
  // on a hit, emit the bracket form and jump past the matched span so a shorter
  // entity nested inside it cannot fire.
  const out: string[] = []
  const lower = text.toLowerCase()
  let pos = 0
  while (pos < text.length) {
    // If we're sitting inside an already-claimed brain link span, copy it verbatim.
    const claim = claimed.find(([s, e]) => pos >= s && pos < e)
    if (claim) {
      out.push(text.slice(pos, claim[1]))
      pos = claim[1]
      continue
    }

    const match = findLongestMatchAt(text, lower, pos, names, entityMap, linkedIds, claimed)
    if (match) {
      out.push(`[${match.raw}](brain:${match.nodeId})`)
      linkedIds.add(match.nodeId)
      pos = match.end
      continue
    }

    out.push(text[pos]!)
    pos += 1
  }

  return out.join('')
}

interface ServerMatch {
  end: number
  raw: string
  nodeId: string
}

function findLongestMatchAt(
  text: string,
  lower: string,
  pos: number,
  sortedNames: string[],
  entityMap: EntityMap,
  linkedIds: Set<string>,
  claimed: Array<[number, number]>,
): ServerMatch | null {
  // Enforce a word boundary before pos — matches the prior `\b` regex semantics
  // and prevents matching mid-word (e.g. "Hits" inside "Lethals").
  if (!isLeftBoundary(text, pos)) return null

  for (const name of sortedNames) {
    const end = pos + name.length
    if (end > text.length) continue
    if (lower.slice(pos, end) !== name) continue
    if (!isRightBoundary(text, end)) continue
    // The matched span must not overlap any claimed (existing-link) range.
    if (claimed.some(([s, e]) => pos < e && end > s)) continue

    const entity = entityMap.get(name)
    if (!entity) continue
    if (linkedIds.has(entity.nodeId)) continue // already linked first occurrence

    return { end, raw: text.slice(pos, end), nodeId: entity.nodeId }
  }
  return null
}

function isLeftBoundary(text: string, pos: number): boolean {
  if (pos === 0) return true
  const prev = text.charCodeAt(pos - 1)
  const cur = text.charCodeAt(pos)
  return isWordChar(prev) !== isWordChar(cur)
}

function isRightBoundary(text: string, pos: number): boolean {
  if (pos === text.length) return true
  const prev = text.charCodeAt(pos - 1)
  const cur = text.charCodeAt(pos)
  return isWordChar(prev) !== isWordChar(cur)
}

function isWordChar(code: number): boolean {
  // [A-Za-z0-9_] — JS regex \w semantics for ASCII.
  return (
    (code >= 48 && code <= 57) || // 0-9
    (code >= 65 && code <= 90) || // A-Z
    (code >= 97 && code <= 122) || // a-z
    code === 95 // _
  )
}

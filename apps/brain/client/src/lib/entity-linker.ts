export interface EntityInfo {
  type: 'unit' | 'stratagem' | 'enhancement' | 'rule' | 'mechanic'
  nodeId: string
}

export type EntityMap = Map<string, EntityInfo> // lowercase name → info

export interface TextSegment {
  text: string
  entity?: EntityInfo // present if this segment is a linked entity
}

/**
 * Split text into segments — some plain text, some linked entities.
 *
 * Rules:
 * - Matches are case-insensitive; original casing is preserved in segment text
 * - Longest match wins at any given position
 * - Weapon ability tags like `[DEVASTATING WOUNDS]` are matchable (brackets kept in output,
 *   inner text without brackets used for lookup)
 * - Overlapping matches: take the first/longest, skip the overlapped region
 * - Empty text segments are filtered out of the result
 */
export function linkEntities(text: string, entities: EntityMap): TextSegment[] {
  if (!text) return []
  if (entities.size === 0) return [{ text }]

  // Sort entity names longest-first so we always prefer longer candidates at each position
  const sortedNames = Array.from(entities.keys()).sort((a, b) => b.length - a.length)

  const segments: TextSegment[] = []
  let pos = 0

  while (pos < text.length) {
    const match = findLongestMatchAt(text, pos, sortedNames, entities)

    if (match) {
      // Entity match starts exactly here
      segments.push({ text: match.raw, entity: match.info })
      pos = match.end
    } else {
      // No match at this position — find the next position that has a match
      let nextMatchPos = -1
      for (let i = pos + 1; i < text.length; i++) {
        const m = findLongestMatchAt(text, i, sortedNames, entities)
        if (m) {
          nextMatchPos = i
          break
        }
      }

      // Emit plain text from pos up to the next match (or end of string)
      const plainEnd = nextMatchPos === -1 ? text.length : nextMatchPos
      segments.push({ text: text.slice(pos, plainEnd) })
      pos = plainEnd
    }
  }

  return segments.filter((s) => s.text !== '')
}

interface MatchResult {
  end: number
  raw: string // original text slice (preserves casing)
  info: EntityInfo
}

/**
 * Try to find the longest entity match starting at exactly `pos` in `text`.
 * Also handles bracketed tags: if text has `[FOO BAR]` and "foo bar" is in entities,
 * the match covers the whole `[FOO BAR]` including brackets.
 *
 * sortedNames must be sorted longest-first to ensure longest-match-wins semantics.
 */
function findLongestMatchAt(
  text: string,
  pos: number,
  sortedNames: string[],
  entities: EntityMap,
): MatchResult | null {
  for (const name of sortedNames) {
    // Plain match: text at pos matches `name` case-insensitively
    const candidate = text.slice(pos, pos + name.length)
    if (candidate.toLowerCase() === name) {
      return { end: pos + name.length, raw: candidate, info: entities.get(name)! }
    }

    // Bracketed match: text[pos] === '[' and inner content matches the entity name
    if (text[pos] === '[') {
      const closeIdx = text.indexOf(']', pos)
      if (closeIdx !== -1) {
        const inner = text.slice(pos + 1, closeIdx)
        if (inner.toLowerCase() === name) {
          const raw = text.slice(pos, closeIdx + 1)
          return { end: closeIdx + 1, raw, info: entities.get(name)! }
        }
      }
    }
  }
  return null
}

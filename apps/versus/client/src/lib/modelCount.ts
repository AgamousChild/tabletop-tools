import type { UnitComposition } from '@tabletop-tools/game-data-store'

/**
 * Parse the default model count from unit compositions.
 * Returns the smallest model count found, or null if unparsable.
 */
export function parseModelCount(compositions: UnitComposition[]): number | null {
  const counts: number[] = []
  for (const comp of compositions) {
    const match = comp.description.match(/(\d+)\s*model/i)
    if (match) {
      counts.push(parseInt(match[1]!, 10))
      continue
    }
    const leading = comp.description.match(/^(\d+)\s/)
    if (leading) {
      counts.push(parseInt(leading[1]!, 10))
    }
  }
  if (counts.length === 0) return null
  return Math.min(...counts)
}

import type { UnitComposition, UnitCost } from '@tabletop-tools/game-data-store'

export type ModelOption = {
  modelCount: number
  points: number
  description: string
}

function extractModelCount(description: string): number | null {
  const modelMatch = description.match(/(\d+)\s*model/i)
  if (modelMatch) return parseInt(modelMatch[1]!, 10)

  const leadingMatch = description.match(/^(\d+)\s/)
  if (leadingMatch) return parseInt(leadingMatch[1]!, 10)

  return null
}

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

/**
 * Parse model count options from unit costs + compositions.
 * Returns selectable options with model count and points cost.
 */
export function parseModelOptions(
  compositions: UnitComposition[],
  costs: UnitCost[],
): ModelOption[] {
  if (costs.length === 0) return []

  const compByLine = new Map<string, UnitComposition>()
  for (const comp of compositions) {
    compByLine.set(comp.line, comp)
  }

  const options: ModelOption[] = []

  for (const cost of costs) {
    const points = parseInt(cost.cost, 10) || 0

    let modelCount = extractModelCount(cost.description)

    if (modelCount === null) {
      const comp = compByLine.get(cost.line)
      if (comp) {
        modelCount = extractModelCount(comp.description)
      }
    }

    if (modelCount === null) continue

    options.push({ modelCount, points, description: cost.description })
  }

  options.sort((a, b) => a.modelCount - b.modelCount)
  return options
}

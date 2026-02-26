import type { UnitComposition, UnitCost } from '@tabletop-tools/game-data-store'

export type ModelOption = {
  modelCount: number
  points: number
  description: string
}

function extractModelCount(description: string): number | null {
  // Match patterns like "5 models", "10 models", "5 model"
  const modelMatch = description.match(/(\d+)\s*model/i)
  if (modelMatch) return parseInt(modelMatch[1]!, 10)

  // Try leading number: "5 Intercessors" — only if it's the first token
  const leadingMatch = description.match(/^(\d+)\s/)
  if (leadingMatch) return parseInt(leadingMatch[1]!, 10)

  return null
}

export function parseModelOptions(
  compositions: UnitComposition[],
  costs: UnitCost[],
): ModelOption[] {
  if (costs.length === 0) return []

  // Build a map of line -> composition for correlation
  const compByLine = new Map<string, UnitComposition>()
  for (const comp of compositions) {
    compByLine.set(comp.line, comp)
  }

  const options: ModelOption[] = []

  for (const cost of costs) {
    const points = parseInt(cost.cost, 10) || 0

    // Try to extract model count from cost description first (most reliable)
    let modelCount = extractModelCount(cost.description)

    // Fall back to matching composition description
    if (modelCount === null) {
      const comp = compByLine.get(cost.line)
      if (comp) {
        modelCount = extractModelCount(comp.description)
      }
    }

    // If we still can't parse, skip this entry
    if (modelCount === null) continue

    options.push({
      modelCount,
      points,
      description: cost.description,
    })
  }

  // Sort by model count ascending
  options.sort((a, b) => a.modelCount - b.modelCount)

  return options
}

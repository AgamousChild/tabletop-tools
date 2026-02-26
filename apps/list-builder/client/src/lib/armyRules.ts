export type BattleSize = {
  name: string
  points: number
  maxDuplicates: number
  description: string
}

export const BATTLE_SIZES: BattleSize[] = [
  { name: 'Incursion', points: 500, maxDuplicates: 1, description: 'Small-scale skirmish' },
  { name: 'Strike Force', points: 1000, maxDuplicates: 2, description: 'Standard matched play' },
  { name: 'Strike Force', points: 2000, maxDuplicates: 3, description: 'Tournament standard' },
  { name: 'Onslaught', points: 3000, maxDuplicates: 3, description: 'Large-scale battle' },
]

export type ListUnit = {
  unitContentId: string
  unitName: string
  unitPoints: number
  count: number
  isWarlord?: boolean
}

export type ValidationError = {
  type: 'OVER_POINTS' | 'DUPLICATE_LIMIT' | 'NO_WARLORD'
  message: string
}

export function validateArmy(
  units: ListUnit[],
  battleSize: BattleSize,
): ValidationError[] {
  const errors: ValidationError[] = []

  // Check points total
  const totalPts = units.reduce((sum, u) => sum + u.unitPoints * u.count, 0)
  if (totalPts > battleSize.points) {
    errors.push({
      type: 'OVER_POINTS',
      message: `${totalPts}/${battleSize.points}pts — over by ${totalPts - battleSize.points}`,
    })
  }

  // Check duplicate limits (group by unitContentId)
  const counts = new Map<string, number>()
  for (const u of units) {
    const current = counts.get(u.unitContentId) ?? 0
    counts.set(u.unitContentId, current + u.count)
  }
  for (const [, count] of counts) {
    if (count > battleSize.maxDuplicates) {
      const unit = units.find((u) => counts.get(u.unitContentId) === count)
      errors.push({
        type: 'DUPLICATE_LIMIT',
        message: `${unit?.unitName ?? 'Unit'}: ${count}× exceeds limit of ${battleSize.maxDuplicates}`,
      })
    }
  }

  // Check warlord
  if (units.length > 0 && !units.some((u) => u.isWarlord)) {
    errors.push({
      type: 'NO_WARLORD',
      message: 'No Warlord designated — select a Character as your Warlord',
    })
  }

  return errors
}

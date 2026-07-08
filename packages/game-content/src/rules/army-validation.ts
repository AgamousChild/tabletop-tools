// Army list validation rules — shared between client (list-builder UI) and
// server (list-v2 router hard gate, Phase 3 of the W2 consolidation roadmap).
//
// `BattleSize` is accepted as a parameter rather than owned by this module.
// The canonical battle-size data currently lives as a hardcoded constant in
// each caller; a `battle_size` DB table is being introduced separately
// (W2 roadmap Phase 2/3). Keeping the shape here decoupled from the data
// source means this validation engine doesn't need to change when the data
// moves from a hardcoded array to a DB-backed lookup — only the caller does.

export type BattleSize = {
  name: string
  points: number
  maxDuplicates: number
  description: string
}

export type ListUnit = {
  unitContentId: string
  unitName: string
  unitPoints: number
  count: number
  isWarlord?: boolean
  role?: string
}

export type ValidationError = {
  type: 'OVER_POINTS' | 'DUPLICATE_LIMIT' | 'NO_WARLORD'
  message: string
}

export function validateArmy(units: ListUnit[], battleSize: BattleSize): ValidationError[] {
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
  // Battleline units are exempt from duplicate limits per matched play rules
  const counts = new Map<string, number>()
  for (const u of units) {
    const current = counts.get(u.unitContentId) ?? 0
    counts.set(u.unitContentId, current + u.count)
  }
  for (const [unitId, count] of counts) {
    const unit = units.find((u) => u.unitContentId === unitId)
    const isBattleline = unit?.role?.toLowerCase() === 'battleline'
    if (!isBattleline && count > battleSize.maxDuplicates) {
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

export type MatchRecord = {
  unitIds: string[]
  won: boolean
  // Optional: points cost per unit at the time of the match
  unitPoints?: Record<string, number>
}

export type UnitRatingResult = {
  unitContentId: string
  rating: 'S' | 'A' | 'B' | 'C' | 'D'
  winContrib: number  // win rate when this unit is present (0–1)
  ptsEff: number      // wins per 100 points (0+)
  metaWindow: string
  computedAt: number
}

// Minimum appearances required to compute a meaningful rating
const MIN_APPEARANCES = 3

/**
 * Assign a letter grade based on win-rate contribution.
 * Thresholds are based on expected 40K tournament win rates:
 * - 50% is average, 60%+ is strong, 75%+ is dominant
 */
export function assignGrade(winContrib: number): 'S' | 'A' | 'B' | 'C' | 'D' {
  if (winContrib >= 0.75) return 'S'
  if (winContrib >= 0.60) return 'A'
  if (winContrib >= 0.45) return 'B'
  if (winContrib >= 0.30) return 'C'
  return 'D'
}

/**
 * Compute unit ratings from a set of match records for a given meta window.
 * Pure function — no DB dependency.
 */
export function computeRatings(records: MatchRecord[], metaWindow: string): UnitRatingResult[] {
  if (records.length === 0) return []

  // Aggregate per-unit stats
  const stats = new Map<string, { wins: number; games: number; totalPoints: number; pointsSeen: number }>()

  for (const record of records) {
    for (const unitId of record.unitIds) {
      const existing = stats.get(unitId) ?? { wins: 0, games: 0, totalPoints: 0, pointsSeen: 0 }
      const pts = record.unitPoints?.[unitId]
      stats.set(unitId, {
        wins: existing.wins + (record.won ? 1 : 0),
        games: existing.games + 1,
        totalPoints: pts != null ? existing.totalPoints + pts : existing.totalPoints,
        pointsSeen: pts != null ? existing.pointsSeen + 1 : existing.pointsSeen,
      })
    }
  }

  const now = Date.now()
  const results: UnitRatingResult[] = []

  for (const [unitId, s] of stats) {
    if (s.games < MIN_APPEARANCES) continue

    const winContrib = s.wins / s.games

    // Points efficiency: wins per 100 points.
    // If no point data is available, fall back to winContrib (neutral pts_eff).
    const avgPoints = s.pointsSeen > 0 ? s.totalPoints / s.pointsSeen : 100
    const ptsEff = (winContrib / avgPoints) * 100

    results.push({
      unitContentId: unitId,
      rating: assignGrade(winContrib),
      winContrib,
      ptsEff,
      metaWindow,
      computedAt: now,
    })
  }

  return results
}

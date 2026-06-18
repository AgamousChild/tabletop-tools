/**
 * Metric-stack-driven standings engine.
 *
 * The sort order is defined entirely by the caller-supplied metric stack — an ordered array of
 * MetricKey strings read from tournament_pairing_metric or tournament_placing_metric rows.
 * No dictionary of metric keys lives in this file; the engine consumes whatever keys the DB
 * provides and applies them as a chain of comparators.
 *
 * Built-in metric keys (must match ranking_metric.key values seeded in the DB):
 *   wins, losses, draws, battle_points, vp_against, vp_margin, sos_wins, registered_at
 *
 * Unknown keys are silently skipped.
 */

export type MetricKey = string

export type MetricStackEntry = {
  key: MetricKey
  enabled: boolean
}

export type PlayerStandingInput = {
  id: string
  displayName: string
  faction: string
  factionEntityId?: string | null
  detachmentEntityId?: string | null
  registeredAt: number
  placement?: number | null
}

export type ResultInput = {
  player1Id: string
  player2Id: string | null
  player1Vp: number
  player2Vp: number
  result: 'P1_WIN' | 'P2_WIN' | 'DRAW' | 'BYE'
}

export type PlayerMetrics = {
  wins: number
  losses: number
  draws: number
  /** Total VP scored by this player */
  battle_points: number
  /** Total VP scored against this player */
  vp_against: number
  /** battle_points - vp_against */
  vp_margin: number
  /** Sum of opponents' win percentages (Strength of Schedule) */
  sos_wins: number
  /** Registration timestamp — lower = earlier = tiebreaks first */
  registered_at: number
  opponents: string[]
}

export type PlayerStanding = {
  rank: number
  id: string
  displayName: string
  faction: string
  factionEntityId?: string | null
  detachmentEntityId?: string | null
  placement?: number | null
  metrics: PlayerMetrics
}

function buildMetrics(
  players: PlayerStandingInput[],
  results: ResultInput[],
): Map<string, PlayerMetrics> {
  const record = new Map<string, PlayerMetrics>()

  for (const p of players) {
    record.set(p.id, {
      wins: 0,
      losses: 0,
      draws: 0,
      battle_points: 0,
      vp_against: 0,
      vp_margin: 0,
      sos_wins: 0,
      registered_at: p.registeredAt,
      opponents: [],
    })
  }

  for (const r of results) {
    const p1 = record.get(r.player1Id)
    if (!p1) continue

    if (r.result === 'BYE') {
      p1.wins += 1
      continue
    }

    const p2 = r.player2Id ? record.get(r.player2Id) : undefined

    p1.battle_points += r.player1Vp
    p1.vp_against += r.player2Vp

    if (p2) {
      p2.battle_points += r.player2Vp
      p2.vp_against += r.player1Vp
      if (r.player2Id) {
        p1.opponents.push(r.player2Id)
        p2.opponents.push(r.player1Id)
      }
    }

    if (r.result === 'P1_WIN') {
      p1.wins += 1
      if (p2) p2.losses += 1
    } else if (r.result === 'P2_WIN') {
      p1.losses += 1
      if (p2) p2.wins += 1
    } else if (r.result === 'DRAW') {
      p1.draws += 1
      if (p2) p2.draws += 1
    }
  }

  // Compute derived metrics after all results are processed
  for (const [playerId, m] of record) {
    m.vp_margin = m.battle_points - m.vp_against

    // SOS: average win% of opponents
    if (m.opponents.length > 0) {
      let total = 0
      for (const oppId of m.opponents) {
        const opp = record.get(oppId)
        if (!opp) continue
        const gamesPlayed = opp.wins + opp.losses + opp.draws
        total += gamesPlayed > 0 ? opp.wins / gamesPlayed : 0
      }
      m.sos_wins = total / m.opponents.length
    }

    // Suppress unused-variable warning
    void playerId
  }

  return record
}

function getMetricValue(metrics: PlayerMetrics, key: MetricKey): number {
  switch (key) {
    case 'wins':
      return metrics.wins
    case 'losses':
      return metrics.losses
    case 'draws':
      return metrics.draws
    case 'battle_points':
      return metrics.battle_points
    case 'vp_against':
      return metrics.vp_against
    case 'vp_margin':
      return metrics.vp_margin
    case 'sos_wins':
      return metrics.sos_wins
    case 'registered_at':
      return metrics.registered_at
    default:
      return 0
  }
}

/**
 * Keys where LOWER value is better (ascending sort).
 * All others sort descending (higher is better).
 */
const ASCENDING_KEYS = new Set<MetricKey>(['losses', 'vp_against', 'registered_at'])

function compareByKey(aMetrics: PlayerMetrics, bMetrics: PlayerMetrics, key: MetricKey): number {
  const aVal = getMetricValue(aMetrics, key)
  const bVal = getMetricValue(bMetrics, key)
  if (aVal === bVal) return 0
  return ASCENDING_KEYS.has(key) ? aVal - bVal : bVal - aVal
}

/**
 * Compute standings using the provided metric stack as the tiebreaker chain.
 *
 * @param players   All registered players for the tournament.
 * @param results   All completed pairing results.
 * @param stack     Ordered metric stack (from tournament_pairing_metric or tournament_placing_metric).
 *                  Only entries with enabled=true are applied.
 */
export function computeMetricStandings(
  players: PlayerStandingInput[],
  results: ResultInput[],
  stack: MetricStackEntry[],
): PlayerStanding[] {
  const record = buildMetrics(players, results)
  const enabledStack = stack.filter((s) => s.enabled)

  const sorted = [...players].sort((a, b) => {
    const ma = record.get(a.id)!
    const mb = record.get(b.id)!

    for (const entry of enabledStack) {
      const cmp = compareByKey(ma, mb, entry.key)
      if (cmp !== 0) return cmp
    }
    // Final fallback: registration order
    return ma.registered_at - mb.registered_at
  })

  return sorted.map((p, i) => {
    const m = record.get(p.id)!
    return {
      rank: i + 1,
      id: p.id,
      displayName: p.displayName,
      faction: p.faction,
      factionEntityId: p.factionEntityId,
      detachmentEntityId: p.detachmentEntityId,
      placement: p.placement,
      metrics: m,
    }
  })
}

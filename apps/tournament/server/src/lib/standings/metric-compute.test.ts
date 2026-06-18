import { describe, expect, it } from 'vitest'

import {
  computeMetricStandings,
  type MetricStackEntry,
  type PlayerStandingInput,
  type ResultInput,
} from './metric-compute'

const players: PlayerStandingInput[] = [
  { id: 'p1', displayName: 'Alice', faction: 'Space Marines', registeredAt: 1 },
  { id: 'p2', displayName: 'Bob', faction: 'Orks', registeredAt: 2 },
  { id: 'p3', displayName: 'Carol', faction: 'Necrons', registeredAt: 3 },
  { id: 'p4', displayName: 'Dave', faction: 'Tau', registeredAt: 4 },
]

// Standard stack matching legacy compute.ts behavior
const defaultStack: MetricStackEntry[] = [
  { key: 'wins', enabled: true },
  { key: 'vp_margin', enabled: true },
  { key: 'sos_wins', enabled: true },
  { key: 'battle_points', enabled: true },
  { key: 'registered_at', enabled: true },
]

describe('computeMetricStandings', () => {
  it('ranks by wins descending (first metric in stack)', () => {
    const results: ResultInput[] = [
      { player1Id: 'p1', player2Id: 'p2', player1Vp: 80, player2Vp: 40, result: 'P1_WIN' },
      { player1Id: 'p3', player2Id: 'p4', player1Vp: 60, player2Vp: 70, result: 'P2_WIN' },
      { player1Id: 'p1', player2Id: 'p4', player1Vp: 75, player2Vp: 50, result: 'P1_WIN' },
      { player1Id: 'p3', player2Id: 'p2', player1Vp: 55, player2Vp: 65, result: 'P2_WIN' },
    ]
    const standings = computeMetricStandings(players, results, defaultStack)
    expect(standings[0].id).toBe('p1')
    expect(standings[0].metrics.wins).toBe(2)
    expect(standings[0].rank).toBe(1)
  })

  it('uses vp_margin as second tiebreaker', () => {
    const results: ResultInput[] = [
      { player1Id: 'p1', player2Id: 'p3', player1Vp: 80, player2Vp: 40, result: 'P1_WIN' }, // +40
      { player1Id: 'p2', player2Id: 'p4', player1Vp: 65, player2Vp: 55, result: 'P1_WIN' }, // +10
    ]
    const standings = computeMetricStandings(players, results, defaultStack)
    expect(standings[0].id).toBe('p1')
    expect(standings[1].id).toBe('p2')
  })

  it('uses sos_wins as third tiebreaker', () => {
    // p1 beat p3 (who later wins), p2 beat p4 (who later loses) — p1 has higher SOS
    const results: ResultInput[] = [
      { player1Id: 'p1', player2Id: 'p3', player1Vp: 60, player2Vp: 50, result: 'P1_WIN' },
      { player1Id: 'p2', player2Id: 'p4', player1Vp: 60, player2Vp: 50, result: 'P1_WIN' },
      { player1Id: 'p3', player2Id: 'p4', player1Vp: 65, player2Vp: 55, result: 'P1_WIN' }, // p3 wins
    ]
    const standings = computeMetricStandings(players, results, defaultStack)
    expect(standings[0].id).toBe('p1') // p1's opp (p3) has 1W, p2's opp (p4) has 0W
  })

  it('handles BYE — counts as win, zero VP margin contribution', () => {
    const results: ResultInput[] = [
      { player1Id: 'p1', player2Id: null, player1Vp: 0, player2Vp: 0, result: 'BYE' },
      { player1Id: 'p2', player2Id: 'p3', player1Vp: 70, player2Vp: 50, result: 'P1_WIN' },
    ]
    const standings = computeMetricStandings(players, results, defaultStack)
    const p1 = standings.find((s) => s.id === 'p1')!
    expect(p1.metrics.wins).toBe(1)
    expect(p1.metrics.vp_margin).toBe(0)
  })

  it('correctly accumulates battle_points across multiple rounds', () => {
    const results: ResultInput[] = [
      { player1Id: 'p1', player2Id: 'p2', player1Vp: 80, player2Vp: 40, result: 'P1_WIN' },
      { player1Id: 'p1', player2Id: 'p3', player1Vp: 70, player2Vp: 50, result: 'P1_WIN' },
    ]
    const standings = computeMetricStandings(players, results, defaultStack)
    const p1 = standings.find((s) => s.id === 'p1')!
    expect(p1.metrics.battle_points).toBe(150)
  })

  it('includes all players even with no results', () => {
    const standings = computeMetricStandings(players, [], defaultStack)
    expect(standings).toHaveLength(4)
    standings.forEach((s) => {
      expect(s.metrics.wins).toBe(0)
      expect(s.metrics.losses).toBe(0)
      expect(s.metrics.draws).toBe(0)
    })
  })

  it('respects custom metric stack order from DB (battle_points-first)', () => {
    const bpFirstStack: MetricStackEntry[] = [
      { key: 'battle_points', enabled: true },
      { key: 'wins', enabled: true },
    ]
    const results: ResultInput[] = [
      // p1 wins with low VP, p2 loses with high VP
      { player1Id: 'p1', player2Id: 'p2', player1Vp: 55, player2Vp: 90, result: 'P1_WIN' },
    ]
    const standings = computeMetricStandings(players, results, bpFirstStack)
    // battle_points first: p2 (90) > p1 (55) → p2 ranks first despite losing
    expect(standings[0].id).toBe('p2')
  })

  it('skips disabled entries in the metric stack', () => {
    const stackWithDisabled: MetricStackEntry[] = [
      { key: 'wins', enabled: true },
      { key: 'vp_margin', enabled: false }, // disabled — should not affect sort
      { key: 'registered_at', enabled: true },
    ]
    const results: ResultInput[] = [
      // p1 and p2 both 1 win, different margins — but margin is disabled
      { player1Id: 'p1', player2Id: 'p3', player1Vp: 80, player2Vp: 40, result: 'P1_WIN' }, // +40
      { player1Id: 'p2', player2Id: 'p4', player1Vp: 65, player2Vp: 55, result: 'P1_WIN' }, // +10
    ]
    const standings = computeMetricStandings(players, results, stackWithDisabled)
    // margin disabled → tied on wins → falls to registered_at → p1 (registeredAt=1) before p2 (=2)
    const p1Rank = standings.find((s) => s.id === 'p1')!.rank
    const p2Rank = standings.find((s) => s.id === 'p2')!.rank
    expect(p1Rank).toBeLessThan(p2Rank)
  })

  it('returns ranks starting at 1', () => {
    const standings = computeMetricStandings(players, [], defaultStack)
    expect(standings[0].rank).toBe(1)
    expect(standings[standings.length - 1].rank).toBe(players.length)
  })
})

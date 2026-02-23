import { describe, expect, it } from 'vitest'

import { computeStandings } from './compute'

type PlayerInput = {
  id: string
  displayName: string
  faction: string
  registeredAt: number
}

type ResultInput = {
  player1Id: string
  player2Id: string | null
  player1Vp: number
  player2Vp: number
  result: 'P1_WIN' | 'P2_WIN' | 'DRAW' | 'BYE'
}

describe('computeStandings', () => {
  const players: PlayerInput[] = [
    { id: 'p1', displayName: 'Alice', faction: 'Space Marines', registeredAt: 1 },
    { id: 'p2', displayName: 'Bob', faction: 'Orks', registeredAt: 2 },
    { id: 'p3', displayName: 'Carol', faction: 'Necrons', registeredAt: 3 },
    { id: 'p4', displayName: 'Dave', faction: 'Tau', registeredAt: 4 },
  ]

  it('ranks by wins (descending)', () => {
    const results: ResultInput[] = [
      // Round 1
      { player1Id: 'p1', player2Id: 'p2', player1Vp: 80, player2Vp: 40, result: 'P1_WIN' },
      { player1Id: 'p3', player2Id: 'p4', player1Vp: 60, player2Vp: 70, result: 'P2_WIN' },
      // Round 2
      { player1Id: 'p1', player2Id: 'p4', player1Vp: 75, player2Vp: 50, result: 'P1_WIN' },
      { player1Id: 'p3', player2Id: 'p2', player1Vp: 55, player2Vp: 65, result: 'P2_WIN' },
    ]
    const standings = computeStandings(players, results)
    // p1: 2 wins, p2: 1 win, p4: 1 win, p3: 0
    expect(standings[0].id).toBe('p1')
    expect(standings[0].wins).toBe(2)
  })

  it('uses VP margin as tiebreaker (descending)', () => {
    const results: ResultInput[] = [
      // Round 1 — p1 and p2 both 1 win
      { player1Id: 'p1', player2Id: 'p3', player1Vp: 80, player2Vp: 40, result: 'P1_WIN' }, // +40
      { player1Id: 'p2', player2Id: 'p4', player1Vp: 65, player2Vp: 55, result: 'P1_WIN' }, // +10
    ]
    const standings = computeStandings(players, results)
    expect(standings[0].id).toBe('p1')
    expect(standings[1].id).toBe('p2')
  })

  it('uses strength of schedule as third tiebreaker', () => {
    // p1 beat p3 (who has 0 wins), p2 beat p4 (who has 0 wins)
    // p1 and p2 tied on wins and margin
    // we need to differentiate SOS: p1's opponent (p3) vs p2's opponent (p4)
    // After round 1: p3 vs p4 — p3 wins
    // Now p1 beat p3 (1 win) and p2 beat p4 (0 wins) → p1 has higher SOS
    const results: ResultInput[] = [
      { player1Id: 'p1', player2Id: 'p3', player1Vp: 60, player2Vp: 50, result: 'P1_WIN' },
      { player1Id: 'p2', player2Id: 'p4', player1Vp: 60, player2Vp: 50, result: 'P1_WIN' },
      { player1Id: 'p3', player2Id: 'p4', player1Vp: 65, player2Vp: 55, result: 'P1_WIN' },
    ]
    const standings = computeStandings(players, results)
    // p1 and p2 both 1 win, same margin (10)
    // p1's opponent p3 has 1 win / 2 games = 50% SOS
    // p2's opponent p4 has 0 wins / 2 games = 0% SOS
    expect(standings[0].id).toBe('p1')
  })

  it('computes correct win/loss/draw counts', () => {
    const results: ResultInput[] = [
      { player1Id: 'p1', player2Id: 'p2', player1Vp: 60, player2Vp: 60, result: 'DRAW' },
      { player1Id: 'p3', player2Id: 'p4', player1Vp: 70, player2Vp: 50, result: 'P1_WIN' },
    ]
    const standings = computeStandings(players, results)
    const p1 = standings.find((s) => s.id === 'p1')!
    const p3 = standings.find((s) => s.id === 'p3')!
    expect(p1.wins).toBe(0)
    expect(p1.losses).toBe(0)
    expect(p1.draws).toBe(1)
    expect(p3.wins).toBe(1)
    expect(p3.losses).toBe(0)
    expect(p3.draws).toBe(0)
  })

  it('handles BYE result — counts as WIN, 0 VP margin contribution', () => {
    const results: ResultInput[] = [
      { player1Id: 'p1', player2Id: null, player1Vp: 0, player2Vp: 0, result: 'BYE' },
      { player1Id: 'p2', player2Id: 'p3', player1Vp: 70, player2Vp: 50, result: 'P1_WIN' },
    ]
    const standings = computeStandings(players, results)
    const p1 = standings.find((s) => s.id === 'p1')!
    expect(p1.wins).toBe(1)
    expect(p1.margin).toBe(0) // bye contributes 0 margin
  })

  it('computes totalVP scored correctly', () => {
    const results: ResultInput[] = [
      { player1Id: 'p1', player2Id: 'p2', player1Vp: 80, player2Vp: 40, result: 'P1_WIN' },
      { player1Id: 'p1', player2Id: 'p3', player1Vp: 70, player2Vp: 50, result: 'P1_WIN' },
    ]
    const standings = computeStandings(players, results)
    const p1 = standings.find((s) => s.id === 'p1')!
    expect(p1.totalVP).toBe(150)
  })

  it('returns rank starting at 1', () => {
    const results: ResultInput[] = [
      { player1Id: 'p1', player2Id: 'p2', player1Vp: 80, player2Vp: 40, result: 'P1_WIN' },
    ]
    const standings = computeStandings(players, results)
    expect(standings[0].rank).toBe(1)
    expect(standings[standings.length - 1].rank).toBe(players.length)
  })

  it('includes all players even with no results', () => {
    const standings = computeStandings(players, [])
    expect(standings).toHaveLength(4)
    standings.forEach((s) => {
      expect(s.wins).toBe(0)
      expect(s.losses).toBe(0)
      expect(s.draws).toBe(0)
    })
  })
})

import { describe, expect, it } from 'vitest'

import { generatePairings } from './pairings'

type Player = {
  id: string
  displayName: string
  wins: number
  losses: number
  draws: number
  margin: number
  strengthOfSchedule: number
  registeredAt: number
}

type PrevPairing = { player1Id: string; player2Id: string | null }

function makePlayer(id: string, wins = 0, losses = 0, registeredAt = 0): Player {
  return { id, displayName: id, wins, losses, draws: 0, margin: 0, strengthOfSchedule: 0, registeredAt }
}

describe('generatePairings', () => {
  it('pairs all players in round 1 (even count)', () => {
    const players = [
      makePlayer('p1', 0, 0, 1),
      makePlayer('p2', 0, 0, 2),
      makePlayer('p3', 0, 0, 3),
      makePlayer('p4', 0, 0, 4),
    ]
    const result = generatePairings(players, [])
    expect(result.pairings).toHaveLength(2)
    expect(result.bye).toBeNull()
    // all players appear exactly once
    const ids = result.pairings.flatMap((p) => [p.player1Id, p.player2Id])
    expect(ids.sort()).toEqual(['p1', 'p2', 'p3', 'p4'].sort())
  })

  it('gives a bye when odd number of players', () => {
    const players = [
      makePlayer('p1', 0, 0, 1),
      makePlayer('p2', 0, 0, 2),
      makePlayer('p3', 0, 0, 3),
    ]
    const result = generatePairings(players, [])
    expect(result.pairings).toHaveLength(1)
    expect(result.bye).not.toBeNull()
    // the pairing has 2 players, the bye has 1
    const pairedIds = result.pairings.flatMap((p) => [p.player1Id, p.player2Id])
    const allIds = [...pairedIds, result.bye]
    expect(allIds.sort()).toEqual(['p1', 'p2', 'p3'].sort())
  })

  it('pairs top half vs bottom half within win group', () => {
    // 4 players all 1 win: 1st pairs vs 3rd, 2nd pairs vs 4th
    const players = [
      makePlayer('p1', 1, 0, 1),
      makePlayer('p2', 1, 0, 2),
      makePlayer('p3', 1, 0, 3),
      makePlayer('p4', 1, 0, 4),
    ]
    const result = generatePairings(players, [])
    // top 1 vs top 3 (by registration order as tiebreaker)
    expect(result.pairings).toHaveLength(2)
    const pairedIds = result.pairings.map((p) => [p.player1Id, p.player2Id].sort().join('-')).sort()
    expect(pairedIds).toEqual(['p1-p3', 'p2-p4'].sort())
  })

  it('avoids rematches — swaps adjacent pair', () => {
    const players = [
      makePlayer('p1', 1, 0, 1),
      makePlayer('p2', 1, 0, 2),
      makePlayer('p3', 1, 0, 3),
      makePlayer('p4', 1, 0, 4),
    ]
    // p1 and p3 already played
    const prev: PrevPairing[] = [{ player1Id: 'p1', player2Id: 'p3' }]
    const result = generatePairings(players, prev)
    // p1 should NOT be paired with p3
    const p1Pairing = result.pairings.find((p) => p.player1Id === 'p1' || p.player2Id === 'p1')!
    const p1Opponent = p1Pairing.player1Id === 'p1' ? p1Pairing.player2Id : p1Pairing.player1Id
    expect(p1Opponent).not.toBe('p3')
  })

  it('bye goes to lowest-ranked player', () => {
    const players = [
      makePlayer('p1', 2, 0, 1),
      makePlayer('p2', 1, 1, 2),
      makePlayer('p3', 0, 2, 3),
    ]
    const result = generatePairings(players, [])
    // lowest ranked = p3 (0 wins)
    expect(result.bye).toBe('p3')
  })

  it('assigns sequential table numbers starting at 1', () => {
    const players = [
      makePlayer('p1', 0, 0, 1),
      makePlayer('p2', 0, 0, 2),
      makePlayer('p3', 0, 0, 3),
      makePlayer('p4', 0, 0, 4),
    ]
    const result = generatePairings(players, [])
    const tables = result.pairings.map((p) => p.tableNumber).sort((a, b) => a - b)
    expect(tables).toEqual([1, 2])
  })

  it('splits into different win groups and pairs within groups', () => {
    // 2 players with 2 wins, 2 players with 1 win, 2 players with 0 wins
    const players = [
      makePlayer('p1', 2, 0, 1),
      makePlayer('p2', 2, 0, 2),
      makePlayer('p3', 1, 1, 3),
      makePlayer('p4', 1, 1, 4),
      makePlayer('p5', 0, 2, 5),
      makePlayer('p6', 0, 2, 6),
    ]
    const result = generatePairings(players, [])
    expect(result.pairings).toHaveLength(3)
    // p1 and p2 should be paired together (same 2-win group)
    const p1Pairing = result.pairings.find((p) => p.player1Id === 'p1' || p.player2Id === 'p1')!
    const p1Opp = p1Pairing.player1Id === 'p1' ? p1Pairing.player2Id : p1Pairing.player1Id
    expect(p1Opp).toBe('p2')
  })

  it('handles single player (returns empty pairings, bye for that player)', () => {
    const players = [makePlayer('p1', 0, 0, 1)]
    const result = generatePairings(players, [])
    expect(result.pairings).toHaveLength(0)
    expect(result.bye).toBe('p1')
  })

  it('handles empty player list', () => {
    const result = generatePairings([], [])
    expect(result.pairings).toHaveLength(0)
    expect(result.bye).toBeNull()
  })

  it('allows unavoidable rematch when no other option (small field)', () => {
    // 2 players who already played each other — must rematch
    const players = [makePlayer('p1', 1, 0, 1), makePlayer('p2', 0, 1, 2)]
    const prev: PrevPairing[] = [{ player1Id: 'p1', player2Id: 'p2' }]
    const result = generatePairings(players, prev)
    expect(result.pairings).toHaveLength(1)
    const pairedIds = [result.pairings[0].player1Id, result.pairings[0].player2Id].sort()
    expect(pairedIds).toEqual(['p1', 'p2'].sort())
  })
})

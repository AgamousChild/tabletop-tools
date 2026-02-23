import { describe, expect, it } from 'vitest'

import { computeRatings, assignGrade } from './score'

// A MatchRecord represents one tournament game result
// with the unit IDs that were in the list and their points costs
function match(unitIds: string[], won: boolean, unitPoints?: Record<string, number>) {
  return { unitIds, won, unitPoints: unitPoints ?? {} }
}

describe('computeRatings', () => {
  it('returns empty array for empty input', () => {
    expect(computeRatings([], '2025-Q2')).toEqual([])
  })

  it('unit in all winning lists gets high winContrib', () => {
    const records = [
      match(['u1', 'u2'], true),
      match(['u1', 'u3'], true),
      match(['u1', 'u4'], true),
    ]
    const ratings = computeRatings(records, '2025-Q2')
    const u1 = ratings.find((r) => r.unitContentId === 'u1')
    expect(u1).toBeDefined()
    expect(u1!.winContrib).toBeCloseTo(1.0)
    expect(u1!.rating).toBe('S')
  })

  it('unit in all losing lists gets low winContrib and D rating', () => {
    const records = [
      match(['u1', 'u2'], false),
      match(['u1', 'u3'], false),
      match(['u1', 'u4'], false),
    ]
    const ratings = computeRatings(records, '2025-Q2')
    const u1 = ratings.find((r) => r.unitContentId === 'u1')
    expect(u1).toBeDefined()
    expect(u1!.winContrib).toBeCloseTo(0.0)
    expect(u1!.rating).toBe('D')
  })

  it('unit with 50% win rate gets B rating', () => {
    const records = [
      match(['u1'], true),
      match(['u1'], true),
      match(['u1'], false),
      match(['u1'], false),
    ]
    const ratings = computeRatings(records, '2025-Q2')
    const u1 = ratings.find((r) => r.unitContentId === 'u1')
    expect(u1).toBeDefined()
    expect(u1!.winContrib).toBeCloseTo(0.5)
    // 50% win rate is close to average — B or C
    expect(['B', 'C']).toContain(u1!.rating)
  })

  it('points efficiency: same win rate, cheaper unit gets higher ptsEff', () => {
    // u1: 100pts, 60% win rate
    // u2: 200pts, 60% win rate
    const records = [
      match(['u1'], true, { u1: 100 }),
      match(['u1'], true, { u1: 100 }),
      match(['u1'], true, { u1: 100 }),
      match(['u1'], false, { u1: 100 }),
      match(['u1'], false, { u1: 100 }),
      match(['u2'], true, { u2: 200 }),
      match(['u2'], true, { u2: 200 }),
      match(['u2'], true, { u2: 200 }),
      match(['u2'], false, { u2: 200 }),
      match(['u2'], false, { u2: 200 }),
    ]
    const ratings = computeRatings(records, '2025-Q2')
    const u1 = ratings.find((r) => r.unitContentId === 'u1')
    const u2 = ratings.find((r) => r.unitContentId === 'u2')
    expect(u1).toBeDefined()
    expect(u2).toBeDefined()
    expect(u1!.winContrib).toBeCloseTo(u2!.winContrib) // same win rate
    expect(u1!.ptsEff).toBeGreaterThan(u2!.ptsEff) // u1 is cheaper → better pts eff
  })

  it('excludes units with fewer than 3 appearances', () => {
    const records = [
      match(['u1'], true),
      match(['u1'], false),
      // u1 has 2 appearances — should be excluded
      match(['u2'], true),
      match(['u2'], true),
      match(['u2'], true),
    ]
    const ratings = computeRatings(records, '2025-Q2')
    expect(ratings.find((r) => r.unitContentId === 'u1')).toBeUndefined()
    expect(ratings.find((r) => r.unitContentId === 'u2')).toBeDefined()
  })

  it('sets the meta window on all results', () => {
    const records = [match(['u1'], true), match(['u1'], true), match(['u1'], true)]
    const ratings = computeRatings(records, '2025-Q3')
    expect(ratings.every((r) => r.metaWindow === '2025-Q3')).toBe(true)
  })

  it('computes computedAt as a recent timestamp', () => {
    const before = Date.now()
    const records = [match(['u1'], true), match(['u1'], true), match(['u1'], true)]
    const ratings = computeRatings(records, '2025-Q2')
    const after = Date.now()
    expect(ratings[0]!.computedAt).toBeGreaterThanOrEqual(before)
    expect(ratings[0]!.computedAt).toBeLessThanOrEqual(after)
  })

  it('handles multiple units with mixed results', () => {
    const records = [
      match(['u1', 'u2'], true),
      match(['u1', 'u3'], false),
      match(['u2', 'u3'], true),
      match(['u1', 'u2'], false),
      match(['u2', 'u3'], false),
      // u1: 3 games, 1 win → 33%
      // u2: 4 games, 2 wins → 50%
      // u3: 3 games, 1 win → 33%
    ]
    const ratings = computeRatings(records, '2025-Q2')
    const u1 = ratings.find((r) => r.unitContentId === 'u1')
    const u2 = ratings.find((r) => r.unitContentId === 'u2')
    const u3 = ratings.find((r) => r.unitContentId === 'u3')
    expect(u1).toBeDefined()
    expect(u2).toBeDefined()
    expect(u3).toBeDefined()
    expect(u2!.winContrib).toBeGreaterThan(u1!.winContrib)
    expect(u2!.winContrib).toBeGreaterThan(u3!.winContrib)
  })
})

describe('assignGrade', () => {
  it('assigns S for winContrib >= 0.75', () => {
    expect(assignGrade(0.75)).toBe('S')
    expect(assignGrade(1.0)).toBe('S')
  })

  it('assigns A for winContrib >= 0.60', () => {
    expect(assignGrade(0.60)).toBe('A')
    expect(assignGrade(0.74)).toBe('A')
  })

  it('assigns B for winContrib >= 0.45', () => {
    expect(assignGrade(0.45)).toBe('B')
    expect(assignGrade(0.59)).toBe('B')
  })

  it('assigns C for winContrib >= 0.30', () => {
    expect(assignGrade(0.30)).toBe('C')
    expect(assignGrade(0.44)).toBe('C')
  })

  it('assigns D for winContrib < 0.30', () => {
    expect(assignGrade(0.0)).toBe('D')
    expect(assignGrade(0.29)).toBe('D')
  })
})

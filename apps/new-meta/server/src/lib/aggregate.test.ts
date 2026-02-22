import { describe, it, expect } from 'vitest'
import {
  computeFactionStats,
  computeDetachmentStats,
  computeTimeline,
  getTopLists,
  getWeekStart,
} from './aggregate.js'
import type { TournamentRecord } from '@tabletop-tools/game-content'

// ---- Fixtures ----

const EMPTY: TournamentRecord[] = []

const BASIC: TournamentRecord[] = [
  {
    eventName: 'GT Alpha',
    eventDate: '2025-06-09',
    format: 'GT',
    players: [
      { placement: 1, faction: 'Space Marines', wins: 5, losses: 0, draws: 0, points: 100 },
      { placement: 2, faction: 'Orks',          wins: 4, losses: 1, draws: 0, points: 80 },
      { placement: 3, faction: 'Necrons',        wins: 3, losses: 2, draws: 0, points: 60 },
      { placement: 4, faction: 'Orks',           wins: 2, losses: 3, draws: 0, points: 40 },
    ],
  },
]

const WITH_DETACHMENTS: TournamentRecord[] = [
  {
    eventName: 'GT Beta',
    eventDate: '2025-06-16',
    format: 'GT',
    players: [
      { placement: 1, faction: 'Space Marines', detachment: 'Gladius Task Force', wins: 5, losses: 0, draws: 0, points: 100 },
      { placement: 2, faction: 'Space Marines', detachment: 'Ironstorm Spearhead', wins: 4, losses: 1, draws: 0, points: 80 },
      { placement: 3, faction: 'Orks',          detachment: 'Waaagh Tribe',        wins: 3, losses: 2, draws: 0, points: 60 },
    ],
  },
]

const WITH_DRAWS: TournamentRecord[] = [
  {
    eventName: 'GT Gamma',
    eventDate: '2025-06-23',
    format: 'GT',
    players: [
      { placement: 1, faction: 'Aeldari', wins: 4, losses: 0, draws: 1, points: 90 },
      { placement: 2, faction: 'Aeldari', wins: 3, losses: 1, draws: 1, points: 70 },
    ],
  },
]

const MULTI_EVENT: TournamentRecord[] = [
  {
    eventName: 'GT Week 1',
    eventDate: '2025-06-09',
    format: 'GT',
    players: [
      { placement: 1, faction: 'Space Marines', wins: 5, losses: 0, draws: 0, points: 100 },
      { placement: 2, faction: 'Orks',          wins: 2, losses: 3, draws: 0, points: 40 },
    ],
  },
  {
    eventName: 'GT Week 2',
    eventDate: '2025-06-16',
    format: 'GT',
    players: [
      { placement: 1, faction: 'Orks',          wins: 5, losses: 0, draws: 0, points: 100 },
      { placement: 2, faction: 'Space Marines',  wins: 2, losses: 3, draws: 0, points: 40 },
    ],
  },
]

// ============================================================

describe('computeFactionStats — empty input', () => {
  it('returns empty array for no records', () => {
    expect(computeFactionStats(EMPTY)).toEqual([])
  })
})

describe('computeFactionStats — basic', () => {
  it('computes win rates correctly', () => {
    const stats = computeFactionStats(BASIC)
    const sm = stats.find((s) => s.faction === 'Space Marines')!
    const orks = stats.find((s) => s.faction === 'Orks')!

    expect(sm.wins).toBe(5)
    expect(sm.losses).toBe(0)
    expect(sm.games).toBe(5)
    expect(sm.winRate).toBe(1)

    // Two Ork players: 4W+2L+2W+3L = 6W 5L
    expect(orks.wins).toBe(6)
    expect(orks.losses).toBe(4)
    expect(orks.players).toBe(2)
  })

  it('sorts by win rate descending', () => {
    const stats = computeFactionStats(BASIC)
    for (let i = 0; i < stats.length - 1; i++) {
      expect(stats[i]!.winRate).toBeGreaterThanOrEqual(stats[i + 1]!.winRate)
    }
  })

  it('counts representation correctly', () => {
    const stats = computeFactionStats(BASIC)
    const total = stats.reduce((sum, s) => sum + s.players, 0)
    const repTotal = stats.reduce((sum, s) => sum + s.representationPct, 0)
    // All reps should sum to 1 (100%)
    expect(repTotal).toBeCloseTo(1, 5)
    expect(total).toBe(4)  // 4 players total
  })
})

describe('computeFactionStats — draws counted as 0.5', () => {
  it('counts draws as 0.5 wins', () => {
    const stats = computeFactionStats(WITH_DRAWS)
    const aeldari = stats.find((s) => s.faction === 'Aeldari')!
    // Player 1: 4W 0L 1D → (4 + 0.5) / 5 = 0.9
    // Player 2: 3W 1L 1D → (3 + 0.5) / 5 = 0.7
    // Combined: 7W 1L 2D → (7 + 1) / 10 = 0.8
    expect(aeldari.wins).toBe(7)
    expect(aeldari.draws).toBe(2)
    expect(aeldari.winRate).toBeCloseTo(0.8, 5)
  })
})

describe('computeFactionStats — empty faction string', () => {
  it('skips players with empty faction string', () => {
    const records: TournamentRecord[] = [
      {
        eventName: 'Test',
        eventDate: '2025-01-01',
        format: 'GT',
        players: [
          { placement: 1, faction: '', wins: 5, losses: 0, draws: 0, points: 100 },
          { placement: 2, faction: 'Necrons', wins: 3, losses: 2, draws: 0, points: 60 },
        ],
      },
    ]
    const stats = computeFactionStats(records)
    expect(stats).toHaveLength(1)
    expect(stats[0]!.faction).toBe('Necrons')
  })
})

// ============================================================

describe('computeDetachmentStats', () => {
  it('returns empty array for records without detachments', () => {
    expect(computeDetachmentStats(BASIC)).toEqual([])
  })

  it('groups by faction + detachment', () => {
    const stats = computeDetachmentStats(WITH_DETACHMENTS)
    expect(stats.length).toBe(3)

    const gladius = stats.find((s) => s.detachment === 'Gladius Task Force')!
    expect(gladius.faction).toBe('Space Marines')
    expect(gladius.wins).toBe(5)
    expect(gladius.winRate).toBe(1)
  })

  it('sorts by win rate descending', () => {
    const stats = computeDetachmentStats(WITH_DETACHMENTS)
    for (let i = 0; i < stats.length - 1; i++) {
      expect(stats[i]!.winRate).toBeGreaterThanOrEqual(stats[i + 1]!.winRate)
    }
  })
})

// ============================================================

describe('getTopLists', () => {
  it('returns all lists when no filter', () => {
    const lists = getTopLists(BASIC)
    expect(lists).toHaveLength(4)
  })

  it('filters by faction', () => {
    const lists = getTopLists(BASIC, { faction: 'Orks' })
    expect(lists).toHaveLength(2)
    expect(lists.every((l) => l.faction === 'Orks')).toBe(true)
  })

  it('filters by detachment', () => {
    const lists = getTopLists(WITH_DETACHMENTS, { detachment: 'Gladius Task Force' })
    expect(lists).toHaveLength(1)
    expect(lists[0]!.placement).toBe(1)
  })

  it('applies limit', () => {
    const lists = getTopLists(BASIC, { limit: 2 })
    expect(lists).toHaveLength(2)
  })

  it('sorts by placement ascending', () => {
    const lists = getTopLists(BASIC)
    for (let i = 0; i < lists.length - 1; i++) {
      expect(lists[i]!.placement).toBeLessThanOrEqual(lists[i + 1]!.placement)
    }
  })
})

// ============================================================

describe('computeTimeline', () => {
  it('returns empty array for no records', () => {
    expect(computeTimeline(EMPTY)).toEqual([])
  })

  it('groups by week correctly', () => {
    const points = computeTimeline(MULTI_EVENT)
    const weeks = [...new Set(points.map((p) => p.week))]
    expect(weeks).toHaveLength(2)
  })

  it('filters by faction', () => {
    const points = computeTimeline(MULTI_EVENT, 'Space Marines')
    expect(points.every((p) => p.faction === 'Space Marines')).toBe(true)
  })

  it('sorts by week ascending', () => {
    const points = computeTimeline(MULTI_EVENT)
    for (let i = 0; i < points.length - 1; i++) {
      expect(points[i]!.week <= points[i + 1]!.week).toBe(true)
    }
  })

  it('win rate flips between events for Orks', () => {
    const smPoints = computeTimeline(MULTI_EVENT, 'Space Marines').sort((a, b) =>
      a.week.localeCompare(b.week),
    )
    // Week 1: SM 5W 0L → 100%
    // Week 2: SM 2W 3L → 40%
    expect(smPoints[0]!.winRate).toBeCloseTo(1.0)
    expect(smPoints[1]!.winRate).toBeCloseTo(0.4)
  })
})

// ============================================================

describe('getWeekStart', () => {
  it('returns Monday for a Monday', () => {
    // 2025-06-09 is a Monday
    expect(getWeekStart('2025-06-09')).toBe('2025-06-09')
  })

  it('returns the previous Monday for a mid-week date', () => {
    // 2025-06-11 is a Wednesday → week start = 2025-06-09
    expect(getWeekStart('2025-06-11')).toBe('2025-06-09')
  })

  it('returns the previous Monday for a Sunday', () => {
    // 2025-06-15 is a Sunday → week start = 2025-06-09
    expect(getWeekStart('2025-06-15')).toBe('2025-06-09')
  })

  it('handles invalid date gracefully', () => {
    expect(getWeekStart('not-a-date')).toBe('not-a-date')
  })
})

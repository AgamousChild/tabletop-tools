import { describe, it, expect } from 'vitest'
import { parseStandingsFromRows, type BCPStanding } from './standings'

// We test the pure parsing logic only — Playwright navigation is not unit-testable.
// parseStandingsFromRows takes raw row data extracted from the page and produces BCPStanding[].

describe('parseStandingsFromRows', () => {
  it('parses a standard set of standing rows', () => {
    const rows = [
      { rank: '1', name: 'Alice Smith', faction: 'Space Marines', record: '5-0-2', points: '18' },
      { rank: '2', name: 'Bob Jones', faction: 'Chaos Daemons', record: '4-1-2', points: '16' },
      { rank: '3', name: 'Carol White', faction: 'Aeldari', record: '4-2-1', points: '14' },
    ]

    const result = parseStandingsFromRows(rows)

    expect(result).toHaveLength(3)
    expect(result[0]).toEqual<BCPStanding>({
      placement: 1,
      playerName: 'Alice Smith',
      faction: 'Space Marines',
      wins: 5,
      losses: 0,
      draws: 2,
      points: 18,
      armyListUrl: undefined,
    })
    expect(result[1]?.placement).toBe(2)
    expect(result[1]?.wins).toBe(4)
    expect(result[2]?.losses).toBe(2)
  })

  it('parses W/L/D separated columns (alternate format)', () => {
    const rows = [
      { rank: '1', name: 'Dave Black', faction: 'T\'au Empire', wins: '6', losses: '1', draws: '0', points: '21' },
    ]

    const result = parseStandingsFromRows(rows)

    expect(result[0]).toMatchObject({
      placement: 1,
      playerName: 'Dave Black',
      faction: "T'au Empire",
      wins: 6,
      losses: 1,
      draws: 0,
      points: 21,
    })
  })

  it('returns an empty array when given no rows', () => {
    expect(parseStandingsFromRows([])).toEqual([])
  })

  it('handles missing or blank fields gracefully with fallback defaults', () => {
    const rows = [
      { rank: '5', name: 'Eve Green', faction: '', record: '', points: '' },
    ]

    const result = parseStandingsFromRows(rows)

    expect(result).toHaveLength(1)
    expect(result[0]?.placement).toBe(5)
    expect(result[0]?.faction).toBe('')
    expect(result[0]?.wins).toBe(0)
    expect(result[0]?.losses).toBe(0)
    expect(result[0]?.draws).toBe(0)
    expect(result[0]?.points).toBe(0)
  })

  it('ignores rows with no player name', () => {
    const rows = [
      { rank: '1', name: 'Valid Player', faction: 'Orks', record: '3-2-2', points: '10' },
      { rank: '2', name: '', faction: 'Unknown', record: '2-3-2', points: '8' },
      { rank: '', name: '', faction: '', record: '', points: '' },
    ]

    const result = parseStandingsFromRows(rows)

    expect(result).toHaveLength(1)
    expect(result[0]?.playerName).toBe('Valid Player')
  })

  it('handles draws-only record strings like "0-0-7"', () => {
    const rows = [
      { rank: '1', name: 'Frank', faction: 'Necrons', record: '0-0-7', points: '7' },
    ]

    const result = parseStandingsFromRows(rows)

    expect(result[0]).toMatchObject({ wins: 0, losses: 0, draws: 7 })
  })

  it('preserves armyListUrl when provided in row data', () => {
    const rows = [
      {
        rank: '1',
        name: 'Grace',
        faction: 'Death Guard',
        record: '4-1-2',
        points: '14',
        armyListUrl: 'https://www.bestcoastpairings.com/event/abc123/player/xyz',
      },
    ]

    const result = parseStandingsFromRows(rows)

    expect(result[0]?.armyListUrl).toBe(
      'https://www.bestcoastpairings.com/event/abc123/player/xyz',
    )
  })
})

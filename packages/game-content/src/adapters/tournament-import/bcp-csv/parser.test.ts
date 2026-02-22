import { describe, expect, it } from 'vitest'

import { parseBcpCsv } from './parser.js'

const BASE_OPTIONS = {
  eventName: 'Test GT 2025',
  eventDate: '2025-06-14',
  format: 'GT',
}

// Faction names are user-entered strings — intentionally generic in tests.
const STANDARD_CSV = `Place,Faction,W,L,D,Total Points
1,Alpha Faction,5,0,0,95
2,Beta Faction,4,1,0,82
3,Alpha Faction,3,1,1,75
4,Gamma Faction,3,2,0,71
5,Delta Faction,2,3,0,58
`

const CSV_WITH_LIST = `Rank,Faction,W,L,D,Points,List
1,Alpha Faction,5,0,0,95,"HQ: Commander
TROOPS: Infantry x10"
2,Beta Faction,4,1,0,82,
`

const EMPTY_CSV = `Place,Faction,W,L,D,Total Points
`

const MALFORMED_ROW = `Place,Faction,W,L,D,Total Points
1,Alpha Faction,5,0,0,95
not-a-number,Beta Faction,4,1,0,82
3,Gamma Faction,3,2,0,71
`

describe('parseBcpCsv — basic parsing', () => {
  it('returns a TournamentRecord with metadata', () => {
    const record = parseBcpCsv(STANDARD_CSV, BASE_OPTIONS)
    expect(record.eventName).toBe('Test GT 2025')
    expect(record.eventDate).toBe('2025-06-14')
    expect(record.format).toBe('GT')
  })

  it('parses all player rows', () => {
    const record = parseBcpCsv(STANDARD_CSV, BASE_OPTIONS)
    expect(record.players).toHaveLength(5)
  })

  it('correctly parses placement, faction, and W/L/D', () => {
    const record = parseBcpCsv(STANDARD_CSV, BASE_OPTIONS)
    const first = record.players[0]!
    expect(first.placement).toBe(1)
    expect(first.faction).toBe('Alpha Faction')
    expect(first.wins).toBe(5)
    expect(first.losses).toBe(0)
    expect(first.draws).toBe(0)
    expect(first.points).toBe(95)
  })

  it('parses second player correctly', () => {
    const record = parseBcpCsv(STANDARD_CSV, BASE_OPTIONS)
    const second = record.players[1]!
    expect(second.placement).toBe(2)
    expect(second.wins).toBe(4)
    expect(second.losses).toBe(1)
  })
})

describe('parseBcpCsv — column aliases', () => {
  it('handles "Rank" as placement column', () => {
    const csv = 'Rank,Faction,W,L,D,Points\n1,Alpha Faction,3,0,0,60\n'
    const record = parseBcpCsv(csv, BASE_OPTIONS)
    expect(record.players[0]!.placement).toBe(1)
  })

  it('handles "Wins" / "Losses" / "Draws" as long-form columns', () => {
    const csv = 'Place,Faction,Wins,Losses,Draws,Points\n1,Alpha Faction,4,1,0,80\n'
    const record = parseBcpCsv(csv, BASE_OPTIONS)
    const p = record.players[0]!
    expect(p.wins).toBe(4)
    expect(p.losses).toBe(1)
    expect(p.draws).toBe(0)
  })
})

describe('parseBcpCsv — optional list text', () => {
  it('includes listText when the column is present and non-empty', () => {
    const record = parseBcpCsv(CSV_WITH_LIST, BASE_OPTIONS)
    expect(record.players[0]!.listText).toContain('Commander')
  })

  it('sets listText to undefined when column is present but empty', () => {
    const record = parseBcpCsv(CSV_WITH_LIST, BASE_OPTIONS)
    expect(record.players[1]!.listText).toBeUndefined()
  })

  it('sets listText to undefined when column is absent', () => {
    const record = parseBcpCsv(STANDARD_CSV, BASE_OPTIONS)
    expect(record.players[0]!.listText).toBeUndefined()
  })
})

describe('parseBcpCsv — edge cases', () => {
  it('returns empty players array for CSV with headers only', () => {
    const record = parseBcpCsv(EMPTY_CSV, BASE_OPTIONS)
    expect(record.players).toHaveLength(0)
  })

  it('returns empty players array for completely empty input', () => {
    const record = parseBcpCsv('', BASE_OPTIONS)
    expect(record.players).toHaveLength(0)
  })

  it('skips rows where placement is not a number', () => {
    const record = parseBcpCsv(MALFORMED_ROW, BASE_OPTIONS)
    expect(record.players).toHaveLength(2) // rows 1 and 3 are valid
  })

  it('uses "GT" as default format if not provided', () => {
    const record = parseBcpCsv(STANDARD_CSV, {
      eventName: 'No Format Event',
      eventDate: '2025-01-01',
    })
    expect(record.format).toBe('GT')
  })
})

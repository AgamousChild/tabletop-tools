import { describe, expect, it } from 'vitest'

import { parseTabletopAdmiralCsv } from './parser.js'

const BASE_OPTIONS = {
  eventName: 'Regional Championship 2025',
  eventDate: '2025-09-20',
  format: 'GT',
}

// TA typically uses "CP" for championship/tournament points and "Rank"
const STANDARD_TA_CSV = `Rank,Faction,Win,Loss,Draw,CP
1,Alpha Faction,5,0,0,100
2,Beta Faction,4,0,1,90
3,Gamma Faction,3,2,0,70
`

const TA_WITH_LIST_CSV = `Rank,Faction,Win,Loss,Draw,CP,List
1,Alpha Faction,5,0,0,100,"Commander: Iron Lord
Troops: Veterans x10"
2,Beta Faction,4,0,1,90,
`

describe('parseTabletopAdmiralCsv — basic parsing', () => {
  it('returns a TournamentRecord with correct metadata', () => {
    const record = parseTabletopAdmiralCsv(STANDARD_TA_CSV, BASE_OPTIONS)
    expect(record.eventName).toBe('Regional Championship 2025')
    expect(record.eventDate).toBe('2025-09-20')
    expect(record.format).toBe('GT')
  })

  it('parses all player rows', () => {
    const record = parseTabletopAdmiralCsv(STANDARD_TA_CSV, BASE_OPTIONS)
    expect(record.players).toHaveLength(3)
  })

  it('correctly parses placement and record', () => {
    const record = parseTabletopAdmiralCsv(STANDARD_TA_CSV, BASE_OPTIONS)
    const first = record.players[0]!
    expect(first.placement).toBe(1)
    expect(first.faction).toBe('Alpha Faction')
    expect(first.wins).toBe(5)
    expect(first.losses).toBe(0)
    expect(first.draws).toBe(0)
  })

  it('parses CP as points', () => {
    const record = parseTabletopAdmiralCsv(STANDARD_TA_CSV, BASE_OPTIONS)
    expect(record.players[0]!.points).toBe(100)
    expect(record.players[1]!.points).toBe(90)
  })
})

describe('parseTabletopAdmiralCsv — column aliases', () => {
  it('handles "Place" as placement column', () => {
    const csv = 'Place,Faction,Win,Loss,Draw,CP\n1,Alpha Faction,3,0,0,60\n'
    const record = parseTabletopAdmiralCsv(csv, BASE_OPTIONS)
    expect(record.players[0]!.placement).toBe(1)
  })

  it('handles "Points" as tournament points column', () => {
    const csv = 'Rank,Faction,Win,Loss,Draw,Points\n1,Alpha Faction,3,0,0,60\n'
    const record = parseTabletopAdmiralCsv(csv, BASE_OPTIONS)
    expect(record.players[0]!.points).toBe(60)
  })
})

describe('parseTabletopAdmiralCsv — list text', () => {
  it('includes listText when present and non-empty', () => {
    const record = parseTabletopAdmiralCsv(TA_WITH_LIST_CSV, BASE_OPTIONS)
    expect(record.players[0]!.listText).toContain('Iron Lord')
  })

  it('sets listText to undefined when column is present but empty', () => {
    const record = parseTabletopAdmiralCsv(TA_WITH_LIST_CSV, BASE_OPTIONS)
    expect(record.players[1]!.listText).toBeUndefined()
  })
})

describe('parseTabletopAdmiralCsv — edge cases', () => {
  it('returns empty players for headers-only CSV', () => {
    const record = parseTabletopAdmiralCsv('Rank,Faction,Win,Loss,Draw,CP\n', BASE_OPTIONS)
    expect(record.players).toHaveLength(0)
  })

  it('returns empty players for empty string', () => {
    const record = parseTabletopAdmiralCsv('', BASE_OPTIONS)
    expect(record.players).toHaveLength(0)
  })

  it('skips rows where placement is not a number', () => {
    const csv = 'Rank,Faction,Win,Loss,Draw,CP\n1,Alpha,3,0,0,60\nnope,Beta,2,1,0,50\n2,Gamma,2,0,1,55\n'
    const record = parseTabletopAdmiralCsv(csv, BASE_OPTIONS)
    expect(record.players).toHaveLength(2)
  })

  it('defaults format to GT if not provided', () => {
    const record = parseTabletopAdmiralCsv(STANDARD_TA_CSV, {
      eventName: 'No Format',
      eventDate: '2025-01-01',
    })
    expect(record.format).toBe('GT')
  })
})

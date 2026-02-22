import { describe, expect, it } from 'vitest'

import { parseGenericCsv } from './parser.js'

const SINGLE_EVENT_CSV = `event_name,event_date,format,placement,faction,wins,losses,draws,points
Test GT 2025,2025-06-14,GT,1,Alpha Faction,5,0,0,95
Test GT 2025,2025-06-14,GT,2,Beta Faction,4,1,0,82
Test GT 2025,2025-06-14,GT,3,Gamma Faction,3,2,0,71
`

const MULTI_EVENT_CSV = `event_name,event_date,format,placement,faction,wins,losses,draws,points
Spring GT,2025-04-12,GT,1,Alpha Faction,3,0,0,60
Summer RTT,2025-07-19,RTT,1,Beta Faction,3,0,0,60
Summer RTT,2025-07-19,RTT,2,Alpha Faction,2,1,0,45
`

const WITH_UNITS_CSV = `event_name,event_date,format,placement,faction,wins,losses,draws,points,unit_name,unit_games_played,unit_avg_points
Unit GT,2025-08-01,GT,1,Alpha Faction,5,0,0,95,Void Walker,5,85
Unit GT,2025-08-01,GT,1,Alpha Faction,5,0,0,95,Iron Titan,5,90
Unit GT,2025-08-01,GT,2,Beta Faction,4,1,0,82,Null Sentinel,4,75
`

const WITH_LIST_TEXT_CSV = `event_name,event_date,format,placement,faction,wins,losses,draws,points,list_text
List GT,2025-10-01,GT,1,Alpha Faction,5,0,0,95,"HQ: Commander
TROOPS: Infantry x5"
`

describe('parseGenericCsv — single event', () => {
  it('returns one TournamentRecord', () => {
    const records = parseGenericCsv(SINGLE_EVENT_CSV)
    expect(records).toHaveLength(1)
  })

  it('populates event metadata', () => {
    const record = parseGenericCsv(SINGLE_EVENT_CSV)[0]!
    expect(record.eventName).toBe('Test GT 2025')
    expect(record.eventDate).toBe('2025-06-14')
    expect(record.format).toBe('GT')
  })

  it('parses all players', () => {
    const record = parseGenericCsv(SINGLE_EVENT_CSV)[0]!
    expect(record.players).toHaveLength(3)
  })

  it('parses player fields correctly', () => {
    const record = parseGenericCsv(SINGLE_EVENT_CSV)[0]!
    const first = record.players.find((p) => p.placement === 1)!
    expect(first.faction).toBe('Alpha Faction')
    expect(first.wins).toBe(5)
    expect(first.losses).toBe(0)
    expect(first.draws).toBe(0)
    expect(first.points).toBe(95)
  })
})

describe('parseGenericCsv — multiple events', () => {
  it('returns one record per unique event', () => {
    const records = parseGenericCsv(MULTI_EVENT_CSV)
    expect(records).toHaveLength(2)
  })

  it('correctly splits players between events', () => {
    const records = parseGenericCsv(MULTI_EVENT_CSV)
    const springGT = records.find((r) => r.eventName === 'Spring GT')!
    const summerRTT = records.find((r) => r.eventName === 'Summer RTT')!
    expect(springGT.players).toHaveLength(1)
    expect(summerRTT.players).toHaveLength(2)
  })

  it('preserves format per event', () => {
    const records = parseGenericCsv(MULTI_EVENT_CSV)
    const rtt = records.find((r) => r.eventName === 'Summer RTT')!
    expect(rtt.format).toBe('RTT')
  })
})

describe('parseGenericCsv — per-unit data', () => {
  it('groups multiple unit rows under the same player', () => {
    const records = parseGenericCsv(WITH_UNITS_CSV)
    const record = records[0]!
    const first = record.players.find((p) => p.placement === 1)!
    expect(first.unitResults).toHaveLength(2)
  })

  it('parses unit name and stats correctly', () => {
    const records = parseGenericCsv(WITH_UNITS_CSV)
    const first = records[0]!.players.find((p) => p.placement === 1)!
    const unit = first.unitResults!.find((u) => u.unitName === 'Void Walker')!
    expect(unit.gamesPlayed).toBe(5)
    expect(unit.averagePoints).toBe(85)
  })

  it('assigns unit results to the correct player', () => {
    const records = parseGenericCsv(WITH_UNITS_CSV)
    const second = records[0]!.players.find((p) => p.placement === 2)!
    expect(second.unitResults).toHaveLength(1)
    expect(second.unitResults![0]!.unitName).toBe('Null Sentinel')
  })
})

describe('parseGenericCsv — list text', () => {
  it('parses multi-line list text in quoted field', () => {
    const records = parseGenericCsv(WITH_LIST_TEXT_CSV)
    const player = records[0]!.players[0]!
    expect(player.listText).toContain('Commander')
  })
})

describe('parseGenericCsv — edge cases', () => {
  it('returns empty array for empty string', () => {
    expect(parseGenericCsv('')).toHaveLength(0)
  })

  it('returns empty array for headers-only CSV', () => {
    expect(
      parseGenericCsv(
        'event_name,event_date,format,placement,faction,wins,losses,draws,points\n',
      ),
    ).toHaveLength(0)
  })

  it('skips rows missing event_name or event_date', () => {
    const csv = `event_name,event_date,format,placement,faction,wins,losses,draws,points
,2025-01-01,GT,1,Alpha Faction,3,0,0,60
Valid Event,2025-01-01,GT,1,Beta Faction,3,0,0,60
`
    const records = parseGenericCsv(csv)
    expect(records).toHaveLength(1)
    expect(records[0]!.eventName).toBe('Valid Event')
  })

  it('skips rows where placement is not a number', () => {
    const csv = `event_name,event_date,format,placement,faction,wins,losses,draws,points
Event A,2025-01-01,GT,nope,Alpha Faction,3,0,0,60
Event A,2025-01-01,GT,1,Beta Faction,3,0,0,60
`
    const records = parseGenericCsv(csv)
    expect(records[0]!.players).toHaveLength(1)
  })
})

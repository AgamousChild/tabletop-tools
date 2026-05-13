import { describe, it, expect } from 'vitest'
import {
  deriveFormat,
  normalizeDate,
  deriveMetaWindow,
  toTournamentRecord,
  type TournamentRecord,
} from './event-parser'
import type { BCPEvent } from './event-list'
import type { BCPStanding } from './standings'

// ── deriveFormat ─────────────────────────────────────────────────────────────

describe('deriveFormat', () => {
  it('returns "Local" for fewer than 30 players', () => {
    expect(deriveFormat(10)).toBe('Local')
    expect(deriveFormat(29)).toBe('Local')
  })

  it('returns "RTT" for 30–99 players', () => {
    expect(deriveFormat(30)).toBe('RTT')
    expect(deriveFormat(50)).toBe('RTT')
    expect(deriveFormat(99)).toBe('RTT')
  })

  it('returns "GT" for 100–199 players', () => {
    expect(deriveFormat(100)).toBe('GT')
    expect(deriveFormat(150)).toBe('GT')
    expect(deriveFormat(199)).toBe('GT')
  })

  it('returns "Major" for 200–399 players', () => {
    expect(deriveFormat(200)).toBe('Major')
    expect(deriveFormat(300)).toBe('Major')
    expect(deriveFormat(399)).toBe('Major')
  })

  it('returns "Super Major" for 400+ players', () => {
    expect(deriveFormat(400)).toBe('Super Major')
    expect(deriveFormat(512)).toBe('Super Major')
  })
})

// ── normalizeDate ─────────────────────────────────────────────────────────────

describe('normalizeDate', () => {
  it('passes through an already-ISO date unchanged', () => {
    expect(normalizeDate('2025-05-04')).toBe('2025-05-04')
    expect(normalizeDate('2024-01-01')).toBe('2024-01-01')
  })

  it('parses "Month Day, Year" format', () => {
    expect(normalizeDate('May 4, 2025')).toBe('2025-05-04')
    expect(normalizeDate('January 31, 2025')).toBe('2025-01-31')
  })

  it('parses "Month Day" without year (assumes current year context)', () => {
    // "Apr 23" — must produce a valid YYYY-MM-DD (year may vary)
    const result = normalizeDate('Apr 23')
    expect(result).toMatch(/^\d{4}-04-23$/)
  })

  it('returns the original string for truly unparseable input', () => {
    expect(normalizeDate('not-a-date')).toBe('not-a-date')
  })

  it('handles abbreviated month formats', () => {
    const result = normalizeDate('Jun 14, 2025')
    expect(result).toBe('2025-06-14')
  })
})

// ── deriveMetaWindow ──────────────────────────────────────────────────────────

describe('deriveMetaWindow', () => {
  it('maps Q1 dates correctly', () => {
    expect(deriveMetaWindow('2025-01-15')).toBe('2025-Q1')
    expect(deriveMetaWindow('2025-03-31')).toBe('2025-Q1')
  })

  it('maps Q2 dates correctly', () => {
    expect(deriveMetaWindow('2025-06-14')).toBe('2025-Q2')
    expect(deriveMetaWindow('2025-04-01')).toBe('2025-Q2')
  })

  it('maps Q3 dates correctly', () => {
    expect(deriveMetaWindow('2025-09-30')).toBe('2025-Q3')
    expect(deriveMetaWindow('2025-07-01')).toBe('2025-Q3')
  })

  it('maps Q4 dates correctly', () => {
    expect(deriveMetaWindow('2024-11-03')).toBe('2024-Q4')
    expect(deriveMetaWindow('2024-12-31')).toBe('2024-Q4')
  })
})

// ── toTournamentRecord ─────────────────────────────────────────────────────────

const SAMPLE_EVENT: BCPEvent = {
  id: 'abc123',
  url: 'https://www.bestcoastpairings.com/event/abc123',
  name: 'Adepticon 2025 — Warhammer 40,000 Championships',
  date: '2025-04-23',
  playerCount: 256,
  rounds: 7,
  location: 'Schaumburg, IL',
}

const SAMPLE_STANDINGS: BCPStanding[] = [
  {
    placement: 1,
    playerName: 'Alice Smith',
    faction: 'Space Marines',
    wins: 7,
    losses: 0,
    draws: 0,
    points: 21,
  },
  {
    placement: 2,
    playerName: 'Bob Jones',
    faction: 'Chaos Daemons',
    wins: 6,
    losses: 1,
    draws: 0,
    points: 18,
  },
]

describe('toTournamentRecord', () => {
  it('maps all event fields correctly', () => {
    const record = toTournamentRecord(SAMPLE_EVENT, SAMPLE_STANDINGS)

    expect(record.eventName).toBe('Adepticon 2025 — Warhammer 40,000 Championships')
    expect(record.eventDate).toBe('2025-04-23')
    expect(record.format).toBe('Major') // 256 players
  })

  it('maps all standing fields to player entries', () => {
    const record = toTournamentRecord(SAMPLE_EVENT, SAMPLE_STANDINGS)

    expect(record.players).toHaveLength(2)
    expect(record.players[0]).toMatchObject({
      name: 'Alice Smith',
      placement: 1,
      faction: 'Space Marines',
      wins: 7,
      losses: 0,
      draws: 0,
      points: 21,
    })
    expect(record.players[1]?.name).toBe('Bob Jones')
  })

  it('injects army list text when armyLists map is provided', () => {
    const armyLists = new Map([
      ['Alice Smith', 'ARMY LIST\nSpace Marines\n++ Gladius Task Force ++'],
    ])

    const record = toTournamentRecord(SAMPLE_EVENT, SAMPLE_STANDINGS, armyLists)

    expect(record.players[0]?.listText).toBe('ARMY LIST\nSpace Marines\n++ Gladius Task Force ++')
    expect(record.players[1]?.listText).toBeUndefined()
  })

  it('omits listText when armyLists map is not provided', () => {
    const record = toTournamentRecord(SAMPLE_EVENT, SAMPLE_STANDINGS)

    expect(record.players[0]?.listText).toBeUndefined()
    expect(record.players[1]?.listText).toBeUndefined()
  })

  it('handles empty standings gracefully', () => {
    const record = toTournamentRecord(SAMPLE_EVENT, [])

    expect(record.players).toEqual([])
    expect(record.eventName).toBe(SAMPLE_EVENT.name)
  })

  it('derives format from player count (100 → GT boundary)', () => {
    const smallEvent: BCPEvent = { ...SAMPLE_EVENT, playerCount: 100 }
    const record = toTournamentRecord(smallEvent, [])
    expect(record.format).toBe('GT')
  })

  it('derives format from player count (400 → Super Major boundary)', () => {
    const hugeEvent: BCPEvent = { ...SAMPLE_EVENT, playerCount: 400 }
    const record = toTournamentRecord(hugeEvent, [])
    expect(record.format).toBe('Super Major')
  })

  it('satisfies the TournamentRecord shape', () => {
    const record: TournamentRecord = toTournamentRecord(SAMPLE_EVENT, SAMPLE_STANDINGS)
    expect(typeof record.eventName).toBe('string')
    expect(typeof record.eventDate).toBe('string')
    expect(typeof record.format).toBe('string')
    expect(Array.isArray(record.players)).toBe(true)
  })
})

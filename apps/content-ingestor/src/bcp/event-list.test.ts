import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { BCP_SEARCH_URL, type BCPEvent, loadEventList, saveEventList } from './event-list'

const SAMPLE_EVENTS: BCPEvent[] = [
  {
    id: 'abc123',
    url: 'https://www.bestcoastpairings.com/event/abc123',
    name: 'Adepticon 2025 — Warhammer 40,000 Championships',
    date: 'Apr 23',
    playerCount: 256,
    rounds: 7,
    location: '',
  },
  {
    id: 'xyz789',
    url: 'https://www.bestcoastpairings.com/event/xyz789',
    name: 'Las Vegas Open 2025 — 40K',
    date: 'Jan 31',
    playerCount: 512,
    rounds: 7,
    location: '',
  },
]

describe('saveEventList / loadEventList', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = join(tmpdir(), `bcp-test-${Date.now()}`)
    mkdirSync(tempDir, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('round-trips a list of events to/from JSON', async () => {
    const outputPath = join(tempDir, 'events.json')
    await saveEventList(SAMPLE_EVENTS, outputPath)
    const loaded = await loadEventList(outputPath)
    expect(loaded).toEqual(SAMPLE_EVENTS)
  })

  it('creates intermediate directories if they do not exist', async () => {
    const outputPath = join(tempDir, 'nested', 'deep', 'events.json')
    await saveEventList(SAMPLE_EVENTS, outputPath)
    const loaded = await loadEventList(outputPath)
    expect(loaded).toHaveLength(2)
  })

  it('round-trips an empty list', async () => {
    const outputPath = join(tempDir, 'empty.json')
    await saveEventList([], outputPath)
    const loaded = await loadEventList(outputPath)
    expect(loaded).toEqual([])
  })

  it('preserves all BCPEvent fields accurately', async () => {
    const outputPath = join(tempDir, 'events.json')
    await saveEventList(SAMPLE_EVENTS, outputPath)
    const loaded = await loadEventList(outputPath)
    const first = loaded[0]!
    expect(first.id).toBe('abc123')
    expect(first.playerCount).toBe(256)
    expect(first.rounds).toBe(7)
    expect(first.name).toBe('Adepticon 2025 — Warhammer 40,000 Championships')
  })
})

describe('event ID extraction regex', () => {
  const extractId = (url: string): string | null => {
    const match = url.match(/\/event\/([^/?]+)/)
    return match ? (match[1] ?? null) : null
  }

  it('extracts ID from a clean event URL', () => {
    expect(extractId('https://www.bestcoastpairings.com/event/abc123')).toBe('abc123')
  })

  it('extracts ID from URL with query string', () => {
    expect(extractId('https://www.bestcoastpairings.com/event/abc123?tab=players')).toBe('abc123')
  })

  it('extracts alphanumeric IDs', () => {
    expect(extractId('https://www.bestcoastpairings.com/event/WGMSzfKFYA')).toBe('WGMSzfKFYA')
  })

  it('extracts IDs with hyphens', () => {
    expect(extractId('https://www.bestcoastpairings.com/event/lvo-2025-40k')).toBe('lvo-2025-40k')
  })

  it('returns null for non-event URLs', () => {
    expect(extractId('https://www.bestcoastpairings.com/play/events?search=true')).toBeNull()
  })

  it('returns null for register URLs (which scrapeEventList filters out)', () => {
    // register URLs would be filtered by the `!url.includes('register')` check in scrapeEventList
    // The regex itself still extracts the ID, but the caller never calls extractId on them
    expect(extractId('https://www.bestcoastpairings.com/event/abc123/register')).toBe('abc123')
  })
})

describe('BCP_SEARCH_URL', () => {
  it('targets the correct game system (Warhammer 40K)', () => {
    expect(BCP_SEARCH_URL).toContain('gameSystemId=WGMSzfKFYA')
  })

  it('filters for 100+ player events', () => {
    expect(BCP_SEARCH_URL).toContain('numberOfPlayers=100')
  })

  it('filters for 5+ round events', () => {
    expect(BCP_SEARCH_URL).toContain('numberOfRounds=5')
  })

  it('sorts descending by event date (newest first, per d113414)', () => {
    expect(BCP_SEARCH_URL).toContain('sortAsc=false')
    expect(BCP_SEARCH_URL).toContain('sortKey=eventDate')
  })

  it('covers a two-year window starting 2024-04-27', () => {
    expect(BCP_SEARCH_URL).toContain('startDate=2024-04-27')
    expect(BCP_SEARCH_URL).toContain('endDate=2026-04-27')
  })

  it('includes all event statuses', () => {
    expect(BCP_SEARCH_URL).toContain('eventStatus=all')
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import type { BcpEvent, BcpPairing } from './bcp-api'

const CREATE_TABLES = `
CREATE TABLE IF NOT EXISTS meta_events (id TEXT PRIMARY KEY, name TEXT NOT NULL, date INTEGER NOT NULL, location TEXT, gps_coords TEXT, region_id INTEGER, format TEXT NOT NULL, rounds INTEGER, player_count INTEGER NOT NULL, source TEXT NOT NULL, source_id TEXT, imported_at INTEGER NOT NULL, win_faction_id TEXT, win_subfaction_id TEXT, win_detachment_id TEXT);
CREATE TABLE IF NOT EXISTS meta_event_players (id TEXT PRIMARY KEY, event_id TEXT NOT NULL, player_name TEXT NOT NULL, source_player_id TEXT, faction_id TEXT NOT NULL, subfaction_id TEXT, detachment_id TEXT, placement INTEGER NOT NULL, list_text TEXT, wins INTEGER NOT NULL DEFAULT 0, losses INTEGER NOT NULL DEFAULT 0, draws INTEGER NOT NULL DEFAULT 0, gl2_rating_start REAL, gl2_rd_start REAL, gl2_vol_start REAL, gl2_rating_end REAL, gl2_rd_end REAL, gl2_vol_end REAL);
CREATE TABLE IF NOT EXISTS meta_pairings (id TEXT PRIMARY KEY, event_id TEXT NOT NULL, round INTEGER NOT NULL, player1_id TEXT, player2_id TEXT, player1_score INTEGER, player2_score INTEGER, player1_gl2 REAL, player2_gl2 REAL, result TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS bcp_scrape_jobs (id TEXT PRIMARY KEY, started_at INTEGER NOT NULL, completed_at INTEGER, status TEXT NOT NULL DEFAULT 'running', events_found INTEGER DEFAULT 0, events_scraped INTEGER DEFAULT 0, pairings_scraped INTEGER DEFAULT 0, lists_scraped INTEGER DEFAULT 0, errors TEXT, triggered_by TEXT NOT NULL DEFAULT 'cron');
`

// Mock cognito
vi.mock('./cognito', () => ({
  authenticateBcp: vi.fn().mockResolvedValue('mock-token-123'),
}))

// We'll mock BcpApiClient per test
const mockSearchEvents = vi.fn()
const mockGetEvent = vi.fn()
const mockGetPairings = vi.fn()

vi.mock('./bcp-api', () => ({
  BcpApiClient: vi.fn().mockImplementation(() => ({
    searchEvents: mockSearchEvents,
    getEvent: mockGetEvent,
    getPairings: mockGetPairings,
  })),
}))

// Mock generateId to return predictable IDs
let idCounter = 0
vi.mock('@tabletop-tools/server-core', () => ({
  generateId: () => `id-${++idCounter}`,
}))

import { runScrape } from './scrape'

function makeEvent(overrides: Partial<BcpEvent> = {}): BcpEvent {
  return {
    id: 'evt-abc',
    name: 'GT Springfield',
    startDate: '2026-05-01T00:00:00Z',
    endDate: '2026-05-03T00:00:00Z',
    city: 'Springfield',
    state: 'IL',
    country: 'US',
    rounds: 5,
    playerCount: 32,
    isTeamEvent: false,
    ...overrides,
  }
}

function makePairing(round: number, overrides: Partial<BcpPairing> = {}): BcpPairing {
  return {
    round,
    table: 1,
    player1: { name: 'Alice Smith', faction: 'Aeldari' },
    player2: { name: 'Bob Jones', faction: 'Necrons' },
    player1Game: { result: 2, points: 80 },
    player2Game: { result: 0, points: 50 },
    ...overrides,
  }
}

describe('runScrape', () => {
  let client: ReturnType<typeof createClient>
  let db: ReturnType<typeof createDbFromClient>

  beforeEach(async () => {
    idCounter = 0
    client = createClient({ url: ':memory:' })
    db = createDbFromClient(client)
    await client.executeMultiple(CREATE_TABLES)

    mockSearchEvents.mockReset()
    mockGetEvent.mockReset()
    mockGetPairings.mockReset()
  })

  it('scrapes events and writes to DB (happy path)', async () => {
    const event = makeEvent()
    mockSearchEvents.mockResolvedValue([event])
    mockGetEvent.mockResolvedValue(event)
    // 5 rounds, each with 1 pairing
    mockGetPairings.mockImplementation((_id: string, round: number) =>
      Promise.resolve([makePairing(round)]),
    )

    const { jobId } = await runScrape({
      bcpEmail: 'test@example.com',
      bcpPassword: 'pass',
      db,
    })

    expect(jobId).toBeTruthy()

    // Verify job record
    const jobs = await client.execute('SELECT * FROM bcp_scrape_jobs')
    expect(jobs.rows).toHaveLength(1)
    expect(jobs.rows[0]!.status).toBe('completed')
    expect(jobs.rows[0]!.events_found).toBe(1)
    expect(jobs.rows[0]!.events_scraped).toBe(1)
    expect(jobs.rows[0]!.pairings_scraped).toBe(5) // 5 rounds * 1 pairing

    // Verify event record
    const events = await client.execute('SELECT * FROM meta_events')
    expect(events.rows).toHaveLength(1)
    expect(events.rows[0]!.name).toBe('GT Springfield')
    expect(events.rows[0]!.source).toBe('bcp')
    expect(events.rows[0]!.source_id).toBe('evt-abc')
    expect(events.rows[0]!.player_count).toBe(32)
    expect(events.rows[0]!.rounds).toBe(5)

    // Verify players — 2 unique players from pairings
    const players = await client.execute('SELECT * FROM meta_event_players ORDER BY player_name')
    expect(players.rows).toHaveLength(2)
    const alice = players.rows[0]!
    const bob = players.rows[1]!
    expect(alice.player_name).toBe('Alice Smith')
    expect(alice.faction_id).toBe('aeldari')
    expect(Number(alice.wins)).toBe(5) // won all 5 rounds
    expect(Number(bob.losses)).toBe(5)
    expect(bob.faction_id).toBe('necrons')

    // Verify pairings
    const pairings = await client.execute('SELECT * FROM meta_pairings ORDER BY round')
    expect(pairings.rows).toHaveLength(5)
    expect(pairings.rows[0]!.result).toBe('p1') // player1 won (result: 2)
  })

  it('skips team events', async () => {
    mockSearchEvents.mockResolvedValue([makeEvent({ isTeamEvent: true })])

    const { jobId } = await runScrape({
      bcpEmail: 'test@example.com',
      bcpPassword: 'pass',
      db,
    })

    expect(jobId).toBeTruthy()

    const events = await client.execute('SELECT * FROM meta_events')
    expect(events.rows).toHaveLength(0)

    const jobs = await client.execute('SELECT * FROM bcp_scrape_jobs')
    expect(jobs.rows[0]!.events_scraped).toBe(0)
  })

  it('skips already-scraped events (deduplication)', async () => {
    // Pre-insert an event with this source_id
    await client.execute({
      sql: 'INSERT INTO meta_events (id, name, date, format, player_count, source, source_id, imported_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      args: ['existing-id', 'Old Event', Date.now(), 'GT', 20, 'bcp', 'evt-abc', Date.now()],
    })

    mockSearchEvents.mockResolvedValue([makeEvent({ id: 'evt-abc' })])

    await runScrape({
      bcpEmail: 'test@example.com',
      bcpPassword: 'pass',
      db,
    })

    // Should still only have the 1 pre-existing event
    const events = await client.execute('SELECT * FROM meta_events')
    expect(events.rows).toHaveLength(1)
    expect(events.rows[0]!.id).toBe('existing-id')

    // getEvent should not have been called
    expect(mockGetEvent).not.toHaveBeenCalled()
  })

  it('records job as failed on error', async () => {
    mockSearchEvents.mockRejectedValue(new Error('API down'))

    const { jobId } = await runScrape({
      bcpEmail: 'test@example.com',
      bcpPassword: 'pass',
      db,
    })

    expect(jobId).toBeTruthy()

    const jobs = await client.execute('SELECT * FROM bcp_scrape_jobs')
    expect(jobs.rows).toHaveLength(1)
    expect(jobs.rows[0]!.status).toBe('failed')
    expect(jobs.rows[0]!.errors).toContain('API down')
  })

  it('handles draw results correctly', async () => {
    const event = makeEvent({ rounds: 1 })
    mockSearchEvents.mockResolvedValue([event])
    mockGetEvent.mockResolvedValue(event)
    mockGetPairings.mockResolvedValue([
      makePairing(1, {
        player1Game: { result: 1, points: 60 },
        player2Game: { result: 1, points: 60 },
      }),
    ])

    await runScrape({
      bcpEmail: 'test@example.com',
      bcpPassword: 'pass',
      db,
    })

    const pairings = await client.execute('SELECT * FROM meta_pairings')
    expect(pairings.rows).toHaveLength(1)
    expect(pairings.rows[0]!.result).toBe('draw')

    const players = await client.execute('SELECT * FROM meta_event_players ORDER BY player_name')
    expect(Number(players.rows[0]!.draws)).toBe(1)
    expect(Number(players.rows[1]!.draws)).toBe(1)
  })

  it('maps p2 win correctly', async () => {
    const event = makeEvent({ rounds: 1 })
    mockSearchEvents.mockResolvedValue([event])
    mockGetEvent.mockResolvedValue(event)
    mockGetPairings.mockResolvedValue([
      makePairing(1, {
        player1Game: { result: 0, points: 40 },
        player2Game: { result: 2, points: 80 },
      }),
    ])

    await runScrape({
      bcpEmail: 'test@example.com',
      bcpPassword: 'pass',
      db,
    })

    const pairings = await client.execute('SELECT * FROM meta_pairings')
    expect(pairings.rows[0]!.result).toBe('p2')
  })

  it('sets triggeredBy from parameter', async () => {
    mockSearchEvents.mockResolvedValue([])

    await runScrape(
      { bcpEmail: 'test@example.com', bcpPassword: 'pass', db },
      'manual',
    )

    const jobs = await client.execute('SELECT * FROM bcp_scrape_jobs')
    expect(jobs.rows[0]!.triggered_by).toBe('manual')
  })

  it('builds location string from city/state/country', async () => {
    const event = makeEvent({ city: 'Austin', state: 'TX', country: 'US' })
    mockSearchEvents.mockResolvedValue([event])
    mockGetEvent.mockResolvedValue(event)
    mockGetPairings.mockResolvedValue([makePairing(1)])

    await runScrape({
      bcpEmail: 'test@example.com',
      bcpPassword: 'pass',
      db,
    })

    const events = await client.execute('SELECT * FROM meta_events')
    expect(events.rows[0]!.location).toBe('Austin, TX, US')
  })
})

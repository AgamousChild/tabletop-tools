import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BcpEvent, BcpPairing } from './bcp-api'
import { loadFactionMap, resetFactionMapCache } from './faction-map'

const CREATE_TABLES = `
CREATE TABLE IF NOT EXISTS meta_events (id TEXT PRIMARY KEY, name TEXT NOT NULL, date INTEGER NOT NULL, location TEXT, gps_coords TEXT, region_id INTEGER, format TEXT NOT NULL, rounds INTEGER, player_count INTEGER NOT NULL, source TEXT NOT NULL, source_id TEXT, imported_at INTEGER NOT NULL, win_faction_id TEXT, win_subfaction_id TEXT, win_detachment_id TEXT);
CREATE TABLE IF NOT EXISTS meta_event_players (id TEXT PRIMARY KEY, event_id TEXT NOT NULL, player_name TEXT NOT NULL, source_player_id TEXT, faction_id TEXT NOT NULL, subfaction_id TEXT, detachment_id TEXT, placement INTEGER NOT NULL, list_text TEXT, list_ttt TEXT, wins INTEGER NOT NULL DEFAULT 0, losses INTEGER NOT NULL DEFAULT 0, draws INTEGER NOT NULL DEFAULT 0, gl2_rating_start REAL, gl2_rd_start REAL, gl2_vol_start REAL, gl2_rating_end REAL, gl2_rd_end REAL, gl2_vol_end REAL);
CREATE TABLE IF NOT EXISTS meta_pairings (id TEXT PRIMARY KEY, event_id TEXT NOT NULL, round INTEGER NOT NULL, player1_id TEXT, player2_id TEXT, player1_score INTEGER, player2_score INTEGER, player1_gl2 REAL, player2_gl2 REAL, result TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS bcp_scrape_jobs (id TEXT PRIMARY KEY, started_at INTEGER NOT NULL, completed_at INTEGER, status TEXT NOT NULL DEFAULT 'running', events_found INTEGER DEFAULT 0, events_scraped INTEGER DEFAULT 0, pairings_scraped INTEGER DEFAULT 0, lists_scraped INTEGER DEFAULT 0, errors TEXT, triggered_by TEXT NOT NULL DEFAULT 'cron');
CREATE TABLE IF NOT EXISTS dim_faction (id TEXT PRIMARY KEY, name TEXT NOT NULL, allegiance TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS dim_faction_alias (alias TEXT PRIMARY KEY, faction_id TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS dim_subfaction (id TEXT PRIMARY KEY, name TEXT NOT NULL, faction_id TEXT NOT NULL);
INSERT INTO dim_faction VALUES ('aeldari', 'Aeldari', 'xenos');
INSERT INTO dim_faction VALUES ('necrons', 'Necrons', 'xenos');
INSERT INTO dim_faction_alias VALUES ('Aeldari', 'aeldari');
INSERT INTO dim_faction_alias VALUES ('Necrons', 'necrons');
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
    resetFactionMapCache()
    client = createClient({ url: ':memory:' })
    db = createDbFromClient(client)
    await client.executeMultiple(CREATE_TABLES)
    await loadFactionMap(db)

    mockSearchEvents.mockReset()
    mockGetEvent.mockReset()
    mockGetPairings.mockReset()
  })

  afterAll(() => {
    resetFactionMapCache()
    client.close()
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

    await runScrape({ bcpEmail: 'test@example.com', bcpPassword: 'pass', db }, 'manual')

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

  it('does not leave a permanent lockout when getPairings fails mid-event', async () => {
    const event = makeEvent({ id: 'evt-flaky', rounds: 3 })
    mockSearchEvents.mockResolvedValue([event])
    mockGetEvent.mockResolvedValue(event)
    // Round 1 OK, round 2 throws
    mockGetPairings.mockImplementation((_id: string, round: number) => {
      if (round === 2) return Promise.reject(new Error('pairings fetch failed'))
      return Promise.resolve([makePairing(round)])
    })

    const { jobId } = await runScrape({
      bcpEmail: 'test@example.com',
      bcpPassword: 'pass',
      db,
    })
    expect(jobId).toBeTruthy()

    // No trace of the failed event should remain
    const events = await client.execute('SELECT * FROM meta_events')
    expect(events.rows).toHaveLength(0)
    const players = await client.execute('SELECT * FROM meta_event_players')
    expect(players.rows).toHaveLength(0)
    const pairings = await client.execute('SELECT * FROM meta_pairings')
    expect(pairings.rows).toHaveLength(0)

    // The job should still complete, recording the error
    const jobs = await client.execute('SELECT * FROM bcp_scrape_jobs')
    expect(jobs.rows[0]!.status).toBe('completed')
    expect(jobs.rows[0]!.eventsScraped ?? jobs.rows[0]!.events_scraped).toBe(0)
    expect(String(jobs.rows[0]!.errors)).toContain('evt-flaky')

    // A second run should retry the same event (not locked out)
    mockGetEvent.mockClear()
    mockGetPairings.mockReset()
    mockGetPairings.mockImplementation((_id: string, round: number) =>
      Promise.resolve([makePairing(round)]),
    )
    mockSearchEvents.mockResolvedValue([event])

    await runScrape({
      bcpEmail: 'test@example.com',
      bcpPassword: 'pass',
      db,
    })

    expect(mockGetEvent).toHaveBeenCalledWith('evt-flaky')
    const eventsAfterRetry = await client.execute('SELECT * FROM meta_events')
    expect(eventsAfterRetry.rows).toHaveLength(1)
    expect(eventsAfterRetry.rows[0]!.source_id).toBe('evt-flaky')
  })

  it('rolls back the event row when an insert fails partway through the insert phase', async () => {
    // Pre-insert a row using the id our mocked generateId will hand out for the
    // *pairing* insert, forcing a PRIMARY KEY collision only once event + players
    // have already been written — proving the insert-phase failure is cleaned up.
    const event = makeEvent({ id: 'evt-insertfail', rounds: 1 })
    mockSearchEvents.mockResolvedValue([event])
    mockGetEvent.mockResolvedValue(event)
    mockGetPairings.mockResolvedValue([makePairing(1)])

    // generateId sequence for this event: jobId -> id-1 (already consumed by
    // runScrape's job-record insert before this loop runs), eventId -> id-2,
    // player1Id -> id-3, player2Id -> id-4, pairingId -> id-5. Pre-seed id-5
    // into meta_pairings so the pairing INSERT collides on PRIMARY KEY.
    await client.execute({
      sql: 'INSERT INTO meta_pairings (id, event_id, round, result) VALUES (?, ?, ?, ?)',
      args: ['id-5', 'other-event', 1, 'draw'],
    })

    await runScrape({
      bcpEmail: 'test@example.com',
      bcpPassword: 'pass',
      db,
    })

    // The event row (and its players) must not survive the failed insert phase.
    const events = await client.execute(
      "SELECT * FROM meta_events WHERE source_id = 'evt-insertfail'",
    )
    expect(events.rows).toHaveLength(0)
    const players = await client.execute('SELECT * FROM meta_event_players')
    expect(players.rows).toHaveLength(0)

    // Error should be recorded on the job
    const jobs = await client.execute('SELECT * FROM bcp_scrape_jobs')
    expect(jobs.rows[0]!.status).toBe('completed')
    expect(String(jobs.rows[0]!.errors)).toContain('evt-insertfail')
  })

  it('persists accumulated errors on the completed job when some events fail and others succeed', async () => {
    const goodEvent = makeEvent({ id: 'evt-good', rounds: 1 })
    const badEvent = makeEvent({ id: 'evt-bad', rounds: 1 })
    mockSearchEvents.mockResolvedValue([goodEvent, badEvent])
    mockGetEvent.mockImplementation((id: string) => {
      if (id === 'evt-bad') return Promise.reject(new Error('event fetch failed'))
      return Promise.resolve(goodEvent)
    })
    mockGetPairings.mockImplementation(() => Promise.resolve([makePairing(1)]))

    const { jobId } = await runScrape({
      bcpEmail: 'test@example.com',
      bcpPassword: 'pass',
      db,
    })
    expect(jobId).toBeTruthy()

    const jobs = await client.execute('SELECT * FROM bcp_scrape_jobs')
    expect(jobs.rows[0]!.status).toBe('completed')
    expect(jobs.rows[0]!.events_scraped).toBe(1)
    expect(String(jobs.rows[0]!.errors)).toContain('evt-bad')
    expect(String(jobs.rows[0]!.errors)).toContain('event fetch failed')

    // The good event still landed
    const events = await client.execute('SELECT * FROM meta_events')
    expect(events.rows).toHaveLength(1)
    expect(events.rows[0]!.source_id).toBe('evt-good')
  })
})

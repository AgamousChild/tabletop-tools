import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import type * as ServerCore from '@tabletop-tools/server-core'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BcpEvent, BcpPairing } from './bcp-api'
import { loadFactionMap, resetFactionMapCache } from './faction-map'

const CREATE_TABLES = `
CREATE TABLE IF NOT EXISTS "user" (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, username TEXT UNIQUE, display_username TEXT UNIQUE, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS meta_events (id TEXT PRIMARY KEY, name TEXT NOT NULL, date INTEGER NOT NULL, location TEXT, gps_coords TEXT, region_id INTEGER, format TEXT NOT NULL, rounds INTEGER, player_count INTEGER NOT NULL, source TEXT NOT NULL, source_id TEXT, imported_at INTEGER NOT NULL, win_faction_id TEXT, win_subfaction_id TEXT, win_detachment_id TEXT, UNIQUE(source, source_id));
CREATE TABLE IF NOT EXISTS meta_event_players (id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES meta_events(id) ON DELETE CASCADE, player_name TEXT NOT NULL, source_player_id TEXT, faction_id TEXT NOT NULL, subfaction_id TEXT, detachment_id TEXT, placement INTEGER NOT NULL, source_list_id TEXT, list_text TEXT, list_ttt TEXT, wins INTEGER NOT NULL DEFAULT 0, losses INTEGER NOT NULL DEFAULT 0, draws INTEGER NOT NULL DEFAULT 0, gl2_rating_start REAL, gl2_rd_start REAL, gl2_vol_start REAL, gl2_rating_end REAL, gl2_rd_end REAL, gl2_vol_end REAL);
CREATE TABLE IF NOT EXISTS meta_pairings (id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES meta_events(id) ON DELETE CASCADE, round INTEGER NOT NULL, player1_id TEXT, player2_id TEXT, player1_score INTEGER, player2_score INTEGER, player1_gl2 REAL, player2_gl2 REAL, result TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS bcp_scrape_jobs (id TEXT PRIMARY KEY, started_at INTEGER NOT NULL, completed_at INTEGER, status TEXT NOT NULL DEFAULT 'running', events_found INTEGER DEFAULT 0, events_scraped INTEGER DEFAULT 0, pairings_scraped INTEGER DEFAULT 0, lists_scraped INTEGER DEFAULT 0, errors TEXT, triggered_by TEXT NOT NULL DEFAULT 'cron');
CREATE TABLE IF NOT EXISTS dim_faction (id TEXT PRIMARY KEY, name TEXT NOT NULL, allegiance TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS dim_faction_alias (alias TEXT PRIMARY KEY, faction_id TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS dim_subfaction (id TEXT PRIMARY KEY, name TEXT NOT NULL, faction_id TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS dim_for_type (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS dim_granularity (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS dim_dataslate (id TEXT PRIMARY KEY, name TEXT NOT NULL, effective_date INTEGER NOT NULL, end_date INTEGER);
CREATE TABLE IF NOT EXISTS dim_tournament_pack (id TEXT PRIMARY KEY, name TEXT NOT NULL, effective_date INTEGER NOT NULL, end_date INTEGER);
CREATE TABLE IF NOT EXISTS dim_edition (id TEXT PRIMARY KEY, name TEXT NOT NULL, start_date INTEGER NOT NULL, end_date INTEGER);
CREATE TABLE IF NOT EXISTS meta_for (id TEXT PRIMARY KEY, type_id INTEGER NOT NULL, date INTEGER NOT NULL, end_date INTEGER, day INTEGER, month INTEGER, quarter INTEGER, year INTEGER NOT NULL, dataslate_id TEXT, tourney_pack_id TEXT, edition_id TEXT);
CREATE TABLE IF NOT EXISTS fact_game_results (id TEXT PRIMARY KEY, event_id TEXT NOT NULL, player_id TEXT NOT NULL, opponent_id TEXT, round INTEGER NOT NULL, faction_id TEXT NOT NULL, subfaction_id TEXT, detachment_id TEXT, opponent_faction_id TEXT, opponent_subfaction_id TEXT, opponent_detachment_id TEXT, result REAL NOT NULL, player_score INTEGER, opponent_score INTEGER);
CREATE TABLE IF NOT EXISTS meta_top (id TEXT PRIMARY KEY, granularity_id INTEGER NOT NULL, faction_id TEXT NOT NULL, subfaction_id TEXT, detachment_id TEXT, meta_for_id TEXT NOT NULL, win_rate REAL NOT NULL, draw_rate REAL NOT NULL, over_rep REAL NOT NULL, four_oh_start REAL NOT NULL, event_wins INTEGER NOT NULL DEFAULT 0, event_finals INTEGER NOT NULL DEFAULT 0, event_top4 INTEGER NOT NULL DEFAULT 0, event_top8 INTEGER NOT NULL DEFAULT 0, event_top16 INTEGER NOT NULL DEFAULT 0, player_pop_pct REAL NOT NULL, wins INTEGER NOT NULL DEFAULT 0, losses INTEGER NOT NULL DEFAULT 0, draws INTEGER NOT NULL DEFAULT 0, games INTEGER NOT NULL DEFAULT 0, players INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS meta_cube_status (id INTEGER PRIMARY KEY DEFAULT 1, last_started_at INTEGER, last_completed_at INTEGER, last_event_id TEXT, status TEXT NOT NULL DEFAULT 'pending');
CREATE TABLE IF NOT EXISTS player_glicko (id TEXT PRIMARY KEY, user_id TEXT REFERENCES "user"(id), player_name TEXT NOT NULL, rating REAL NOT NULL DEFAULT 1500, rating_deviation REAL NOT NULL DEFAULT 350, volatility REAL NOT NULL DEFAULT 0.06, games_played INTEGER NOT NULL DEFAULT 0, last_rating_period TEXT, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS glicko_history (id TEXT PRIMARY KEY, player_id TEXT NOT NULL REFERENCES player_glicko(id), rating_period TEXT NOT NULL, rating_before REAL NOT NULL, rd_before REAL NOT NULL, rating_after REAL NOT NULL, rd_after REAL NOT NULL, volatility_after REAL NOT NULL, delta REAL NOT NULL, games_in_period INTEGER NOT NULL, recorded_at INTEGER NOT NULL);
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

// Mock generateId to return predictable IDs, but keep the real
// upsertMetaEvent (and its transitive Glicko/cube machinery) so this test
// still exercises the shared writer end-to-end against the in-memory DB.
// upsertMetaEventOverride lets one test force a failure partway through the
// insert phase without relying on generateId's output — upsertMetaEvent's
// OWN generateId calls come via a relative `./id` import internal to the
// package, which this mock (applied from outside the package) cannot see or
// control, so an ID-collision trigger is not reachable from here.
let idCounter = 0
let upsertMetaEventOverride: ((...args: unknown[]) => Promise<unknown>) | null = null
vi.mock('@tabletop-tools/server-core', async (importOriginal) => {
  const actual = await importOriginal<typeof ServerCore>()
  return {
    ...actual,
    generateId: () => `id-${++idCounter}`,
    upsertMetaEvent: (...args: unknown[]) =>
      (upsertMetaEventOverride ?? actual.upsertMetaEvent)(
        ...(args as Parameters<typeof actual.upsertMetaEvent>),
      ),
  }
})

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
    upsertMetaEventOverride = null
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

  it('records the error without a manual rollback when upsertMetaEvent fails partway through the insert phase', async () => {
    // D2-01 moved the insert phase (event/players/pairings writes, Glicko,
    // cube rebuild) inside the shared upsertMetaEvent() writer, which owns
    // its own (source, sourceId) delete-then-reinsert idempotency contract
    // (proven separately in packages/server-core/src/meta-ingest.test.ts,
    // "re-upserting the same (source, sourceId) replaces rather than
    // duplicates"). scrape.ts's job is narrower now: catch whatever
    // upsertMetaEvent throws, record it, and move on — it no longer has (or
    // needs) direct knowledge of metaEventPlayers/metaPairings to manually
    // unwind. Forcing that failure via the mocked upsertMetaEvent (rather
    // than an ID collision or schema-constraint hack) is what's actually
    // reachable from this test: upsertMetaEvent's own generateId() calls come
    // via a relative `./id` import internal to the server-core package, so
    // the sequential id-N mock this file applies from outside the package
    // never reaches them.
    const event = makeEvent({ id: 'evt-insertfail', rounds: 1 })
    mockSearchEvents.mockResolvedValue([event])
    mockGetEvent.mockResolvedValue(event)
    mockGetPairings.mockResolvedValue([makePairing(1)])

    upsertMetaEventOverride = vi
      .fn()
      .mockRejectedValueOnce(new Error('simulated insert-phase failure'))

    await runScrape({
      bcpEmail: 'test@example.com',
      bcpPassword: 'pass',
      db,
    })

    // Nothing was ever written for this event — the mocked upsertMetaEvent
    // rejected before touching the DB, and scrape.ts attempts no writes of
    // its own in the insert phase anymore.
    const events = await client.execute(
      "SELECT * FROM meta_events WHERE source_id = 'evt-insertfail'",
    )
    expect(events.rows).toHaveLength(0)

    const jobs = await client.execute('SELECT * FROM bcp_scrape_jobs')
    expect(jobs.rows[0]!.status).toBe('completed')
    expect(String(jobs.rows[0]!.errors)).toContain('evt-insertfail')
    expect(String(jobs.rows[0]!.errors)).toContain('simulated insert-phase failure')
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

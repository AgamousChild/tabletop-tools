import { createClient } from '@libsql/client'
import {
  authCookie,
  createRequestHelper,
  setupAuthTables,
  TEST_SECRET,
  TEST_USER,
} from '@tabletop-tools/auth/src/test-helpers'
import { createDbFromClient } from '@tabletop-tools/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createServer } from './server'

const client = createClient({ url: ':memory:' })
const db = createDbFromClient(client)

beforeAll(async () => {
  await setupAuthTables(client)
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS dim_faction (id TEXT PRIMARY KEY, name TEXT NOT NULL, allegiance TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS dim_faction_alias (alias TEXT PRIMARY KEY, faction_id TEXT NOT NULL REFERENCES dim_faction(id));
    CREATE TABLE IF NOT EXISTS dim_subfaction (id TEXT PRIMARY KEY, name TEXT NOT NULL, faction_id TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS dim_detachment (id TEXT PRIMARY KEY, name TEXT NOT NULL, faction_id TEXT NOT NULL, subfaction_id TEXT);
    CREATE TABLE IF NOT EXISTS dim_for_type (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS dim_granularity (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS dim_region (id INTEGER PRIMARY KEY, name TEXT NOT NULL, country TEXT);
    CREATE TABLE IF NOT EXISTS dim_dataslate (id TEXT PRIMARY KEY, name TEXT NOT NULL, effective_date INTEGER NOT NULL, end_date INTEGER);
    CREATE TABLE IF NOT EXISTS dim_tournament_pack (id TEXT PRIMARY KEY, name TEXT NOT NULL, effective_date INTEGER NOT NULL, end_date INTEGER);
    CREATE TABLE IF NOT EXISTS dim_edition (id TEXT PRIMARY KEY, name TEXT NOT NULL, start_date INTEGER NOT NULL, end_date INTEGER);
    CREATE TABLE IF NOT EXISTS meta_events (id TEXT PRIMARY KEY, name TEXT NOT NULL, date INTEGER NOT NULL, location TEXT, gps_coords TEXT, region_id INTEGER, format TEXT NOT NULL, rounds INTEGER, player_count INTEGER NOT NULL, source TEXT NOT NULL, source_id TEXT, imported_at INTEGER NOT NULL, win_faction_id TEXT, win_subfaction_id TEXT, win_detachment_id TEXT);
    CREATE TABLE IF NOT EXISTS meta_event_players (id TEXT PRIMARY KEY, event_id TEXT NOT NULL, player_name TEXT NOT NULL, source_player_id TEXT, faction_id TEXT NOT NULL, subfaction_id TEXT, detachment_id TEXT, placement INTEGER NOT NULL, list_text TEXT, source_list_id TEXT, wins INTEGER NOT NULL DEFAULT 0, losses INTEGER NOT NULL DEFAULT 0, draws INTEGER NOT NULL DEFAULT 0, gl2_rating_start REAL, gl2_rd_start REAL, gl2_vol_start REAL, gl2_rating_end REAL, gl2_rd_end REAL, gl2_vol_end REAL);
    CREATE TABLE IF NOT EXISTS meta_pairings (id TEXT PRIMARY KEY, event_id TEXT NOT NULL, round INTEGER NOT NULL, player1_id TEXT NOT NULL, player2_id TEXT NOT NULL, player1_score INTEGER, player2_score INTEGER, player1_gl2 REAL, player2_gl2 REAL, result TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS meta_event_win_distribution (id TEXT PRIMARY KEY, event_id TEXT NOT NULL, wins INTEGER NOT NULL, player_count INTEGER NOT NULL, player_pct REAL NOT NULL);
    CREATE TABLE IF NOT EXISTS meta_event_placements (id TEXT PRIMARY KEY, event_id TEXT NOT NULL, tier TEXT NOT NULL, faction_id TEXT NOT NULL, subfaction_id TEXT, detachment_id TEXT, player_name TEXT NOT NULL, placement INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS meta_for (id TEXT PRIMARY KEY, type_id INTEGER NOT NULL, date INTEGER NOT NULL, end_date INTEGER, day INTEGER, month INTEGER, quarter INTEGER, year INTEGER NOT NULL, dataslate_id TEXT, tourney_pack_id TEXT, edition_id TEXT);
    CREATE TABLE IF NOT EXISTS meta_top (id TEXT PRIMARY KEY, granularity_id INTEGER NOT NULL, faction_id TEXT NOT NULL, subfaction_id TEXT, detachment_id TEXT, meta_for_id TEXT NOT NULL, win_rate REAL NOT NULL, draw_rate REAL NOT NULL, over_rep REAL NOT NULL, four_oh_start REAL NOT NULL, event_wins INTEGER NOT NULL DEFAULT 0, event_finals INTEGER NOT NULL DEFAULT 0, event_top4 INTEGER NOT NULL DEFAULT 0, event_top8 INTEGER NOT NULL DEFAULT 0, event_top16 INTEGER NOT NULL DEFAULT 0, player_pop_pct REAL NOT NULL, wins INTEGER NOT NULL DEFAULT 0, losses INTEGER NOT NULL DEFAULT 0, draws INTEGER NOT NULL DEFAULT 0, games INTEGER NOT NULL DEFAULT 0, players INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS fact_game_results (id TEXT PRIMARY KEY, event_id TEXT NOT NULL, player_id TEXT NOT NULL, opponent_id TEXT, round INTEGER NOT NULL, faction_id TEXT NOT NULL, subfaction_id TEXT, detachment_id TEXT, opponent_faction_id TEXT, opponent_subfaction_id TEXT, opponent_detachment_id TEXT, result REAL NOT NULL, player_score INTEGER, opponent_score INTEGER);
    CREATE TABLE IF NOT EXISTS meta_cube_status (id INTEGER PRIMARY KEY DEFAULT 1, last_started_at INTEGER, last_completed_at INTEGER, last_event_id TEXT, status TEXT NOT NULL DEFAULT 'pending');
    CREATE TABLE IF NOT EXISTS bcp_scrape_jobs (id TEXT PRIMARY KEY, started_at INTEGER NOT NULL, completed_at INTEGER, status TEXT NOT NULL DEFAULT 'running', events_found INTEGER DEFAULT 0, events_scraped INTEGER DEFAULT 0, pairings_scraped INTEGER DEFAULT 0, lists_scraped INTEGER DEFAULT 0, errors TEXT, triggered_by TEXT NOT NULL DEFAULT 'cron');
    CREATE TABLE IF NOT EXISTS player_glicko (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES "user"(id),
      player_name TEXT NOT NULL,
      rating REAL NOT NULL DEFAULT 1500,
      rating_deviation REAL NOT NULL DEFAULT 350,
      volatility REAL NOT NULL DEFAULT 0.06,
      games_played INTEGER NOT NULL DEFAULT 0,
      last_rating_period TEXT,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS glicko_history (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL REFERENCES player_glicko(id),
      rating_period TEXT NOT NULL,
      rating_before REAL NOT NULL,
      rd_before REAL NOT NULL,
      rating_after REAL NOT NULL,
      rd_after REAL NOT NULL,
      volatility_after REAL NOT NULL,
      delta REAL NOT NULL,
      games_in_period INTEGER NOT NULL,
      recorded_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tournament_players (
      id TEXT PRIMARY KEY,
      tournament_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      faction TEXT NOT NULL,
      detachment TEXT,
      list_text TEXT,
      list_locked INTEGER NOT NULL DEFAULT 0,
      checked_in INTEGER NOT NULL DEFAULT 0,
      dropped INTEGER NOT NULL DEFAULT 0,
      registered_at INTEGER NOT NULL
    );
  `)

  // Seed the dim tables so frame-filter procedures can resolve names
  // to ids (Rule 6: source code reads from data, doesn't contain it).
  // Ids match production.
  await client.executeMultiple(`
    INSERT INTO dim_for_type (id, name) VALUES
      (1, 'Event'), (2, 'Weekend'), (3, 'Month'), (4, 'Quarter'),
      (5, 'Year'), (6, 'DataSlate'), (7, 'TournamentPack'), (8, 'Edition');
    INSERT INTO dim_granularity (id, name) VALUES
      (1, 'Faction'), (2, 'SubFaction'), (3, 'Detachment');
  `)
})

afterAll(() => client.close())

const makeRequest = createRequestHelper(() => createServer(db, [TEST_USER.email], TEST_SECRET))

describe('HTTP integration — admin.linkPlayer via session cookie', () => {
  it('links a player when authenticated', async () => {
    await client.execute({
      sql: `INSERT INTO player_glicko (id, player_name, updated_at) VALUES (?, ?, ?)`,
      args: ['glicko-1', 'TestPlayer', Date.now()],
    })

    const res = await makeRequest('/trpc/admin.linkPlayer', {
      method: 'POST',
      cookie: await authCookie(),
      body: { glickoId: 'glicko-1', userId: TEST_USER.id },
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.result?.data?.userId).toBe(TEST_USER.id)
    expect(json.result.data.playerName).toBe('TestPlayer')
  })

  it('returns UNAUTHORIZED without a cookie', async () => {
    const res = await makeRequest('/trpc/admin.linkPlayer', {
      method: 'POST',
      body: { glickoId: 'glicko-1', userId: TEST_USER.id },
    })

    const json = (await res.json()) as any
    expect(json.error?.data?.code).toBe('UNAUTHORIZED')
  })
})

describe('HTTP integration — admin.recomputeGlicko via session cookie', () => {
  it('recomputes glicko when authenticated', async () => {
    const res = await makeRequest('/trpc/admin.recomputeGlicko', {
      method: 'POST',
      cookie: await authCookie(),
      body: {},
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.result?.data?.playersUpdated).toBeDefined()
  })

  it('returns UNAUTHORIZED without a cookie', async () => {
    const res = await makeRequest('/trpc/admin.recomputeGlicko', {
      method: 'POST',
      body: {},
    })

    const json = (await res.json()) as any
    expect(json.error?.data?.code).toBe('UNAUTHORIZED')
  })
})

describe('HTTP integration — public endpoints work without auth', () => {
  it('meta.windows works without a cookie', async () => {
    const res = await makeRequest('/trpc/meta.windows')

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(Array.isArray(json.result?.data)).toBe(true)
  })

  it('health endpoint works without a cookie', async () => {
    const res = await makeRequest('/trpc/health')

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.result?.data?.status).toBe('ok')
  })
})

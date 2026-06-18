import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createCallerFactory } from '../trpc'
import { appRouter } from './index'

const client = createClient({ url: ':memory:' })
const db = createDbFromClient(client)

const createCaller = createCallerFactory(appRouter)
const req = new Request('http://localhost')

const adminCtx = {
  user: { id: 'admin-1', email: 'admin@test.com', name: 'Admin' },
  req,
  db,
  adminEmails: ['admin@test.com'],
}

const nonAdminCtx = {
  user: { id: 'user-1', email: 'user@test.com', name: 'User' },
  req,
  db,
  adminEmails: ['admin@test.com'],
}

const unauthCtx = {
  user: null,
  req,
  db,
  adminEmails: ['admin@test.com'],
}

beforeAll(async () => {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS "user" (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      email_verified INTEGER NOT NULL DEFAULT 0,
      image TEXT,
      username TEXT UNIQUE,
      display_username TEXT UNIQUE,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "session" (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES "user"(id),
      token TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "account" (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES "user"(id),
      account_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      access_token TEXT,
      refresh_token TEXT,
      access_token_expires_at INTEGER,
      refresh_token_expires_at INTEGER,
      scope TEXT,
      password TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS dice_sets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES "user"(id),
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES "user"(id),
      dice_set_id TEXT NOT NULL REFERENCES dice_sets(id),
      opponent_name TEXT,
      z_score REAL,
      is_loaded INTEGER,
      photo_url TEXT,
      created_at INTEGER NOT NULL,
      closed_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS rolls (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      pip_values TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS simulations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES "user"(id),
      attacker_content_id TEXT NOT NULL,
      attacker_name TEXT NOT NULL,
      defender_content_id TEXT NOT NULL,
      defender_name TEXT NOT NULL,
      result TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS lists (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES "user"(id),
      faction TEXT NOT NULL,
      name TEXT NOT NULL,
      total_pts INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS list_units (
      id TEXT PRIMARY KEY,
      list_id TEXT NOT NULL REFERENCES lists(id),
      unit_content_id TEXT NOT NULL,
      unit_name TEXT NOT NULL,
      unit_points INTEGER NOT NULL,
      count INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS unit_ratings (
      id TEXT PRIMARY KEY,
      unit_content_id TEXT NOT NULL,
      rating TEXT NOT NULL,
      win_contrib REAL NOT NULL,
      pts_eff REAL NOT NULL,
      meta_window TEXT NOT NULL,
      computed_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES "user"(id),
      list_id TEXT,
      opponent_faction TEXT NOT NULL,
      mission TEXT NOT NULL,
      result TEXT,
      your_final_score INTEGER,
      their_final_score INTEGER,
      is_tournament INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      closed_at INTEGER,
      hidden_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS turns (
      id TEXT PRIMARY KEY,
      match_id TEXT NOT NULL REFERENCES matches(id),
      turn_number INTEGER NOT NULL,
      photo_url TEXT,
      your_units_lost TEXT NOT NULL DEFAULT '[]',
      their_units_lost TEXT NOT NULL DEFAULT '[]',
      primary_scored INTEGER NOT NULL DEFAULT 0,
      secondary_scored INTEGER NOT NULL DEFAULT 0,
      cp_spent INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tournaments (
      id TEXT PRIMARY KEY,
      to_user_id TEXT NOT NULL REFERENCES "user"(id),
      name TEXT NOT NULL,
      event_date INTEGER NOT NULL,
      location TEXT,
      format TEXT NOT NULL,
      total_rounds INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tournament_players (
      id TEXT PRIMARY KEY,
      tournament_id TEXT NOT NULL REFERENCES tournaments(id),
      user_id TEXT NOT NULL REFERENCES "user"(id),
      display_name TEXT NOT NULL,
      faction TEXT NOT NULL,
      detachment TEXT,
      list_text TEXT,
      list_locked INTEGER NOT NULL DEFAULT 0,
      checked_in INTEGER NOT NULL DEFAULT 0,
      dropped INTEGER NOT NULL DEFAULT 0,
      registered_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rounds (
      id TEXT PRIMARY KEY,
      tournament_id TEXT NOT NULL REFERENCES tournaments(id),
      round_number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      start_time TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pairings (
      id TEXT PRIMARY KEY,
      round_id TEXT NOT NULL REFERENCES rounds(id),
      table_number INTEGER NOT NULL,
      player1_id TEXT NOT NULL REFERENCES tournament_players(id),
      player2_id TEXT,
      mission TEXT NOT NULL,
      player1_vp INTEGER,
      player2_vp INTEGER,
      result TEXT,
      reported_by TEXT,
      confirmed INTEGER NOT NULL DEFAULT 0,
      to_override INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS dim_faction (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      allegiance TEXT NOT NULL
    );
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
    CREATE TABLE IF NOT EXISTS bcp_scrape_jobs (
      id TEXT PRIMARY KEY,
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      status TEXT NOT NULL DEFAULT 'running',
      events_found INTEGER DEFAULT 0,
      events_scraped INTEGER DEFAULT 0,
      pairings_scraped INTEGER DEFAULT 0,
      lists_scraped INTEGER DEFAULT 0,
      errors TEXT,
      triggered_by TEXT NOT NULL DEFAULT 'cron'
    );
    CREATE TABLE IF NOT EXISTS meta_events (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      date INTEGER NOT NULL,
      location TEXT,
      gps_coords TEXT,
      region_id INTEGER,
      format TEXT NOT NULL,
      rounds INTEGER,
      player_count INTEGER NOT NULL,
      source TEXT NOT NULL,
      source_id TEXT,
      imported_at INTEGER NOT NULL,
      win_faction_id TEXT,
      win_subfaction_id TEXT,
      win_detachment_id TEXT
    );
    CREATE TABLE IF NOT EXISTS ingest_jobs (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_name TEXT,
      title TEXT,
      status TEXT DEFAULT 'pending' NOT NULL,
      gladia_job_id TEXT,
      transcript TEXT,
      nodes_extracted INTEGER DEFAULT 0,
      error TEXT,
      created_at INTEGER NOT NULL,
      completed_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS ingest_sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ingest_content (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL UNIQUE,
      title TEXT,
      source_id TEXT NOT NULL REFERENCES ingest_sources(id),
      status TEXT NOT NULL DEFAULT 'discovered',
      gladia_job_id TEXT,
      transcript TEXT,
      nodes_extracted INTEGER DEFAULT 0,
      error TEXT,
      discovered_at INTEGER NOT NULL,
      processed_at INTEGER
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
  `)
})

afterAll(() => client.close())

// Helper to clear all data between tests in the "with data" suite
async function clearAllData() {
  await client.executeMultiple(`
    DELETE FROM ingest_content;
    DELETE FROM ingest_sources;
    DELETE FROM ingest_jobs;
    DELETE FROM meta_events;
    DELETE FROM bcp_scrape_jobs;
    DELETE FROM glicko_history;
    DELETE FROM player_glicko;
    DELETE FROM dim_faction;
    DELETE FROM pairings;
    DELETE FROM rounds;
    DELETE FROM tournament_players;
    DELETE FROM tournaments;
    DELETE FROM turns;
    DELETE FROM matches;
    DELETE FROM unit_ratings;
    DELETE FROM list_units;
    DELETE FROM lists;
    DELETE FROM simulations;
    DELETE FROM rolls;
    DELETE FROM sessions;
    DELETE FROM dice_sets;
    DELETE FROM "session";
    DELETE FROM "account";
    DELETE FROM "user";
  `)
}

describe('stats router', () => {
  describe('health', () => {
    it('returns ok', async () => {
      const caller = createCaller(adminCtx)
      const result = await caller.health()
      expect(result).toEqual({ status: 'ok' })
    })
  })

  describe('stats.overview — access control', () => {
    it('rejects unauthenticated users', async () => {
      const caller = createCaller(unauthCtx)
      await expect(caller.stats.overview()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    })

    it('rejects non-admin users', async () => {
      const caller = createCaller(nonAdminCtx)
      await expect(caller.stats.overview()).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })
  })

  describe('stats.overview — empty database', () => {
    beforeEach(() => clearAllData())

    it('returns all zeros for empty db', async () => {
      const caller = createCaller(adminCtx)
      const result = await caller.stats.overview()
      expect(result).toEqual({
        users: { total: 0, recent: 0 },
        sessions: { active: 0, total: 0 },
        noCheat: { diceSets: 0, rollingSessions: 0, totalRolls: 0 },
        versus: { simulations: 0 },
        listBuilder: { lists: 0, units: 0 },
        gameTracker: { matches: 0, turns: 0 },
        tournament: { tournaments: 0, players: 0 },
        newMeta: { events: 0, glickoPlayers: 0 },
      })
    })
  })

  describe('stats.overview — with data', () => {
    const now = Math.floor(Date.now() / 1000)
    const threeDaysAgoSec = now - 3 * 86400
    const thirtyDaysAgoSec = now - 30 * 86400

    beforeEach(async () => {
      await clearAllData()

      // Insert users
      await client.executeMultiple(`
        INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES ('u1', 'Alice', 'alice@test.com', 0, ${thirtyDaysAgoSec}, ${now});
        INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES ('u2', 'Bob', 'bob@test.com', 0, ${threeDaysAgoSec}, ${now});
        INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES ('u3', 'Carol', 'carol@test.com', 0, ${threeDaysAgoSec}, ${now});
      `)

      // Auth sessions (1 active future expiry, 1 expired)
      const futureTs = now + 86400
      const pastTs = now - 86400
      await client.executeMultiple(`
        INSERT INTO "session" (id, user_id, token, expires_at, created_at, updated_at) VALUES ('s1', 'u1', 'tok1', ${futureTs}, ${now}, ${now});
        INSERT INTO "session" (id, user_id, token, expires_at, created_at, updated_at) VALUES ('s2', 'u2', 'tok2', ${pastTs}, ${now - 86400 * 2}, ${now});
      `)

      // NoCheat data
      await client.executeMultiple(`
        INSERT INTO dice_sets (id, user_id, name, created_at) VALUES ('ds1', 'u1', 'Red dice', ${now});
        INSERT INTO dice_sets (id, user_id, name, created_at) VALUES ('ds2', 'u2', 'Blue dice', ${now});
        INSERT INTO sessions (id, user_id, dice_set_id, created_at) VALUES ('rs1', 'u1', 'ds1', ${now});
        INSERT INTO rolls (id, session_id, pip_values, created_at) VALUES ('r1', 'rs1', '[3,4,5]', ${now});
        INSERT INTO rolls (id, session_id, pip_values, created_at) VALUES ('r2', 'rs1', '[1,2,6]', ${now});
      `)

      // Versus data
      await client.executeMultiple(`
        INSERT INTO simulations (id, user_id, attacker_content_id, attacker_name, defender_content_id, defender_name, result, created_at) VALUES ('sim1', 'u1', 'a1', 'Marine', 'd1', 'Ork', '{}', ${now});
        INSERT INTO simulations (id, user_id, attacker_content_id, attacker_name, defender_content_id, defender_name, result, created_at) VALUES ('sim2', 'u2', 'a2', 'Eldar', 'd2', 'Tau', '{}', ${now});
        INSERT INTO simulations (id, user_id, attacker_content_id, attacker_name, defender_content_id, defender_name, result, created_at) VALUES ('sim3', 'u1', 'a3', 'Necron', 'd3', 'Guard', '{}', ${now});
      `)

      // List builder data
      await client.executeMultiple(`
        INSERT INTO lists (id, user_id, faction, name, total_pts, created_at, updated_at) VALUES ('l1', 'u1', 'Space Marines', 'My list', 2000, ${now}, ${now});
        INSERT INTO list_units (id, list_id, unit_content_id, unit_name, unit_points) VALUES ('lu1', 'l1', 'uc1', 'Intercessors', 100);
        INSERT INTO list_units (id, list_id, unit_content_id, unit_name, unit_points) VALUES ('lu2', 'l1', 'uc2', 'Hellblaster', 200);
      `)

      // Game tracker data
      await client.executeMultiple(`
        INSERT INTO matches (id, user_id, opponent_faction, mission, created_at) VALUES ('m1', 'u1', 'Orks', 'Purge', ${now});
        INSERT INTO matches (id, user_id, opponent_faction, mission, created_at) VALUES ('m2', 'u2', 'Eldar', 'Control', ${now});
        INSERT INTO turns (id, match_id, turn_number, created_at) VALUES ('t1', 'm1', 1, ${now});
        INSERT INTO turns (id, match_id, turn_number, created_at) VALUES ('t2', 'm1', 2, ${now});
        INSERT INTO turns (id, match_id, turn_number, created_at) VALUES ('t3', 'm2', 1, ${now});
      `)

      // Tournament data
      await client.executeMultiple(`
        INSERT INTO tournaments (id, to_user_id, name, event_date, format, total_rounds, created_at) VALUES ('tour1', 'u1', 'GT 2025', ${now}, 'GT', 5, ${now});
        INSERT INTO tournament_players (id, tournament_id, user_id, display_name, faction, registered_at) VALUES ('tp1', 'tour1', 'u1', 'Alice', 'Marines', ${now});
        INSERT INTO tournament_players (id, tournament_id, user_id, display_name, faction, registered_at) VALUES ('tp2', 'tour1', 'u2', 'Bob', 'Orks', ${now});
      `)

      // New Meta data
      await client.executeMultiple(`
        INSERT INTO meta_events (id, name, date, format, player_count, source, source_id, imported_at) VALUES ('evt-nm1', 'LVO 2025', ${now}, 'GT', 100, 'bcp', 'bcp-lvo', ${now});
        INSERT INTO meta_events (id, name, date, format, player_count, source, source_id, imported_at) VALUES ('evt-nm2', 'Adepticon 2025', ${now}, 'GT', 200, 'bcp', 'bcp-adept', ${now});
        INSERT INTO player_glicko (id, player_name, rating, rating_deviation, volatility, games_played, updated_at) VALUES ('pg1', 'Alice', 1600, 150, 0.06, 10, ${now});
        INSERT INTO player_glicko (id, player_name, rating, rating_deviation, volatility, games_played, updated_at) VALUES ('pg2', 'Bob', 1500, 200, 0.06, 5, ${now});
        INSERT INTO player_glicko (id, player_name, rating, rating_deviation, volatility, games_played, updated_at) VALUES ('pg3', 'Carol', 1400, 300, 0.06, 2, ${now});
      `)
    })

    it('returns correct user counts', async () => {
      const caller = createCaller(adminCtx)
      const result = await caller.stats.overview()
      expect(result.users.total).toBe(3)
      // "recent" = created in last 7 days — Bob and Carol are 3 days old
      expect(result.users.recent).toBe(2)
    })

    it('returns correct session counts', async () => {
      const caller = createCaller(adminCtx)
      const result = await caller.stats.overview()
      expect(result.sessions.total).toBe(2)
      expect(result.sessions.active).toBe(1)
    })

    it('returns correct no-cheat stats', async () => {
      const caller = createCaller(adminCtx)
      const result = await caller.stats.overview()
      expect(result.noCheat.diceSets).toBe(2)
      expect(result.noCheat.rollingSessions).toBe(1)
      expect(result.noCheat.totalRolls).toBe(2)
    })

    it('returns correct versus stats', async () => {
      const caller = createCaller(adminCtx)
      const result = await caller.stats.overview()
      expect(result.versus.simulations).toBe(3)
    })

    it('returns correct list builder stats', async () => {
      const caller = createCaller(adminCtx)
      const result = await caller.stats.overview()
      expect(result.listBuilder.lists).toBe(1)
      expect(result.listBuilder.units).toBe(2)
    })

    it('returns correct game tracker stats', async () => {
      const caller = createCaller(adminCtx)
      const result = await caller.stats.overview()
      expect(result.gameTracker.matches).toBe(2)
      expect(result.gameTracker.turns).toBe(3)
    })

    it('returns correct tournament stats', async () => {
      const caller = createCaller(adminCtx)
      const result = await caller.stats.overview()
      expect(result.tournament.tournaments).toBe(1)
      expect(result.tournament.players).toBe(2)
    })

    it('returns correct new-meta stats', async () => {
      const caller = createCaller(adminCtx)
      const result = await caller.stats.overview()
      expect(result.newMeta.events).toBe(2)
      expect(result.newMeta.glickoPlayers).toBe(3)
    })
  })

  describe('stats.recentUsers', () => {
    beforeEach(() => clearAllData())

    it('rejects unauthenticated users', async () => {
      const caller = createCaller(unauthCtx)
      await expect(caller.stats.recentUsers()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    })

    it('rejects non-admin users', async () => {
      const caller = createCaller(nonAdminCtx)
      await expect(caller.stats.recentUsers()).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })

    it('returns empty list for empty db', async () => {
      const caller = createCaller(adminCtx)
      const result = await caller.stats.recentUsers()
      expect(result).toEqual([])
    })

    it('returns users sorted by createdAt desc', async () => {
      const now = Math.floor(Date.now() / 1000)
      await client.executeMultiple(`
        INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES ('u1', 'Alice', 'alice@test.com', 0, ${now - 86400 * 2}, ${now});
        INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES ('u2', 'Bob', 'bob@test.com', 0, ${now}, ${now});
        INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES ('u3', 'Carol', 'carol@test.com', 0, ${now - 86400}, ${now});
      `)

      const caller = createCaller(adminCtx)
      const result = await caller.stats.recentUsers()
      expect(result.length).toBe(3)
      expect(result[0].name).toBe('Bob')
      expect(result[1].name).toBe('Carol')
      expect(result[2].name).toBe('Alice')
    })

    it('respects limit parameter', async () => {
      const now = Math.floor(Date.now() / 1000)
      await client.executeMultiple(`
        INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES ('u4', 'Dave', 'dave@test.com', 0, ${now - 86400}, ${now});
        INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES ('u5', 'Eve', 'eve@test.com', 0, ${now}, ${now});
      `)

      const caller = createCaller(adminCtx)
      const result = await caller.stats.recentUsers({ limit: 1 })
      expect(result.length).toBe(1)
      expect(result[0].name).toBe('Eve')
    })
  })

  describe('stats.activeSessions', () => {
    beforeEach(() => clearAllData())

    it('rejects non-admin users', async () => {
      const caller = createCaller(nonAdminCtx)
      await expect(caller.stats.activeSessions()).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })

    it('returns only non-expired sessions', async () => {
      const now = Math.floor(Date.now() / 1000)
      const futureTs = now + 86400
      const pastTs = now - 86400

      await client.executeMultiple(`
        INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES ('u1', 'Alice', 'alice@test.com', 0, ${now}, ${now});
        INSERT INTO "session" (id, user_id, token, expires_at, created_at, updated_at) VALUES ('s1', 'u1', 'tok1', ${futureTs}, ${now}, ${now});
        INSERT INTO "session" (id, user_id, token, expires_at, created_at, updated_at) VALUES ('s2', 'u1', 'tok2', ${pastTs}, ${now}, ${now});
      `)

      const caller = createCaller(adminCtx)
      const result = await caller.stats.activeSessions()
      expect(result.length).toBe(1)
      expect(result[0].id).toBe('s1')
      expect(result[0].userName).toBe('Alice')
    })
  })

  describe('stats.appActivity', () => {
    beforeEach(() => clearAllData())

    it('rejects non-admin users', async () => {
      const caller = createCaller(nonAdminCtx)
      await expect(caller.stats.appActivity()).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })

    it('returns activity per app', async () => {
      const now = Math.floor(Date.now() / 1000)
      await client.executeMultiple(`
        INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES ('u1', 'Alice', 'alice@test.com', 0, ${now}, ${now});
        INSERT INTO simulations (id, user_id, attacker_content_id, attacker_name, defender_content_id, defender_name, result, created_at) VALUES ('sim1', 'u1', 'a1', 'A', 'd1', 'D', '{}', ${now});
        INSERT INTO simulations (id, user_id, attacker_content_id, attacker_name, defender_content_id, defender_name, result, created_at) VALUES ('sim2', 'u1', 'a2', 'B', 'd2', 'E', '{}', ${now - 86400 * 2});
        INSERT INTO matches (id, user_id, opponent_faction, mission, created_at) VALUES ('m1', 'u1', 'Orks', 'Purge', ${now});
      `)

      const caller = createCaller(adminCtx)
      const result = await caller.stats.appActivity()
      expect(result).toContainEqual(expect.objectContaining({ app: 'versus', total: 2 }))
      expect(result).toContainEqual(expect.objectContaining({ app: 'game-tracker', total: 1 }))
    })

    it('returns zero counts for apps with no data', async () => {
      const caller = createCaller(adminCtx)
      const result = await caller.stats.appActivity()
      expect(result.length).toBe(6)
      for (const entry of result) {
        expect(entry.total).toBe(0)
        expect(entry.recent).toBe(0)
      }
    })
  })

  describe('stats.recentEvents', () => {
    beforeEach(() => clearAllData())

    it('rejects non-admin users', async () => {
      const caller = createCaller(nonAdminCtx)
      await expect(caller.stats.recentEvents()).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })

    it('returns empty list for empty db', async () => {
      const caller = createCaller(adminCtx)
      const result = await caller.stats.recentEvents()
      expect(result).toEqual([])
    })

    it('returns events sorted by date desc', async () => {
      const now = Date.now()
      await client.executeMultiple(`
        INSERT INTO meta_events (id, name, date, location, format, rounds, player_count, source, source_id, imported_at) VALUES ('evt1', 'LVO 2026', ${now - 86400000}, 'Las Vegas, NV', 'GT', 8, 200, 'bcp', 'bcp1', ${now});
        INSERT INTO meta_events (id, name, date, location, format, rounds, player_count, source, source_id, imported_at) VALUES ('evt2', 'Adepticon 2026', ${now}, 'Milwaukee, WI', 'GT', 9, 400, 'bcp', 'bcp2', ${now});
      `)

      const caller = createCaller(adminCtx)
      const result = await caller.stats.recentEvents()
      expect(result.length).toBe(2)
      expect(result[0].name).toBe('Adepticon 2026')
      expect(result[0].playerCount).toBe(400)
      expect(result[1].name).toBe('LVO 2026')
    })
  })

  describe('stats.topFactions', () => {
    beforeEach(() => clearAllData())

    it('rejects non-admin users', async () => {
      const caller = createCaller(nonAdminCtx)
      await expect(caller.stats.topFactions()).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })

    it('returns empty list for empty db', async () => {
      const caller = createCaller(adminCtx)
      const result = await caller.stats.topFactions()
      expect(result).toEqual([])
    })

    it('returns factions ranked by tournament appearances', async () => {
      const now = Math.floor(Date.now() / 1000)
      await client.executeMultiple(`
        INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES ('u1', 'Alice', 'alice@test.com', 0, ${now}, ${now});
        INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES ('u2', 'Bob', 'bob@test.com', 0, ${now}, ${now});
        INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES ('u3', 'Carol', 'carol@test.com', 0, ${now}, ${now});
        INSERT INTO tournaments (id, to_user_id, name, event_date, format, total_rounds, created_at) VALUES ('t1', 'u1', 'GT', ${now}, 'GT', 5, ${now});
        INSERT INTO tournament_players (id, tournament_id, user_id, display_name, faction, registered_at) VALUES ('tp1', 't1', 'u1', 'Alice', 'Space Marines', ${now});
        INSERT INTO tournament_players (id, tournament_id, user_id, display_name, faction, registered_at) VALUES ('tp2', 't1', 'u2', 'Bob', 'Space Marines', ${now});
        INSERT INTO tournament_players (id, tournament_id, user_id, display_name, faction, registered_at) VALUES ('tp3', 't1', 'u3', 'Carol', 'Orks', ${now});
      `)

      const caller = createCaller(adminCtx)
      const result = await caller.stats.topFactions()
      expect(result[0].faction).toBe('Space Marines')
      expect(result[0].count).toBe(2)
      expect(result[1].faction).toBe('Orks')
      expect(result[1].count).toBe(1)
    })
  })

  describe('stats.matchResults', () => {
    beforeEach(() => clearAllData())

    it('rejects non-admin users', async () => {
      const caller = createCaller(nonAdminCtx)
      await expect(caller.stats.matchResults()).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })

    it('returns win/loss/draw distribution', async () => {
      const now = Math.floor(Date.now() / 1000)
      await client.executeMultiple(`
        INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES ('u1', 'Alice', 'alice@test.com', 0, ${now}, ${now});
        INSERT INTO matches (id, user_id, opponent_faction, mission, result, created_at) VALUES ('m1', 'u1', 'Orks', 'Purge', 'WIN', ${now});
        INSERT INTO matches (id, user_id, opponent_faction, mission, result, created_at) VALUES ('m2', 'u1', 'Eldar', 'Control', 'WIN', ${now});
        INSERT INTO matches (id, user_id, opponent_faction, mission, result, created_at) VALUES ('m3', 'u1', 'Tau', 'Take', 'LOSS', ${now});
        INSERT INTO matches (id, user_id, opponent_faction, mission, result, created_at) VALUES ('m4', 'u1', 'Necrons', 'Hold', null, ${now});
      `)

      const caller = createCaller(adminCtx)
      const result = await caller.stats.matchResults()
      expect(result.wins).toBe(2)
      expect(result.losses).toBe(1)
      expect(result.draws).toBe(0)
      expect(result.inProgress).toBe(1)
      expect(result.total).toBe(4)
    })
  })

  describe('stats.revokeSession', () => {
    beforeEach(async () => {
      await clearAllData()
      const now = Math.floor(Date.now() / 1000)
      const futureTs = now + 86400
      await client.executeMultiple(`
        INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES ('u1', 'Alice', 'alice@test.com', 0, ${now}, ${now});
        INSERT INTO "session" (id, user_id, token, expires_at, created_at, updated_at) VALUES ('s1', 'u1', 'tok1', ${futureTs}, ${now}, ${now});
      `)
    })

    it('revokes an active session', async () => {
      const caller = createCaller(adminCtx)
      const result = await caller.stats.revokeSession({ sessionId: 's1' })
      expect(result.revoked).toBe(true)
    })

    it('throws NOT_FOUND for unknown session', async () => {
      const caller = createCaller(adminCtx)
      await expect(caller.stats.revokeSession({ sessionId: 'no-such' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })

    it('rejects non-admin', async () => {
      const caller = createCaller(nonAdminCtx)
      await expect(caller.stats.revokeSession({ sessionId: 's1' })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      })
    })
  })

  describe('stats.revokeAllSessions', () => {
    beforeEach(async () => {
      await clearAllData()
      const now = Math.floor(Date.now() / 1000)
      const futureTs = now + 86400
      await client.executeMultiple(`
        INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES ('u1', 'Alice', 'alice@test.com', 0, ${now}, ${now});
        INSERT INTO "session" (id, user_id, token, expires_at, created_at, updated_at) VALUES ('s1', 'u1', 'tok1', ${futureTs}, ${now}, ${now});
        INSERT INTO "session" (id, user_id, token, expires_at, created_at, updated_at) VALUES ('s2', 'u1', 'tok2', ${futureTs}, ${now}, ${now});
      `)
    })

    it('revokes all sessions for a user', async () => {
      const caller = createCaller(adminCtx)
      const result = await caller.stats.revokeAllSessions({ userId: 'u1' })
      expect(result.revoked).toBe(true)
    })

    it('throws NOT_FOUND for unknown user', async () => {
      const caller = createCaller(adminCtx)
      await expect(caller.stats.revokeAllSessions({ userId: 'no-such' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })
  })

  describe('stats.deleteUser', () => {
    beforeEach(async () => {
      await clearAllData()
      const now = Math.floor(Date.now() / 1000)
      await client.executeMultiple(`
        INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES ('u1', 'Alice', 'alice@test.com', 0, ${now}, ${now});
      `)
    })

    it('deletes a user', async () => {
      const caller = createCaller(adminCtx)
      const result = await caller.stats.deleteUser({ userId: 'u1' })
      expect(result.deleted).toBe(true)
    })

    it('throws NOT_FOUND for unknown user', async () => {
      const caller = createCaller(adminCtx)
      await expect(caller.stats.deleteUser({ userId: 'no-such' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })

    it('rejects non-admin', async () => {
      const caller = createCaller(nonAdminCtx)
      await expect(caller.stats.deleteUser({ userId: 'u1' })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      })
    })
  })

  describe('stats.bcpScraperStatus', () => {
    beforeEach(() => clearAllData())

    it('rejects non-admin users', async () => {
      const caller = createCaller(nonAdminCtx)
      await expect(caller.stats.bcpScraperStatus()).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })

    it('returns null job when no jobs exist', async () => {
      const caller = createCaller(adminCtx)
      const result = await caller.stats.bcpScraperStatus()
      expect(result.latestJob).toBeNull()
      expect(result.totalEvents).toBe(0)
    })

    it('returns latest job when jobs exist', async () => {
      const now = Math.floor(Date.now() / 1000)
      await client.executeMultiple(`
        INSERT INTO bcp_scrape_jobs (id, started_at, completed_at, status, events_found, events_scraped, pairings_scraped, triggered_by) VALUES ('j1', ${now - 3600}, ${now - 3500}, 'completed', 10, 8, 50, 'cron');
        INSERT INTO bcp_scrape_jobs (id, started_at, status, events_found, triggered_by) VALUES ('j2', ${now}, 'running', 5, 'manual');
        INSERT INTO meta_events (id, name, date, format, rounds, player_count, source, source_id, imported_at) VALUES ('e1', 'GT Alpha', ${new Date('2026-01-15').getTime()}, 'GT', 5, 32, 'bcp', 'bcp-e1', ${now});
        INSERT INTO meta_events (id, name, date, format, rounds, player_count, source, source_id, imported_at) VALUES ('e2', 'GT Beta', ${new Date('2026-02-01').getTime()}, 'GT', 5, 48, 'bcp', 'bcp-e2', ${now});
      `)

      const caller = createCaller(adminCtx)
      const result = await caller.stats.bcpScraperStatus()
      expect(result.latestJob).not.toBeNull()
      expect(result.latestJob!.id).toBe('j2')
      expect(result.latestJob!.status).toBe('running')
      expect(result.totalEvents).toBe(2)
    })
  })

  describe('stats.bcpScraperHistory', () => {
    beforeEach(() => clearAllData())

    it('rejects non-admin users', async () => {
      const caller = createCaller(nonAdminCtx)
      await expect(caller.stats.bcpScraperHistory({ limit: 20 })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      })
    })

    it('returns jobs ordered by started_at desc', async () => {
      const now = Math.floor(Date.now() / 1000)
      await client.executeMultiple(`
        INSERT INTO bcp_scrape_jobs (id, started_at, completed_at, status, events_found, events_scraped, triggered_by) VALUES ('j1', ${now - 7200}, ${now - 7100}, 'completed', 10, 8, 'cron');
        INSERT INTO bcp_scrape_jobs (id, started_at, completed_at, status, events_found, events_scraped, triggered_by) VALUES ('j2', ${now - 3600}, ${now - 3500}, 'completed', 5, 5, 'cron');
        INSERT INTO bcp_scrape_jobs (id, started_at, status, events_found, triggered_by) VALUES ('j3', ${now}, 'running', 3, 'manual');
      `)

      const caller = createCaller(adminCtx)
      const result = await caller.stats.bcpScraperHistory({ limit: 20 })
      expect(result.length).toBe(3)
      expect(result[0].id).toBe('j3')
      expect(result[1].id).toBe('j2')
      expect(result[2].id).toBe('j1')
    })

    it('respects limit parameter', async () => {
      const now = Math.floor(Date.now() / 1000)
      await client.executeMultiple(`
        INSERT INTO bcp_scrape_jobs (id, started_at, status, triggered_by) VALUES ('j1', ${now - 7200}, 'completed', 'cron');
        INSERT INTO bcp_scrape_jobs (id, started_at, status, triggered_by) VALUES ('j2', ${now - 3600}, 'completed', 'cron');
        INSERT INTO bcp_scrape_jobs (id, started_at, status, triggered_by) VALUES ('j3', ${now}, 'running', 'manual');
      `)

      const caller = createCaller(adminCtx)
      const result = await caller.stats.bcpScraperHistory({ limit: 2 })
      expect(result.length).toBe(2)
      expect(result[0].id).toBe('j3')
      expect(result[1].id).toBe('j2')
    })
  })

  describe('stats.triggerBcpScrape', () => {
    it('rejects non-admin users', async () => {
      const caller = createCaller(nonAdminCtx)
      await expect(caller.stats.triggerBcpScrape()).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })

    it('returns error when service binding not configured', async () => {
      const caller = createCaller(adminCtx)
      const result = await caller.stats.triggerBcpScrape()
      expect(result.status).toBe('error')
      expect(result.message).toContain('not configured')
    })
  })

  describe('stats.triggerMetaPipeline', () => {
    it('rejects non-admin users', async () => {
      const caller = createCaller(nonAdminCtx)
      await expect(caller.stats.triggerMetaPipeline()).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })

    it('returns placeholder status', async () => {
      const caller = createCaller(adminCtx)
      const result = await caller.stats.triggerMetaPipeline()
      expect(result.status).toBe('not-configured')
      expect(result.message).toContain('not configured')
    })
  })

  describe('stats.ingestJobs', () => {
    beforeEach(() => clearAllData())

    it('returns empty array when no content', async () => {
      const caller = createCaller(adminCtx)
      const result = await caller.stats.ingestJobs({ limit: 50 })
      expect(result).toEqual([])
    })

    it('returns content ordered by discovered_at desc', async () => {
      const now = Date.now()
      await client.executeMultiple(`
        INSERT INTO ingest_sources (id, name, url, type, active, created_at) VALUES ('auspex', 'Auspex Tactics', 'https://youtube.com/@AuspexTactics', 'youtube', 1, ${now});
        INSERT INTO ingest_sources (id, name, url, type, active, created_at) VALUES ('whc', 'WHC', 'https://warhammer-community.com', 'web', 1, ${now});
        INSERT INTO ingest_content (id, url, title, source_id, status, nodes_extracted, discovered_at) VALUES ('ic1', 'https://youtube.com/watch?v=abc', 'Video Title', 'auspex', 'completed', 5, ${now - 3600000});
        INSERT INTO ingest_content (id, url, title, source_id, status, nodes_extracted, discovered_at) VALUES ('ic2', 'https://example.com/article', 'Article Title', 'whc', 'discovered', 0, ${now});
      `)

      const caller = createCaller(adminCtx)
      const result = await caller.stats.ingestJobs({ limit: 50 })
      expect(result.length).toBe(2)
      expect(result[0].id).toBe('ic2')
      expect(result[0].title).toBe('Article Title')
      expect(result[0].sourceName).toBe('WHC')
      expect(result[1].id).toBe('ic1')
    })

    it('rejects non-admin users', async () => {
      const caller = createCaller(nonAdminCtx)
      await expect(caller.stats.ingestJobs({ limit: 50 })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      })
    })
  })

  describe('stats.triggerYoutubeIngest', () => {
    it('returns error when service binding not configured', async () => {
      const caller = createCaller(adminCtx)
      const result = await caller.stats.triggerYoutubeIngest({
        url: 'https://youtube.com/watch?v=abc',
      })
      expect(result.status).toBe('error')
      expect(result.message).toContain('not configured')
    })

    it('rejects non-admin users', async () => {
      const caller = createCaller(nonAdminCtx)
      await expect(
        caller.stats.triggerYoutubeIngest({ url: 'https://youtube.com/watch?v=abc' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })
  })

  describe('stats.triggerWebIngest', () => {
    it('returns error when service binding not configured', async () => {
      const caller = createCaller(adminCtx)
      const result = await caller.stats.triggerWebIngest({ url: 'https://example.com/article' })
      expect(result.status).toBe('error')
      expect(result.message).toContain('not configured')
    })

    it('rejects non-admin users', async () => {
      const caller = createCaller(nonAdminCtx)
      await expect(
        caller.stats.triggerWebIngest({ url: 'https://example.com/article' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })
  })
})

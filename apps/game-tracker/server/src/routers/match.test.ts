import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createNullR2Storage } from '../lib/storage/r2'
import { createCallerFactory } from '../trpc'
import { appRouter } from './index'

const client = createClient({ url: ':memory:' })
const db = createDbFromClient(client)
const storage = createNullR2Storage()

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
      opponent_name TEXT,
      opponent_detachment TEXT,
      your_faction TEXT,
      your_detachment TEXT,
      terrain_layout TEXT,
      deployment_zone TEXT,
      twist_cards TEXT,
      challenger_cards TEXT,
      require_photos INTEGER NOT NULL DEFAULT 0,
      attacker_defender TEXT,
      who_goes_first TEXT,
      date INTEGER,
      location TEXT,
      tournament_name TEXT,
      tournament_id TEXT,
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
      your_cp_start INTEGER NOT NULL DEFAULT 0,
      your_cp_gained INTEGER NOT NULL DEFAULT 1,
      your_cp_spent INTEGER NOT NULL DEFAULT 0,
      their_cp_start INTEGER NOT NULL DEFAULT 0,
      their_cp_gained INTEGER NOT NULL DEFAULT 1,
      their_cp_spent INTEGER NOT NULL DEFAULT 0,
      your_primary INTEGER NOT NULL DEFAULT 0,
      their_primary INTEGER NOT NULL DEFAULT 0,
      your_secondary INTEGER NOT NULL DEFAULT 0,
      their_secondary INTEGER NOT NULL DEFAULT 0,
      your_photo_url TEXT,
      their_photo_url TEXT,
      your_units_destroyed TEXT NOT NULL DEFAULT '[]',
      their_units_destroyed TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tournaments (
      id TEXT PRIMARY KEY,
      to_user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      event_date INTEGER NOT NULL,
      location TEXT,
      format TEXT NOT NULL,
      total_rounds INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      description TEXT,
      image_url TEXT,
      external_link TEXT,
      start_time TEXT,
      latitude REAL,
      longitude REAL,
      mission_pool TEXT,
      require_photos INTEGER NOT NULL DEFAULT 0,
      include_twists INTEGER NOT NULL DEFAULT 0,
      include_challenger INTEGER NOT NULL DEFAULT 0,
      max_players INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tournament_players (
      id TEXT PRIMARY KEY,
      tournament_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      faction TEXT NOT NULL,
      detachment TEXT,
      list_text TEXT,
      list_id TEXT,
      list_locked INTEGER NOT NULL DEFAULT 0,
      checked_in INTEGER NOT NULL DEFAULT 0,
      dropped INTEGER NOT NULL DEFAULT 0,
      registered_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rounds (
      id TEXT PRIMARY KEY,
      tournament_id TEXT NOT NULL,
      round_number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      start_time TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pairings (
      id TEXT PRIMARY KEY,
      round_id TEXT NOT NULL,
      table_number INTEGER NOT NULL,
      player1_id TEXT NOT NULL,
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
    CREATE TABLE IF NOT EXISTS match_secondaries (
      id TEXT PRIMARY KEY,
      match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      player TEXT NOT NULL,
      secondary_name TEXT NOT NULL,
      vp_per_round TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE IF NOT EXISTS stratagem_log (
      id TEXT PRIMARY KEY,
      turn_id TEXT NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
      player TEXT NOT NULL,
      stratagem_name TEXT NOT NULL,
      cp_cost INTEGER NOT NULL DEFAULT 1
    );
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES ('user-1', 'Alice', 'alice@example.com', 0, 0, 0);
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES ('user-2', 'Bob', 'bob@example.com', 0, 0, 0);
  `)
})

afterAll(() => client.close())

const createCaller = createCallerFactory(appRouter)
const req = new Request('http://localhost')
const ctx = {
  user: { id: 'user-1', email: 'alice@example.com', name: 'Alice' },
  req,
  db,
  storage,
}
const ctx2 = {
  user: { id: 'user-2', email: 'bob@example.com', name: 'Bob' },
  req,
  db,
  storage,
}
const unauthCtx = { user: null, req, db, storage }

describe('match.start', () => {
  it('creates a new match and returns it', async () => {
    const caller = createCaller(ctx)
    const match = await caller.match.start({
      opponentFaction: 'Orks',
      mission: 'Scorched Earth',
    })
    expect(match.id).toBeTruthy()
    expect(match.opponentFaction).toBe('Orks')
    expect(match.mission).toBe('Scorched Earth')
    expect(match.result).toBeNull()
    expect(match.isTournament).toBe(0)
  })

  it('creates a tournament match when isTournament is set', async () => {
    const caller = createCaller(ctx)
    const match = await caller.match.start({
      opponentFaction: 'Necrons',
      mission: 'Priority Targets',
      isTournament: true,
    })
    expect(match.isTournament).toBe(1)
  })

  it('stores twistCards, challengerCards, and requirePhotos', async () => {
    const caller = createCaller(ctx)
    const match = await caller.match.start({
      opponentFaction: 'Drukhari',
      mission: 'Sites of Power',
      twistCards: '["Chilling Rain"]',
      challengerCards: '["Rise to the Challenge"]',
      requirePhotos: true,
    })
    expect(match.twistCards).toBe('["Chilling Rain"]')
    expect(match.challengerCards).toBe('["Rise to the Challenge"]')
    expect(match.requirePhotos).toBe(1)
  })

  it('defaults requirePhotos to 0', async () => {
    const caller = createCaller(ctx)
    const match = await caller.match.start({
      opponentFaction: 'Tau',
      mission: 'Purge the Foe',
    })
    expect(match.requirePhotos).toBe(0)
  })

  it('rejects unauthenticated callers', async () => {
    const caller = createCaller(unauthCtx)
    await expect(
      caller.match.start({ opponentFaction: 'Orks', mission: 'Test' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})

describe('match.list', () => {
  it('returns matches for the current user only', async () => {
    const caller = createCaller(ctx)
    const matches = await caller.match.list()
    expect(Array.isArray(matches)).toBe(true)
    expect(matches.every((m) => m.userId === 'user-1')).toBe(true)
  })

  it('rejects unauthenticated callers', async () => {
    const caller = createCaller(unauthCtx)
    await expect(caller.match.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})

describe('match.get', () => {
  it('returns a match with its turns and secondaries', async () => {
    const caller = createCaller(ctx)
    const created = await caller.match.start({ opponentFaction: 'Tau', mission: 'Capture' })

    const fetched = await caller.match.get({ id: created.id })
    expect(fetched.id).toBe(created.id)
    expect(Array.isArray(fetched.turns)).toBe(true)
    expect(fetched.turns).toHaveLength(0)
    expect(Array.isArray(fetched.secondaries)).toBe(true)
    expect(fetched.secondaries).toHaveLength(0)
  })

  it('throws NOT_FOUND for unknown id', async () => {
    const caller = createCaller(ctx)
    await expect(caller.match.get({ id: 'nonexistent' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('throws NOT_FOUND for match owned by another user', async () => {
    const caller1 = createCaller(ctx)
    const match = await caller1.match.start({ opponentFaction: 'Orks', mission: 'Test' })

    const caller2 = createCaller(ctx2)
    await expect(caller2.match.get({ id: match.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('rejects unauthenticated callers', async () => {
    const caller = createCaller(unauthCtx)
    await expect(caller.match.get({ id: 'any' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
  })
})

describe('match.close', () => {
  it('closes a match with WIN result', async () => {
    const caller = createCaller(ctx)
    const match = await caller.match.start({ opponentFaction: 'Chaos', mission: 'Annihilation' })

    const result = await caller.match.close({
      matchId: match.id,
      yourScore: 85,
      theirScore: 72,
    })
    expect(result.result).toBe('WIN')
    expect(result.yourScore).toBe(85)
    expect(result.theirScore).toBe(72)
  })

  it('closes a match with LOSS result', async () => {
    const caller = createCaller(ctx)
    const match = await caller.match.start({ opponentFaction: 'Eldar', mission: 'Hold' })

    const result = await caller.match.close({
      matchId: match.id,
      yourScore: 40,
      theirScore: 90,
    })
    expect(result.result).toBe('LOSS')
  })

  it('closes a match with DRAW result', async () => {
    const caller = createCaller(ctx)
    const match = await caller.match.start({ opponentFaction: 'Tau', mission: 'Escalation' })

    const result = await caller.match.close({
      matchId: match.id,
      yourScore: 60,
      theirScore: 60,
    })
    expect(result.result).toBe('DRAW')
  })

  it('throws NOT_FOUND for unknown match', async () => {
    const caller = createCaller(ctx)
    await expect(
      caller.match.close({ matchId: 'nonexistent', yourScore: 50, theirScore: 50 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('rejects unauthenticated callers', async () => {
    const caller = createCaller(unauthCtx)
    await expect(
      caller.match.close({ matchId: 'any', yourScore: 50, theirScore: 50 }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})

describe('match.delete', () => {
  it('deletes a non-tournament match', async () => {
    const caller = createCaller(ctx)
    const match = await caller.match.start({ opponentFaction: 'Tyranids', mission: 'Delete Test' })
    await caller.match.delete({ id: match.id })
    const all = await caller.match.list()
    expect(all.find((m) => m.id === match.id)).toBeUndefined()
  })

  it('hides a tournament match instead of deleting', async () => {
    const caller = createCaller(ctx)
    const match = await caller.match.start({
      opponentFaction: 'Necrons',
      mission: 'Tournament Delete',
      isTournament: true,
      tournamentId: 'tourn-hide-test',
    })
    await caller.match.delete({ id: match.id })
    // Hidden from list
    const all = await caller.match.list()
    expect(all.find((m) => m.id === match.id)).toBeUndefined()
    // But still accessible via get
    const found = await caller.match.get({ id: match.id })
    expect(found.id).toBe(match.id)
  })

  it('rejects deleting another user\'s match', async () => {
    const caller = createCaller(ctx)
    const match = await caller.match.start({ opponentFaction: 'Eldar', mission: 'Ownership Test' })
    const caller2 = createCaller(ctx2)
    await expect(caller2.match.delete({ id: match.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})

describe('match.startFromPairing', () => {
  const tournamentId = 'tourn-1'
  const roundId = 'round-1'
  const pairingId = 'pair-1'

  beforeAll(async () => {
    await client.executeMultiple(`
      INSERT INTO tournaments (id, to_user_id, name, event_date, location, format, total_rounds, status, created_at)
      VALUES ('${tournamentId}', 'user-1', 'Test GT', ${Date.now()}, 'Game Store', '2000pts', 5, 'IN_PROGRESS', ${Date.now()});
      INSERT INTO tournament_players (id, tournament_id, user_id, display_name, faction, detachment, registered_at)
      VALUES ('tp-1', '${tournamentId}', 'user-1', 'Alice', 'Space Marines', 'Gladius Task Force', ${Date.now()});
      INSERT INTO tournament_players (id, tournament_id, user_id, display_name, faction, detachment, registered_at)
      VALUES ('tp-2', '${tournamentId}', 'user-2', 'Bob', 'Orks', 'Waaagh! Tribe', ${Date.now()});
      INSERT INTO rounds (id, tournament_id, round_number, status, created_at)
      VALUES ('${roundId}', '${tournamentId}', 1, 'ACTIVE', ${Date.now()});
      INSERT INTO pairings (id, round_id, table_number, player1_id, player2_id, mission, created_at)
      VALUES ('${pairingId}', '${roundId}', 1, 'tp-1', 'tp-2', 'Take and Hold', ${Date.now()});
    `)
  })

  it('creates a match from pairing data for player 1', async () => {
    const caller = createCaller(ctx)
    const match = await caller.match.startFromPairing({ pairingId })
    expect(match.isTournament).toBe(1)
    expect(match.opponentFaction).toBe('Orks')
    expect(match.opponentName).toBe('Bob')
    expect(match.opponentDetachment).toBe('Waaagh! Tribe')
    expect(match.yourFaction).toBe('Space Marines')
    expect(match.yourDetachment).toBe('Gladius Task Force')
    expect(match.mission).toBe('Take and Hold')
    expect(match.tournamentName).toBe('Test GT')
    expect(match.tournamentId).toBe(tournamentId)
    expect(match.location).toBe('Game Store')
  })

  it('creates a match from pairing data for player 2', async () => {
    const caller = createCaller(ctx2)
    const match = await caller.match.startFromPairing({ pairingId })
    expect(match.opponentFaction).toBe('Space Marines')
    expect(match.opponentName).toBe('Alice')
    expect(match.yourFaction).toBe('Orks')
  })

  it('rejects non-participant', async () => {
    const ctx3 = {
      user: { id: 'user-3', email: 'charlie@example.com', name: 'Charlie' },
      req,
      db,
      storage,
    }
    const caller = createCaller(ctx3)
    await expect(caller.match.startFromPairing({ pairingId })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('rejects unknown pairing', async () => {
    const caller = createCaller(ctx)
    await expect(caller.match.startFromPairing({ pairingId: 'no-such' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})

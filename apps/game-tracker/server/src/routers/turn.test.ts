import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createNullR2Storage } from '../lib/storage/r2'
import { createCallerFactory } from '../trpc'
import { appRouter } from './index'

const client = createClient({ url: ':memory:' })
const db = createDbFromClient(client)
const storage = createNullR2Storage()

let matchId: string

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
      closed_at INTEGER
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
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES ('user-1', 'Alice', 'alice@example.com', 0, 0, 0);
    INSERT INTO matches (id, user_id, opponent_faction, mission, is_tournament, created_at)
    VALUES ('match-1', 'user-1', 'Orks', 'Scorched Earth', 0, 0);
  `)
  matchId = 'match-1'
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
const unauthCtx = { user: null, req, db, storage }

describe('turn.add', () => {
  it('adds a turn to a match', async () => {
    const caller = createCaller(ctx)
    const turn = await caller.turn.add({
      matchId,
      turnNumber: 1,
      yourUnitsLost: [],
      theirUnitsLost: [{ contentId: 'u1', name: 'Boyz' }],
      primaryScored: 5,
      secondaryScored: 3,
      cpSpent: 2,
    })
    expect(turn.id).toBeTruthy()
    expect(turn.turnNumber).toBe(1)
    expect(turn.primaryScored).toBe(5)
    expect(turn.secondaryScored).toBe(3)
    expect(turn.cpSpent).toBe(2)
    expect(turn.photoUrl).toBeNull()
  })

  it('stores units lost as JSON', async () => {
    const caller = createCaller(ctx)
    const turn = await caller.turn.add({
      matchId,
      turnNumber: 2,
      yourUnitsLost: [{ contentId: 'sm1', name: 'Intercessors' }],
      theirUnitsLost: [],
      primaryScored: 4,
      secondaryScored: 2,
      cpSpent: 1,
    })
    const parsed = JSON.parse(turn.yourUnitsLost)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].name).toBe('Intercessors')
  })

  it('accepts an optional photo data URL (no R2 configured → photoUrl null)', async () => {
    const caller = createCaller(ctx)
    const turn = await caller.turn.add({
      matchId,
      turnNumber: 3,
      yourUnitsLost: [],
      theirUnitsLost: [],
      primaryScored: 0,
      secondaryScored: 0,
      cpSpent: 0,
      photoDataUrl: 'data:image/jpeg;base64,/9j/abc123',
    })
    // NullR2Storage returns null for photoUrl
    expect(turn.photoUrl).toBeNull()
  })

  it('throws NOT_FOUND for unknown match', async () => {
    const caller = createCaller(ctx)
    await expect(
      caller.turn.add({
        matchId: 'nonexistent',
        turnNumber: 1,
        yourUnitsLost: [],
        theirUnitsLost: [],
        primaryScored: 0,
        secondaryScored: 0,
        cpSpent: 0,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('rejects unauthenticated callers', async () => {
    const caller = createCaller(unauthCtx)
    await expect(
      caller.turn.add({
        matchId,
        turnNumber: 1,
        yourUnitsLost: [],
        theirUnitsLost: [],
        primaryScored: 0,
        secondaryScored: 0,
        cpSpent: 0,
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})

describe('turn.update', () => {
  it('updates notes on an existing turn', async () => {
    const caller = createCaller(ctx)
    const added = await caller.turn.add({
      matchId,
      turnNumber: 4,
      yourUnitsLost: [],
      theirUnitsLost: [],
      primaryScored: 3,
      secondaryScored: 1,
      cpSpent: 0,
    })

    const updated = await caller.turn.update({
      turnId: added.id,
      notes: 'Bad positioning this turn',
    })
    expect(updated.notes).toBe('Bad positioning this turn')
  })

  it('rejects unauthenticated callers', async () => {
    const caller = createCaller(unauthCtx)
    await expect(
      caller.turn.update({ turnId: 'any', notes: 'test' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})

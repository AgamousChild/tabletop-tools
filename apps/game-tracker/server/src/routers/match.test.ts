import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

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
      created_at INTEGER NOT NULL
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
  it('returns a match with its turns', async () => {
    const caller = createCaller(ctx)
    const created = await caller.match.start({ opponentFaction: 'Tau', mission: 'Capture' })

    const fetched = await caller.match.get({ id: created.id })
    expect(fetched.id).toBe(created.id)
    expect(Array.isArray(fetched.turns)).toBe(true)
    expect(fetched.turns).toHaveLength(0)
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

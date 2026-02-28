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

beforeAll(async () => {
  const caller = createCaller(ctx)
  const match = await caller.match.start({
    opponentFaction: 'Orks',
    mission: 'Scorched Earth',
  })
  matchId = match.id
})

describe('secondary.set', () => {
  it('creates a secondary mission for a match', async () => {
    const caller = createCaller(ctx)
    const sec = await caller.secondary.set({
      matchId,
      player: 'YOUR',
      secondaryName: 'Assassination',
    })
    expect(sec.id).toBeTruthy()
    expect(sec.matchId).toBe(matchId)
    expect(sec.player).toBe('YOUR')
    expect(sec.secondaryName).toBe('Assassination')
    expect(sec.vpPerRound).toBe('[]')
  })

  it('throws NOT_FOUND for unknown match', async () => {
    const caller = createCaller(ctx)
    await expect(
      caller.secondary.set({ matchId: 'nonexistent', player: 'YOUR', secondaryName: 'Test' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('throws NOT_FOUND for match owned by another user', async () => {
    const caller = createCaller(ctx2)
    await expect(
      caller.secondary.set({ matchId, player: 'YOUR', secondaryName: 'Test' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('rejects unauthenticated callers', async () => {
    const caller = createCaller(unauthCtx)
    await expect(
      caller.secondary.set({ matchId, player: 'YOUR', secondaryName: 'Test' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})

describe('secondary.score', () => {
  it('scores VP for a specific round', async () => {
    const caller = createCaller(ctx)
    const sec = await caller.secondary.set({
      matchId,
      player: 'YOUR',
      secondaryName: 'Behind Enemy Lines',
    })

    const scored = await caller.secondary.score({
      secondaryId: sec.id,
      roundNumber: 2,
      vp: 4,
    })
    const vpArr = JSON.parse(scored.vpPerRound)
    expect(vpArr).toEqual([0, 4, 0, 0, 0])
  })

  it('accumulates VP across rounds', async () => {
    const caller = createCaller(ctx)
    const sec = await caller.secondary.set({
      matchId,
      player: 'YOUR',
      secondaryName: 'Engage on All Fronts',
    })

    await caller.secondary.score({ secondaryId: sec.id, roundNumber: 1, vp: 2 })
    await caller.secondary.score({ secondaryId: sec.id, roundNumber: 3, vp: 4 })
    const scored = await caller.secondary.score({ secondaryId: sec.id, roundNumber: 5, vp: 3 })
    const vpArr = JSON.parse(scored.vpPerRound)
    expect(vpArr).toEqual([2, 0, 4, 0, 3])
  })

  it('throws NOT_FOUND for unknown secondary', async () => {
    const caller = createCaller(ctx)
    await expect(
      caller.secondary.score({ secondaryId: 'nonexistent', roundNumber: 1, vp: 1 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('rejects unauthenticated callers', async () => {
    const caller = createCaller(unauthCtx)
    await expect(
      caller.secondary.score({ secondaryId: 'any', roundNumber: 1, vp: 1 }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})

describe('secondary.list', () => {
  it('returns all secondaries for a match', async () => {
    const caller = createCaller(ctx)
    const list = await caller.secondary.list({ matchId })
    expect(Array.isArray(list)).toBe(true)
    expect(list.length).toBeGreaterThanOrEqual(3)
    expect(list.every((s) => s.matchId === matchId)).toBe(true)
  })

  it('throws NOT_FOUND for unknown match', async () => {
    const caller = createCaller(ctx)
    await expect(caller.secondary.list({ matchId: 'nonexistent' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('rejects unauthenticated callers', async () => {
    const caller = createCaller(unauthCtx)
    await expect(caller.secondary.list({ matchId })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
  })
})

describe('secondary.remove', () => {
  it('deletes a secondary mission', async () => {
    const caller = createCaller(ctx)
    const sec = await caller.secondary.set({
      matchId,
      player: 'THEIRS',
      secondaryName: 'Deploy Teleport Homers',
    })

    await caller.secondary.remove({ secondaryId: sec.id })
    const list = await caller.secondary.list({ matchId })
    expect(list.find((s) => s.id === sec.id)).toBeUndefined()
  })

  it('throws NOT_FOUND for unknown secondary', async () => {
    const caller = createCaller(ctx)
    await expect(caller.secondary.remove({ secondaryId: 'nonexistent' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('rejects unauthenticated callers', async () => {
    const caller = createCaller(unauthCtx)
    await expect(caller.secondary.remove({ secondaryId: 'any' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
  })
})

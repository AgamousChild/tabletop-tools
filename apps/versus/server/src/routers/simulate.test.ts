import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createCallerFactory } from '@tabletop-tools/server-core'
import { appRouter } from './index'

const client = createClient({ url: ':memory:' })
const db = createDbFromClient(client)

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
    CREATE TABLE IF NOT EXISTS simulations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES "user"(id),
      attacker_content_id TEXT NOT NULL,
      attacker_name TEXT NOT NULL,
      defender_content_id TEXT NOT NULL,
      defender_name TEXT NOT NULL,
      result TEXT NOT NULL,
      config_hash TEXT,
      weapon_config TEXT,
      created_at INTEGER NOT NULL
    );
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES ('user-1', 'Alice', 'alice@example.com', 0, 0, 0);
  `)
})

afterAll(() => client.close())

const createCaller = createCallerFactory(appRouter)
const req = new Request('http://localhost')
const ctx = {
  user: { id: 'user-1', email: 'alice@example.com', name: 'Alice' },
  req,
  db,
}
const unauthCtx = { user: null, req, db }

const sampleResult = {
  expectedWounds: 2.5,
  expectedModelsRemoved: 1.2,
  survivors: 3.8,
  worstCase: { wounds: 0, modelsRemoved: 0 },
  bestCase: { wounds: 8, modelsRemoved: 4 },
}

describe('simulate.save', () => {
  it('saves a simulation result and returns an id', async () => {
    const caller = createCaller(ctx)
    const saved = await caller.simulate.save({
      attackerId: 'a1',
      attackerName: 'Test Attacker',
      defenderId: 'd1',
      defenderName: 'Test Defender',
      result: sampleResult,
    })
    expect(saved.id).toBeTruthy()
  })

  it('rejects unauthenticated callers', async () => {
    const caller = createCaller(unauthCtx)
    await expect(
      caller.simulate.save({
        attackerId: 'a1',
        attackerName: 'A',
        defenderId: 'd1',
        defenderName: 'D',
        result: sampleResult,
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})

describe('simulate.history', () => {
  it('returns saved simulations for the current user', async () => {
    const caller = createCaller(ctx)
    const history = await caller.simulate.history()
    expect(Array.isArray(history)).toBe(true)
    expect(history.length).toBeGreaterThan(0)
  })

  it('rejects unauthenticated callers', async () => {
    const caller = createCaller(unauthCtx)
    await expect(caller.simulate.history()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import { createCallerFactory } from '../trpc'
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
    CREATE TABLE IF NOT EXISTS dice_sets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES "user"(id),
      name TEXT NOT NULL,
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

const aliceCtx = { user: { id: 'user-1', email: 'alice@example.com', name: 'Alice' }, req, db }
const bobCtx = { user: { id: 'user-2', email: 'bob@example.com', name: 'Bob' }, req, db }

describe('diceSet.create', () => {
  it('creates a dice set for the authenticated user', async () => {
    const caller = createCaller(aliceCtx)
    const result = await caller.diceSet.create({ name: 'Red Dragons' })
    expect(result.name).toBe('Red Dragons')
    expect(result.userId).toBe('user-1')
    expect(result.id).toBeTruthy()
  })

  it('rejects unauthenticated callers', async () => {
    const caller = createCaller({ user: null, req, db })
    await expect(caller.diceSet.create({ name: 'Test' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
  })
})

describe('diceSet.list', () => {
  it('returns only the authenticated user\'s dice sets', async () => {
    const aliceCaller = createCaller(aliceCtx)
    const bobCaller = createCaller(bobCtx)

    await aliceCaller.diceSet.create({ name: 'Blue Crystals' })
    await bobCaller.diceSet.create({ name: 'Bob\'s Dice' })

    const aliceSets = await aliceCaller.diceSet.list()
    expect(aliceSets.some((s) => s.name === 'Red Dragons')).toBe(true)
    expect(aliceSets.some((s) => s.name === 'Blue Crystals')).toBe(true)
    expect(aliceSets.every((s) => s.userId === 'user-1')).toBe(true)
  })

  it('returns empty array when user has no dice sets', async () => {
    // user-3 has no dice sets
    const newUserCtx = {
      user: { id: 'user-3', email: 'carol@example.com', name: 'Carol' },
      req,
      db,
    }
    // Insert user-3 first
    await client.execute(
      `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
       VALUES ('user-3', 'Carol', 'carol@example.com', 0, 0, 0)`,
    )
    const caller = createCaller(newUserCtx)
    const result = await caller.diceSet.list()
    expect(result).toEqual([])
  })

  it('returns dice sets ordered by creation time descending', async () => {
    const caller = createCaller(aliceCtx)
    const sets = await caller.diceSet.list()
    // Blue Crystals was created after Red Dragons, so it should come first
    expect(sets[0]?.name).toBe('Blue Crystals')
    expect(sets[1]?.name).toBe('Red Dragons')
  })
})

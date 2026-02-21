import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import { createCallerFactory } from './trpc'
import { appRouter } from './routers'

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
    VALUES ('user-1', 'Test User', 'test@example.com', 0, 0, 0);
  `)
})

afterAll(() => client.close())

const createCaller = createCallerFactory(appRouter)

const anonCtx = {
  user: null,
  req: new Request('http://localhost'),
  db,
} as const

const authCtx = {
  user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
  req: new Request('http://localhost'),
  db,
} as const

describe('health', () => {
  it('returns ok without authentication', async () => {
    const caller = createCaller(anonCtx)
    const result = await caller.health()
    expect(result).toEqual({ status: 'ok' })
  })
})

describe('protected procedures', () => {
  it('rejects unauthenticated callers with UNAUTHORIZED', async () => {
    const caller = createCaller(anonCtx)
    await expect(caller.diceSet.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('allows authenticated callers', async () => {
    const caller = createCaller(authCtx)
    const result = await caller.diceSet.list()
    expect(Array.isArray(result)).toBe(true)
  })
})

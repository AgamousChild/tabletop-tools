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
    CREATE TABLE IF NOT EXISTS unit_ratings (
      id TEXT PRIMARY KEY,
      unit_content_id TEXT NOT NULL,
      rating TEXT NOT NULL,
      win_contrib REAL NOT NULL,
      pts_eff REAL NOT NULL,
      meta_window TEXT NOT NULL,
      computed_at INTEGER NOT NULL
    );
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES ('user-1', 'Alice', 'alice@example.com', 0, 0, 0);
    -- seed a rating for unit-A
    INSERT INTO unit_ratings (id, unit_content_id, rating, win_contrib, pts_eff, meta_window, computed_at)
    VALUES ('r1', 'unit-A', 'A', 0.65, 0.65, '2025-Q2', 1000);
    -- seed a rating for unit-B (same window)
    INSERT INTO unit_ratings (id, unit_content_id, rating, win_contrib, pts_eff, meta_window, computed_at)
    VALUES ('r2', 'unit-B', 'B', 0.50, 0.50, '2025-Q2', 1000);
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

describe('rating.get', () => {
  it('returns the rating for a known unit', async () => {
    const caller = createCaller(ctx)
    const result = await caller.rating.get({ unitId: 'unit-A' })
    expect(result).not.toBeNull()
    expect(result!.rating).toBe('A')
    expect(result!.winContrib).toBeCloseTo(0.65)
  })

  it('returns null for a unit with no rating', async () => {
    const caller = createCaller(ctx)
    const result = await caller.rating.get({ unitId: 'unknown-unit' })
    expect(result).toBeNull()
  })

  it('rejects unauthenticated callers', async () => {
    const caller = createCaller(unauthCtx)
    await expect(caller.rating.get({ unitId: 'unit-A' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
  })
})

describe('rating.alternatives', () => {
  it('returns all ratings ordered by win_contrib descending', async () => {
    const caller = createCaller(ctx)
    const result = await caller.rating.alternatives({})
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
    // unit-A has higher winContrib (0.65) than unit-B (0.50)
    if (result.length >= 2) {
      expect(result[0]!.winContrib).toBeGreaterThanOrEqual(result[1]!.winContrib)
    }
  })

  it('filters by metaWindow', async () => {
    const caller = createCaller(ctx)
    const result = await caller.rating.alternatives({ metaWindow: '2025-Q2' })
    expect(result.length).toBeGreaterThan(0)
    expect(result.every((r) => r.metaWindow === '2025-Q2')).toBe(true)
  })

  it('returns empty for non-matching metaWindow', async () => {
    const caller = createCaller(ctx)
    const result = await caller.rating.alternatives({ metaWindow: '2099-Q1' })
    expect(result).toEqual([])
  })

  it('rejects unauthenticated callers', async () => {
    const caller = createCaller(unauthCtx)
    await expect(
      caller.rating.alternatives({}),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})

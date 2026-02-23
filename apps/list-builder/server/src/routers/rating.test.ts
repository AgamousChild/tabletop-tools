import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import type { GameContentAdapter, UnitProfile } from '@tabletop-tools/game-content'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { createCallerFactory } from '../trpc'
import { appRouter } from './index'

const client = createClient({ url: ':memory:' })
const db = createDbFromClient(client)

const makeUnit = (id: string, points = 100): UnitProfile => ({
  id,
  faction: 'Space Marines',
  name: `Unit ${id}`,
  move: 6,
  toughness: 4,
  save: 3,
  wounds: 3,
  leadership: 6,
  oc: 1,
  weapons: [],
  abilities: [],
  points,
})

const mockAdapter: GameContentAdapter = {
  getUnit: vi.fn(),
  searchUnits: vi.fn(),
  listFactions: vi.fn(),
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
  gameContent: mockAdapter,
}
const unauthCtx = { user: null, req, db, gameContent: mockAdapter }

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
  it('returns units with ratings when queried by points range', async () => {
    // The impl calls getUnit for each rated unit to check points cost
    vi.mocked(mockAdapter.getUnit)
      .mockResolvedValueOnce(makeUnit('unit-A', 100))
      .mockResolvedValueOnce(makeUnit('unit-B', 100))
    const caller = createCaller(ctx)
    const result = await caller.rating.alternatives({ ptsMin: 80, ptsMax: 120 })
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
  })

  it('returns results sorted by win_contrib descending', async () => {
    vi.mocked(mockAdapter.getUnit)
      .mockResolvedValueOnce(makeUnit('unit-A', 100))
      .mockResolvedValueOnce(makeUnit('unit-B', 100))
    const caller = createCaller(ctx)
    const result = await caller.rating.alternatives({ ptsMin: 80, ptsMax: 120 })
    // unit-A has higher winContrib (0.65) than unit-B (0.50)
    if (result.length >= 2) {
      expect(result[0]!.winContrib).toBeGreaterThanOrEqual(result[1]!.winContrib)
    }
  })

  it('rejects unauthenticated callers', async () => {
    const caller = createCaller(unauthCtx)
    await expect(
      caller.rating.alternatives({ ptsMin: 50, ptsMax: 150 }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})

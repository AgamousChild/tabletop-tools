import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import type { GameContentAdapter, UnitProfile } from '@tabletop-tools/game-content'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { createCallerFactory } from '../trpc'
import { appRouter } from './index'

const client = createClient({ url: ':memory:' })
const db = createDbFromClient(client)

const makeUnit = (id: string, name = 'Test Unit', faction = 'Space Marines'): UnitProfile => ({
  id,
  faction,
  name,
  move: 6,
  toughness: 4,
  save: 3,
  wounds: 3,
  leadership: 6,
  oc: 1,
  weapons: [],
  abilities: [],
  points: 100,
})

const mockAdapter: GameContentAdapter = {
  load: vi.fn().mockResolvedValue(undefined),
  getUnit: vi.fn(),
  searchUnits: vi.fn(),
  listFactions: vi.fn(),
}

beforeAll(async () => {
  await client.execute(`
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
    )
  `)
  await client.execute(
    `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
     VALUES ('user-1', 'Alice', 'alice@example.com', 0, 0, 0)`,
  )
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

describe('unit.listFactions', () => {
  it('returns factions from the adapter', async () => {
    vi.mocked(mockAdapter.listFactions).mockResolvedValueOnce(['Space Marines', 'Orks'])
    const caller = createCaller(ctx)
    const result = await caller.unit.listFactions()
    expect(result).toEqual(['Space Marines', 'Orks'])
  })

  it('rejects unauthenticated callers', async () => {
    const caller = createCaller(unauthCtx)
    await expect(caller.unit.listFactions()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})

describe('unit.search', () => {
  it('returns units matching the query', async () => {
    const units = [makeUnit('u1', 'Tactical Squad')]
    vi.mocked(mockAdapter.searchUnits).mockResolvedValueOnce(units)
    const caller = createCaller(ctx)
    const result = await caller.unit.search({ query: 'Tactical' })
    expect(result).toHaveLength(1)
    expect(result[0]?.name).toBe('Tactical Squad')
  })

  it('can filter by faction', async () => {
    vi.mocked(mockAdapter.searchUnits).mockResolvedValueOnce([])
    const caller = createCaller(ctx)
    await caller.unit.search({ faction: 'Orks' })
    expect(mockAdapter.searchUnits).toHaveBeenCalledWith({ faction: 'Orks', name: undefined })
  })

  it('rejects unauthenticated callers', async () => {
    const caller = createCaller(unauthCtx)
    await expect(caller.unit.search({})).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})

describe('unit.get', () => {
  it('returns the unit when found', async () => {
    vi.mocked(mockAdapter.getUnit).mockResolvedValueOnce(makeUnit('u1', 'Intercessor Squad'))
    const caller = createCaller(ctx)
    const result = await caller.unit.get({ id: 'u1' })
    expect(result.name).toBe('Intercessor Squad')
  })

  it('throws NOT_FOUND when unit does not exist', async () => {
    vi.mocked(mockAdapter.getUnit).mockResolvedValueOnce(null)
    const caller = createCaller(unauthCtx)
    // Note: unauthCtx → UNAUTHORIZED fires before NOT_FOUND; test with auth ctx
    vi.mocked(mockAdapter.getUnit).mockResolvedValueOnce(null)
    const caller2 = createCaller(ctx)
    await expect(caller2.unit.get({ id: 'nonexistent' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('rejects unauthenticated callers', async () => {
    const caller = createCaller(unauthCtx)
    await expect(caller.unit.get({ id: 'u1' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})

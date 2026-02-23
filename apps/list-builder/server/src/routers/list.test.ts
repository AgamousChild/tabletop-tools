import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import type { GameContentAdapter, UnitProfile } from '@tabletop-tools/game-content'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { createCallerFactory } from '../trpc'
import { appRouter } from './index'

const client = createClient({ url: ':memory:' })
const db = createDbFromClient(client)

const makeUnit = (id: string, name = 'Test Unit', points = 100): UnitProfile => ({
  id,
  faction: 'Space Marines',
  name,
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
  load: vi.fn().mockResolvedValue(undefined),
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
    CREATE TABLE IF NOT EXISTS lists (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES "user"(id),
      faction TEXT NOT NULL,
      name TEXT NOT NULL,
      total_pts INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS list_units (
      id TEXT PRIMARY KEY,
      list_id TEXT NOT NULL REFERENCES lists(id),
      unit_content_id TEXT NOT NULL,
      unit_name TEXT NOT NULL,
      unit_points INTEGER NOT NULL,
      count INTEGER NOT NULL DEFAULT 1
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
  gameContent: mockAdapter,
}
const ctx2 = {
  user: { id: 'user-2', email: 'bob@example.com', name: 'Bob' },
  req,
  db,
  gameContent: mockAdapter,
}
const unauthCtx = { user: null, req, db, gameContent: mockAdapter }

describe('list.create', () => {
  it('creates a list and returns it', async () => {
    const caller = createCaller(ctx)
    const list = await caller.list.create({ faction: 'Space Marines', name: 'My Crusade' })
    expect(list.id).toBeTruthy()
    expect(list.faction).toBe('Space Marines')
    expect(list.name).toBe('My Crusade')
    expect(list.totalPts).toBe(0)
  })

  it('rejects unauthenticated callers', async () => {
    const caller = createCaller(unauthCtx)
    await expect(
      caller.list.create({ faction: 'Space Marines', name: 'Test' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})

describe('list.list', () => {
  it('returns lists owned by the current user', async () => {
    const caller = createCaller(ctx)
    const lists = await caller.list.list()
    expect(Array.isArray(lists)).toBe(true)
    expect(lists.every((l) => l.userId === 'user-1')).toBe(true)
  })

  it('rejects unauthenticated callers', async () => {
    const caller = createCaller(unauthCtx)
    await expect(caller.list.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})

describe('list.get', () => {
  it('returns a list with its units', async () => {
    // Create a list first
    const caller = createCaller(ctx)
    const created = await caller.list.create({ faction: 'Orks', name: 'Waagh!' })

    const fetched = await caller.list.get({ id: created.id })
    expect(fetched.id).toBe(created.id)
    expect(fetched.faction).toBe('Orks')
    expect(Array.isArray(fetched.units)).toBe(true)
    expect(fetched.units).toHaveLength(0)
  })

  it('throws NOT_FOUND for unknown id', async () => {
    const caller = createCaller(ctx)
    await expect(caller.list.get({ id: 'nonexistent' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('throws NOT_FOUND for a list owned by another user', async () => {
    const caller1 = createCaller(ctx)
    const list = await caller1.list.create({ faction: 'Orks', name: "Alice's list" })

    const caller2 = createCaller(ctx2)
    await expect(caller2.list.get({ id: list.id })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('rejects unauthenticated callers', async () => {
    const caller = createCaller(unauthCtx)
    await expect(caller.list.get({ id: 'any' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})

describe('list.addUnit', () => {
  it('adds a unit and updates total points', async () => {
    const caller = createCaller(ctx)
    const list = await caller.list.create({ faction: 'Space Marines', name: 'Hammer' })

    vi.mocked(mockAdapter.getUnit).mockResolvedValueOnce(makeUnit('intercessors', 'Intercessors', 90))
    await caller.list.addUnit({ listId: list.id, unitId: 'intercessors' })

    const fetched = await caller.list.get({ id: list.id })
    expect(fetched.units).toHaveLength(1)
    expect(fetched.units[0]?.unitName).toBe('Intercessors')
    expect(fetched.units[0]?.unitPoints).toBe(90)
    expect(fetched.totalPts).toBe(90)
  })

  it('respects count parameter', async () => {
    const caller = createCaller(ctx)
    const list = await caller.list.create({ faction: 'Space Marines', name: 'Multi' })

    vi.mocked(mockAdapter.getUnit).mockResolvedValueOnce(makeUnit('bolter-scouts', 'Scouts', 60))
    await caller.list.addUnit({ listId: list.id, unitId: 'bolter-scouts', count: 2 })

    const fetched = await caller.list.get({ id: list.id })
    expect(fetched.units[0]?.count).toBe(2)
    // total_pts = 60 * 2 = 120
    expect(fetched.totalPts).toBe(120)
  })

  it('throws NOT_FOUND for unknown unit', async () => {
    const caller = createCaller(ctx)
    const list = await caller.list.create({ faction: 'Space Marines', name: 'Empty' })

    vi.mocked(mockAdapter.getUnit).mockResolvedValueOnce(null)
    await expect(
      caller.list.addUnit({ listId: list.id, unitId: 'ghost-unit' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('throws NOT_FOUND for unknown list', async () => {
    vi.mocked(mockAdapter.getUnit).mockResolvedValueOnce(makeUnit('u1'))
    const caller = createCaller(ctx)
    await expect(
      caller.list.addUnit({ listId: 'nonexistent', unitId: 'u1' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('rejects unauthenticated callers', async () => {
    const caller = createCaller(unauthCtx)
    await expect(
      caller.list.addUnit({ listId: 'any', unitId: 'u1' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})

describe('list.removeUnit', () => {
  it('removes a unit and updates total points', async () => {
    const caller = createCaller(ctx)
    const list = await caller.list.create({ faction: 'Space Marines', name: 'Remove Test' })

    vi.mocked(mockAdapter.getUnit).mockResolvedValueOnce(makeUnit('u1', 'Unit One', 80))
    await caller.list.addUnit({ listId: list.id, unitId: 'u1' })

    const before = await caller.list.get({ id: list.id })
    const unitRowId = before.units[0]!.id

    await caller.list.removeUnit({ listId: list.id, listUnitId: unitRowId })

    const after = await caller.list.get({ id: list.id })
    expect(after.units).toHaveLength(0)
    expect(after.totalPts).toBe(0)
  })

  it('rejects unauthenticated callers', async () => {
    const caller = createCaller(unauthCtx)
    await expect(
      caller.list.removeUnit({ listId: 'any', listUnitId: 'any' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})

describe('list.delete', () => {
  it('deletes a list', async () => {
    const caller = createCaller(ctx)
    const list = await caller.list.create({ faction: 'Necrons', name: 'To Delete' })
    await caller.list.delete({ id: list.id })
    await expect(caller.list.get({ id: list.id })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('rejects unauthenticated callers', async () => {
    const caller = createCaller(unauthCtx)
    await expect(caller.list.delete({ id: 'any' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
  })
})

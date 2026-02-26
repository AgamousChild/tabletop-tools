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
    CREATE TABLE IF NOT EXISTS lists (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      faction TEXT NOT NULL,
      name TEXT NOT NULL,
      total_pts INTEGER NOT NULL DEFAULT 0,
      detachment TEXT,
      description TEXT,
      battle_size INTEGER,
      synced_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS list_units (
      id TEXT PRIMARY KEY,
      list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
      unit_content_id TEXT NOT NULL,
      unit_name TEXT NOT NULL,
      unit_points INTEGER NOT NULL,
      count INTEGER NOT NULL DEFAULT 1,
      model_count INTEGER,
      is_warlord INTEGER NOT NULL DEFAULT 0,
      enhancement_id TEXT,
      enhancement_name TEXT,
      enhancement_cost INTEGER
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
}
const ctx2 = {
  user: { id: 'user-2', email: 'bob@example.com', name: 'Bob' },
  req,
  db,
}
const unauthCtx = { user: null, req, db }

describe('list.sync', () => {
  it('creates a new list with units', async () => {
    const caller = createCaller(ctx)
    await caller.list.sync({
      id: 'list-1',
      faction: 'Space Marines',
      name: 'My Marines',
      totalPts: 270,
      units: [
        { id: 'lu-1', unitContentId: 'uc-1', unitName: 'Intercessors', unitPoints: 90, modelCount: 5, count: 1 },
        { id: 'lu-2', unitContentId: 'uc-2', unitName: 'Hellblasters', unitPoints: 180, count: 1 },
      ],
    })

    const all = await caller.list.getAll()
    expect(all).toHaveLength(1)
    expect(all[0]!.name).toBe('My Marines')
    expect(all[0]!.units).toHaveLength(2)
    expect(all[0]!.units[0]!.modelCount).toBe(5)
    expect(all[0]!.units[1]!.modelCount).toBeNull()
  })

  it('upserts an existing list (replaces units)', async () => {
    const caller = createCaller(ctx)
    await caller.list.sync({
      id: 'list-1',
      faction: 'Space Marines',
      name: 'Updated Marines',
      description: 'Tournament list',
      totalPts: 180,
      units: [
        { id: 'lu-3', unitContentId: 'uc-2', unitName: 'Hellblasters', unitPoints: 180, count: 1 },
      ],
    })

    const all = await caller.list.getAll()
    expect(all).toHaveLength(1)
    expect(all[0]!.name).toBe('Updated Marines')
    expect(all[0]!.description).toBe('Tournament list')
    expect(all[0]!.units).toHaveLength(1)
  })

  it('rejects unauthenticated callers', async () => {
    const caller = createCaller(unauthCtx)
    await expect(
      caller.list.sync({
        id: 'list-x',
        faction: 'Orks',
        name: 'Waaagh',
        totalPts: 0,
        units: [],
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('stores optional fields: detachment, battleSize', async () => {
    const caller = createCaller(ctx)
    await caller.list.sync({
      id: 'list-2',
      faction: 'Aeldari',
      name: 'Craftworld',
      detachment: 'Battle Host',
      battleSize: 2000,
      totalPts: 500,
      units: [],
    })

    const all = await caller.list.getAll()
    const list = all.find((l) => l.id === 'list-2')
    expect(list).toBeDefined()
    expect(list!.detachment).toBe('Battle Host')
    expect(list!.battleSize).toBe(2000)
  })
})

describe('list.syncAll', () => {
  it('syncs multiple lists at once', async () => {
    const caller = createCaller(ctx2)
    await caller.list.syncAll({
      lists: [
        {
          id: 'bob-list-1',
          faction: 'Necrons',
          name: 'Silver Tide',
          totalPts: 1000,
          units: [
            { id: 'blu-1', unitContentId: 'uc-n1', unitName: 'Warriors', unitPoints: 100, modelCount: 10, count: 1 },
          ],
        },
        {
          id: 'bob-list-2',
          faction: 'Necrons',
          name: 'Canoptek Swarm',
          totalPts: 500,
          units: [],
        },
      ],
    })

    const all = await caller.list.getAll()
    expect(all).toHaveLength(2)
  })
})

describe('list.getAll', () => {
  it('only returns lists for the authenticated user', async () => {
    const caller1 = createCaller(ctx)
    const caller2 = createCaller(ctx2)
    const lists1 = await caller1.list.getAll()
    const lists2 = await caller2.list.getAll()

    // user-1 has list-1 and list-2 from prior tests
    expect(lists1.every((l) => l.userId === 'user-1')).toBe(true)
    expect(lists2.every((l) => l.userId === 'user-2')).toBe(true)
  })

  it('rejects unauthenticated callers', async () => {
    const caller = createCaller(unauthCtx)
    await expect(caller.list.getAll()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})

describe('list.delete', () => {
  it('deletes a list owned by the user', async () => {
    const caller = createCaller(ctx2)
    const before = await caller.list.getAll()
    const countBefore = before.length

    await caller.list.delete({ id: 'bob-list-2' })

    const after = await caller.list.getAll()
    expect(after).toHaveLength(countBefore - 1)
    expect(after.find((l) => l.id === 'bob-list-2')).toBeUndefined()
  })

  it('does not delete lists belonging to other users', async () => {
    const caller = createCaller(ctx2)
    // Try to delete user-1's list
    await caller.list.delete({ id: 'list-1' })

    // list-1 should still exist for user-1
    const caller1 = createCaller(ctx)
    const lists = await caller1.list.getAll()
    expect(lists.find((l) => l.id === 'list-1')).toBeDefined()
  })

  it('rejects unauthenticated callers', async () => {
    const caller = createCaller(unauthCtx)
    await expect(caller.list.delete({ id: 'list-1' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
  })
})

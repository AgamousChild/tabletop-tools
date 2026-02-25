import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import type { GameContentAdapter } from '@tabletop-tools/game-content'
import {
  setupAuthTables,
  createRequestHelper,
  authCookie,
  TEST_SECRET,
} from '@tabletop-tools/auth/src/test-helpers'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createServer } from './server'

const client = createClient({ url: ':memory:' })
const db = createDbFromClient(client)

const nullGameContent: GameContentAdapter = {
  load: async () => {},
  getUnit: async () => null,
  searchUnits: async () => [],
  listFactions: async () => [],
}

beforeAll(async () => {
  await setupAuthTables(client)
  await client.executeMultiple(`
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
  `)
})

afterAll(() => client.close())

const makeRequest = createRequestHelper(() => createServer(db, nullGameContent, TEST_SECRET))

describe('HTTP integration — list.create via session cookie', () => {
  it('creates a list when authenticated', async () => {
    const res = await makeRequest('/trpc/list.create', {
      method: 'POST',
      cookie: await authCookie(),
      body: { faction: 'Space Marines', name: 'My List' },
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.result?.data?.name).toBe('My List')
    expect(json.result.data.faction).toBe('Space Marines')
    expect(json.result.data.userId).toBe('user-1')
  })

  it('returns UNAUTHORIZED without a cookie', async () => {
    const res = await makeRequest('/trpc/list.create', {
      method: 'POST',
      body: { faction: 'Space Marines', name: 'My List' },
    })

    const json = (await res.json()) as any
    expect(json.error?.data?.code).toBe('UNAUTHORIZED')
  })
})

describe('HTTP integration — list.list via session cookie', () => {
  it('lists user lists when authenticated', async () => {
    const res = await makeRequest('/trpc/list.list', {
      cookie: await authCookie(),
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(Array.isArray(json.result?.data)).toBe(true)
    expect(json.result.data.length).toBeGreaterThan(0)
  })

  it('returns UNAUTHORIZED without a cookie', async () => {
    const res = await makeRequest('/trpc/list.list')
    const json = (await res.json()) as any
    expect(json.error?.data?.code).toBe('UNAUTHORIZED')
  })
})

describe('HTTP integration — list.delete via session cookie', () => {
  it('deletes a list when authenticated', async () => {
    const createRes = await makeRequest('/trpc/list.create', {
      method: 'POST',
      cookie: await authCookie(),
      body: { faction: 'Orks', name: 'Deletable List' },
    })
    const createJson = (await createRes.json()) as any
    const listId = createJson.result.data.id

    const res = await makeRequest('/trpc/list.delete', {
      method: 'POST',
      cookie: await authCookie(),
      body: { id: listId },
    })

    expect(res.status).toBe(200)
  })

  it('returns UNAUTHORIZED without a cookie', async () => {
    const res = await makeRequest('/trpc/list.delete', {
      method: 'POST',
      body: { id: 'some-id' },
    })
    const json = (await res.json()) as any
    expect(json.error?.data?.code).toBe('UNAUTHORIZED')
  })
})

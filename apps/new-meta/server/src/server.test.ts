import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import {
  setupAuthTables,
  createRequestHelper,
  authCookie,
  TEST_USER,
  TEST_SECRET,
} from '@tabletop-tools/auth/src/test-helpers'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createServer } from './server'

const client = createClient({ url: ':memory:' })
const db = createDbFromClient(client)

beforeAll(async () => {
  await setupAuthTables(client)
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS imported_tournament_results (
      id TEXT PRIMARY KEY,
      imported_by TEXT NOT NULL REFERENCES "user"(id),
      event_name TEXT NOT NULL,
      event_date INTEGER NOT NULL,
      format TEXT NOT NULL,
      meta_window TEXT NOT NULL,
      raw_data TEXT NOT NULL,
      parsed_data TEXT NOT NULL,
      imported_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS player_glicko (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES "user"(id),
      player_name TEXT NOT NULL,
      rating REAL NOT NULL DEFAULT 1500,
      rating_deviation REAL NOT NULL DEFAULT 350,
      volatility REAL NOT NULL DEFAULT 0.06,
      games_played INTEGER NOT NULL DEFAULT 0,
      last_rating_period TEXT,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS glicko_history (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL REFERENCES player_glicko(id),
      rating_period TEXT NOT NULL,
      rating_before REAL NOT NULL,
      rd_before REAL NOT NULL,
      rating_after REAL NOT NULL,
      rd_after REAL NOT NULL,
      volatility_after REAL NOT NULL,
      delta REAL NOT NULL,
      games_in_period INTEGER NOT NULL,
      recorded_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tournament_players (
      id TEXT PRIMARY KEY,
      tournament_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      faction TEXT NOT NULL,
      detachment TEXT,
      list_text TEXT,
      list_locked INTEGER NOT NULL DEFAULT 0,
      checked_in INTEGER NOT NULL DEFAULT 0,
      dropped INTEGER NOT NULL DEFAULT 0,
      registered_at INTEGER NOT NULL
    );
  `)
})

afterAll(() => client.close())

const makeRequest = createRequestHelper(() => createServer(db, [TEST_USER.email], TEST_SECRET))

describe('HTTP integration — admin.linkPlayer via session cookie', () => {
  it('links a player when authenticated', async () => {
    await client.execute({
      sql: `INSERT INTO player_glicko (id, player_name, updated_at) VALUES (?, ?, ?)`,
      args: ['glicko-1', 'TestPlayer', Date.now()],
    })

    const res = await makeRequest('/trpc/admin.linkPlayer', {
      method: 'POST',
      cookie: await authCookie(),
      body: { glickoId: 'glicko-1', userId: 'user-1' },
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.result?.data?.userId).toBe('user-1')
    expect(json.result.data.playerName).toBe('TestPlayer')
  })

  it('returns UNAUTHORIZED without a cookie', async () => {
    const res = await makeRequest('/trpc/admin.linkPlayer', {
      method: 'POST',
      body: { glickoId: 'glicko-1', userId: 'user-1' },
    })

    const json = (await res.json()) as any
    expect(json.error?.data?.code).toBe('UNAUTHORIZED')
  })
})

describe('HTTP integration — admin.recomputeGlicko via session cookie', () => {
  it('recomputes glicko when authenticated', async () => {
    const res = await makeRequest('/trpc/admin.recomputeGlicko', {
      method: 'POST',
      cookie: await authCookie(),
      body: {},
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.result?.data?.playersUpdated).toBeDefined()
  })

  it('returns UNAUTHORIZED without a cookie', async () => {
    const res = await makeRequest('/trpc/admin.recomputeGlicko', {
      method: 'POST',
      body: {},
    })

    const json = (await res.json()) as any
    expect(json.error?.data?.code).toBe('UNAUTHORIZED')
  })
})

describe('HTTP integration — public endpoints work without auth', () => {
  it('meta.windows works without a cookie', async () => {
    const res = await makeRequest('/trpc/meta.windows')

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(Array.isArray(json.result?.data)).toBe(true)
  })

  it('health endpoint works without a cookie', async () => {
    const res = await makeRequest('/trpc/health')

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.result?.data?.status).toBe('ok')
  })
})

import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
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

beforeAll(async () => {
  await setupAuthTables(client)
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS unit_ratings (
      id TEXT PRIMARY KEY,
      unit_content_id TEXT NOT NULL,
      rating TEXT NOT NULL,
      win_contrib REAL NOT NULL,
      pts_eff REAL NOT NULL,
      meta_window TEXT NOT NULL,
      computed_at INTEGER NOT NULL
    );
    INSERT INTO unit_ratings (id, unit_content_id, rating, win_contrib, pts_eff, meta_window, computed_at)
    VALUES ('r1', 'unit-A', 'A', 0.65, 0.65, '2025-Q2', 1000);
  `)
})

afterAll(() => client.close())

const makeRequest = createRequestHelper(() => createServer(db, TEST_SECRET))

describe('HTTP integration — rating.get via session cookie', () => {
  it('returns a rating when authenticated', async () => {
    const res = await makeRequest('/trpc/rating.get?input=%7B%22unitId%22%3A%22unit-A%22%7D', {
      cookie: await authCookie(),
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.result?.data?.rating).toBe('A')
  })

  it('returns UNAUTHORIZED without a cookie', async () => {
    const res = await makeRequest('/trpc/rating.get?input=%7B%22unitId%22%3A%22unit-A%22%7D')
    const json = (await res.json()) as any
    expect(json.error?.data?.code).toBe('UNAUTHORIZED')
  })
})

describe('HTTP integration — rating.alternatives via session cookie', () => {
  it('returns alternatives when authenticated', async () => {
    const res = await makeRequest('/trpc/rating.alternatives?input=%7B%7D', {
      cookie: await authCookie(),
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(Array.isArray(json.result?.data)).toBe(true)
  })

  it('returns UNAUTHORIZED without a cookie', async () => {
    const res = await makeRequest('/trpc/rating.alternatives?input=%7B%7D')
    const json = (await res.json()) as any
    expect(json.error?.data?.code).toBe('UNAUTHORIZED')
  })
})

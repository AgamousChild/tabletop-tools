import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import {
  setupAuthTables,
  createRequestHelper,
  authCookie,
  TEST_TOKEN,
  EXPIRED_TOKEN,
} from '@tabletop-tools/auth/src/test-helpers'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createServer } from './server'

const client = createClient({ url: ':memory:' })
const db = createDbFromClient(client)

beforeAll(async () => {
  await setupAuthTables(client)
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS dice_sets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES "user"(id),
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES "user"(id),
      dice_set_id TEXT NOT NULL REFERENCES dice_sets(id),
      opponent_name TEXT,
      z_score REAL,
      is_loaded INTEGER,
      photo_url TEXT,
      created_at INTEGER NOT NULL,
      closed_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS rolls (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      pip_values TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `)
})

afterAll(() => client.close())

const makeRequest = createRequestHelper(() => createServer(db))

describe('HTTP integration — diceSet.create via session cookie', () => {
  it('creates a dice set when a valid session cookie is provided', async () => {
    const res = await makeRequest('/trpc/diceSet.create', {
      method: 'POST',
      cookie: authCookie(),
      body: { name: 'Integration Test Dice' },
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.result?.data?.name).toBe('Integration Test Dice')
    expect(json.result.data.userId).toBe('user-1')
  })

  it('returns UNAUTHORIZED when no cookie is provided', async () => {
    const res = await makeRequest('/trpc/diceSet.create', {
      method: 'POST',
      body: { name: 'Should Fail' },
    })

    const json = (await res.json()) as any
    expect(json.error?.data?.code).toBe('UNAUTHORIZED')
  })

  it('returns UNAUTHORIZED when session token is expired', async () => {
    const res = await makeRequest('/trpc/diceSet.create', {
      method: 'POST',
      cookie: authCookie(EXPIRED_TOKEN),
      body: { name: 'Should Fail' },
    })

    const json = (await res.json()) as any
    expect(json.error?.data?.code).toBe('UNAUTHORIZED')
  })

  it('returns UNAUTHORIZED with an invalid/unknown token', async () => {
    const res = await makeRequest('/trpc/diceSet.create', {
      method: 'POST',
      cookie: authCookie('nonexistent-token'),
      body: { name: 'Should Fail' },
    })

    const json = (await res.json()) as any
    expect(json.error?.data?.code).toBe('UNAUTHORIZED')
  })

  it('works with __Secure- prefixed cookie (production HTTPS)', async () => {
    const res = await makeRequest('/trpc/diceSet.create', {
      method: 'POST',
      cookie: `__Secure-better-auth.session_token=${TEST_TOKEN}`,
      body: { name: 'Secure Cookie Dice' },
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.result?.data?.name).toBe('Secure Cookie Dice')
  })

  it('works with signed cookie format (token.signature)', async () => {
    const res = await makeRequest('/trpc/diceSet.create', {
      method: 'POST',
      cookie: authCookie(`${TEST_TOKEN}.fakesignature123`),
      body: { name: 'Signed Cookie Dice' },
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.result?.data?.name).toBe('Signed Cookie Dice')
  })
})

describe('HTTP integration — diceSet.list via session cookie', () => {
  it('lists dice sets for the authenticated user', async () => {
    const res = await makeRequest('/trpc/diceSet.list', {
      cookie: authCookie(),
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(Array.isArray(json.result?.data)).toBe(true)
    expect(json.result.data.length).toBeGreaterThan(0)
  })

  it('returns UNAUTHORIZED without a cookie', async () => {
    const res = await makeRequest('/trpc/diceSet.list')
    const json = (await res.json()) as any
    expect(json.error?.data?.code).toBe('UNAUTHORIZED')
  })
})

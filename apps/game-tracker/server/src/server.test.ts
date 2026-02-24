import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import {
  setupAuthTables,
  createRequestHelper,
  authCookie,
} from '@tabletop-tools/auth/src/test-helpers'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createServer } from './server'
import { createNullR2Storage } from './lib/storage/r2'

const client = createClient({ url: ':memory:' })
const db = createDbFromClient(client)
const storage = createNullR2Storage()

beforeAll(async () => {
  await setupAuthTables(client)
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES "user"(id),
      list_id TEXT,
      opponent_faction TEXT NOT NULL,
      mission TEXT NOT NULL,
      result TEXT,
      your_final_score INTEGER,
      their_final_score INTEGER,
      is_tournament INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      closed_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS turns (
      id TEXT PRIMARY KEY,
      match_id TEXT NOT NULL REFERENCES matches(id),
      turn_number INTEGER NOT NULL,
      photo_url TEXT,
      your_units_lost TEXT NOT NULL DEFAULT '[]',
      their_units_lost TEXT NOT NULL DEFAULT '[]',
      primary_scored INTEGER NOT NULL DEFAULT 0,
      secondary_scored INTEGER NOT NULL DEFAULT 0,
      cp_spent INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at INTEGER NOT NULL
    );
  `)
})

afterAll(() => client.close())

const makeRequest = createRequestHelper(() => createServer(db, storage))

describe('HTTP integration — match.start via session cookie', () => {
  it('starts a match when authenticated', async () => {
    const res = await makeRequest('/trpc/match.start', {
      method: 'POST',
      cookie: authCookie(),
      body: { opponentFaction: 'Orks', mission: 'Scorched Earth' },
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.result?.data?.opponentFaction).toBe('Orks')
    expect(json.result.data.mission).toBe('Scorched Earth')
    expect(json.result.data.userId).toBe('user-1')
  })

  it('returns UNAUTHORIZED without a cookie', async () => {
    const res = await makeRequest('/trpc/match.start', {
      method: 'POST',
      body: { opponentFaction: 'Orks', mission: 'Scorched Earth' },
    })

    const json = (await res.json()) as any
    expect(json.error?.data?.code).toBe('UNAUTHORIZED')
  })
})

describe('HTTP integration — match.list via session cookie', () => {
  it('lists matches when authenticated', async () => {
    const res = await makeRequest('/trpc/match.list', {
      cookie: authCookie(),
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(Array.isArray(json.result?.data)).toBe(true)
    expect(json.result.data.length).toBeGreaterThan(0)
  })

  it('returns UNAUTHORIZED without a cookie', async () => {
    const res = await makeRequest('/trpc/match.list')
    const json = (await res.json()) as any
    expect(json.error?.data?.code).toBe('UNAUTHORIZED')
  })
})

describe('HTTP integration — match.close via session cookie', () => {
  it('closes a match when authenticated', async () => {
    const createRes = await makeRequest('/trpc/match.start', {
      method: 'POST',
      cookie: authCookie(),
      body: { opponentFaction: 'Necrons', mission: 'Supply Drop' },
    })
    const createJson = (await createRes.json()) as any
    const matchId = createJson.result.data.id

    const res = await makeRequest('/trpc/match.close', {
      method: 'POST',
      cookie: authCookie(),
      body: { matchId, yourScore: 72, theirScore: 45 },
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.result?.data?.result).toBe('WIN')
  })

  it('returns UNAUTHORIZED without a cookie', async () => {
    const res = await makeRequest('/trpc/match.close', {
      method: 'POST',
      body: { matchId: 'x', yourScore: 72, theirScore: 45 },
    })
    const json = (await res.json()) as any
    expect(json.error?.data?.code).toBe('UNAUTHORIZED')
  })
})

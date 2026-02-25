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
    CREATE TABLE IF NOT EXISTS simulations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES "user"(id),
      attacker_content_id TEXT NOT NULL,
      attacker_name TEXT NOT NULL,
      defender_content_id TEXT NOT NULL,
      defender_name TEXT NOT NULL,
      result TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `)
})

afterAll(() => client.close())

const makeRequest = createRequestHelper(() => createServer(db, nullGameContent, TEST_SECRET))

describe('HTTP integration — simulate.save via session cookie', () => {
  const simBody = {
    attackerId: 'unit-a',
    attackerName: 'Intercessors',
    defenderId: 'unit-b',
    defenderName: 'Boyz',
    result: {
      expectedWounds: 4.2,
      expectedModelsRemoved: 1.4,
      survivors: 3.6,
      worstCase: { wounds: 1, modelsRemoved: 0 },
      bestCase: { wounds: 7, modelsRemoved: 2 },
    },
  }

  it('saves a simulation when authenticated', async () => {
    const res = await makeRequest('/trpc/simulate.save', {
      method: 'POST',
      cookie: await authCookie(),
      body: simBody,
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.result?.data?.id).toBeTruthy()
  })

  it('returns UNAUTHORIZED without a cookie', async () => {
    const res = await makeRequest('/trpc/simulate.save', {
      method: 'POST',
      body: simBody,
    })

    const json = (await res.json()) as any
    expect(json.error?.data?.code).toBe('UNAUTHORIZED')
  })
})

describe('HTTP integration — simulate.history via session cookie', () => {
  it('lists simulation history when authenticated', async () => {
    const res = await makeRequest('/trpc/simulate.history', {
      cookie: await authCookie(),
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(Array.isArray(json.result?.data)).toBe(true)
    expect(json.result.data.length).toBeGreaterThan(0)
  })

  it('returns UNAUTHORIZED without a cookie', async () => {
    const res = await makeRequest('/trpc/simulate.history')
    const json = (await res.json()) as any
    expect(json.error?.data?.code).toBe('UNAUTHORIZED')
  })
})

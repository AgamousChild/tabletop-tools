import { createClient } from '@libsql/client'
import {
  authCookie,
  createRequestHelper,
  setupAuthTables,
  TEST_SECRET,
  TEST_USER,
} from '@tabletop-tools/auth/src/test-helpers'
import { createDbFromClient } from '@tabletop-tools/db'
import { applyTestSchema, seedReferenceDims } from '@tabletop-tools/db/src/test-schema'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createServer } from './server'

const client = createClient({ url: ':memory:' })
const db = createDbFromClient(client)

beforeAll(async () => {
  await applyTestSchema(client)
  await seedReferenceDims(client)
  await setupAuthTables(client)
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
      body: { glickoId: 'glicko-1', userId: TEST_USER.id },
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.result?.data?.userId).toBe(TEST_USER.id)
    expect(json.result.data.playerName).toBe('TestPlayer')
  })

  it('returns UNAUTHORIZED without a cookie', async () => {
    const res = await makeRequest('/trpc/admin.linkPlayer', {
      method: 'POST',
      body: { glickoId: 'glicko-1', userId: TEST_USER.id },
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

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
    CREATE TABLE IF NOT EXISTS tournaments (
      id TEXT PRIMARY KEY,
      to_user_id TEXT NOT NULL REFERENCES "user"(id),
      name TEXT NOT NULL,
      event_date INTEGER NOT NULL,
      location TEXT,
      format TEXT NOT NULL,
      total_rounds INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      description TEXT,
      image_url TEXT,
      external_link TEXT,
      start_time TEXT,
      latitude REAL,
      longitude REAL,
      mission_pool TEXT,
      require_photos INTEGER NOT NULL DEFAULT 0,
      include_twists INTEGER NOT NULL DEFAULT 0,
      include_challenger INTEGER NOT NULL DEFAULT 0,
      max_players INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tournament_players (
      id TEXT PRIMARY KEY,
      tournament_id TEXT NOT NULL REFERENCES tournaments(id),
      user_id TEXT NOT NULL REFERENCES "user"(id),
      display_name TEXT NOT NULL,
      faction TEXT NOT NULL,
      detachment TEXT,
      list_text TEXT,
      list_id TEXT,
      list_locked INTEGER NOT NULL DEFAULT 0,
      checked_in INTEGER NOT NULL DEFAULT 0,
      dropped INTEGER NOT NULL DEFAULT 0,
      registered_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rounds (
      id TEXT PRIMARY KEY,
      tournament_id TEXT NOT NULL REFERENCES tournaments(id),
      round_number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      start_time TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pairings (
      id TEXT PRIMARY KEY,
      round_id TEXT NOT NULL REFERENCES rounds(id),
      table_number INTEGER NOT NULL,
      player1_id TEXT NOT NULL,
      player2_id TEXT,
      mission TEXT NOT NULL,
      player1_vp INTEGER,
      player2_vp INTEGER,
      result TEXT,
      reported_by TEXT,
      confirmed INTEGER NOT NULL DEFAULT 0,
      to_override INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS player_elo (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      rating INTEGER NOT NULL DEFAULT 1200,
      games_played INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS elo_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      pairing_id TEXT NOT NULL,
      rating_before INTEGER NOT NULL,
      rating_after INTEGER NOT NULL,
      delta INTEGER NOT NULL,
      opponent_id TEXT NOT NULL,
      recorded_at INTEGER NOT NULL
    );
  `)
})

afterAll(() => client.close())

const makeRequest = createRequestHelper(() => createServer(db, TEST_SECRET))

describe('HTTP integration — tournament.create via session cookie', () => {
  it('creates a tournament when authenticated', async () => {
    const res = await makeRequest('/trpc/tournament.create', {
      method: 'POST',
      cookie: await authCookie(),
      body: {
        name: 'GT Finals London',
        eventDate: Date.now(),
        format: '2000pts Matched Play',
        totalRounds: 5,
      },
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.result?.data?.name).toBe('GT Finals London')
    expect(json.result.data.toUserId).toBe('user-1')
    expect(json.result.data.status).toBe('DRAFT')
  })

  it('returns UNAUTHORIZED without a cookie', async () => {
    const res = await makeRequest('/trpc/tournament.create', {
      method: 'POST',
      body: {
        name: 'GT Finals London',
        eventDate: Date.now(),
        format: '2000pts Matched Play',
        totalRounds: 5,
      },
    })

    const json = (await res.json()) as any
    expect(json.error?.data?.code).toBe('UNAUTHORIZED')
  })
})

describe('HTTP integration — tournament.listMine via session cookie', () => {
  it('lists tournaments when authenticated', async () => {
    const res = await makeRequest('/trpc/tournament.listMine', {
      cookie: await authCookie(),
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(Array.isArray(json.result?.data)).toBe(true)
    expect(json.result.data.length).toBeGreaterThan(0)
  })

  it('returns UNAUTHORIZED without a cookie', async () => {
    const res = await makeRequest('/trpc/tournament.listMine')
    const json = (await res.json()) as any
    expect(json.error?.data?.code).toBe('UNAUTHORIZED')
  })
})

describe('HTTP integration — tournament.delete via session cookie', () => {
  it('deletes a DRAFT tournament when authenticated', async () => {
    const createRes = await makeRequest('/trpc/tournament.create', {
      method: 'POST',
      cookie: await authCookie(),
      body: {
        name: 'Deletable Event',
        eventDate: Date.now(),
        format: '1000pts',
        totalRounds: 3,
      },
    })
    const createJson = (await createRes.json()) as any
    const id = createJson.result.data.id

    const res = await makeRequest('/trpc/tournament.delete', {
      method: 'POST',
      cookie: await authCookie(),
      body: id,
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.result?.data?.deleted).toBe(true)
  })

  it('returns UNAUTHORIZED without a cookie', async () => {
    const res = await makeRequest('/trpc/tournament.delete', {
      method: 'POST',
      body: 'some-id',
    })
    const json = (await res.json()) as any
    expect(json.error?.data?.code).toBe('UNAUTHORIZED')
  })
})

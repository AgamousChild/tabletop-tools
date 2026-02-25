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
const ADMIN_EMAILS = [TEST_USER.email]

beforeAll(async () => {
  await setupAuthTables(client)
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS dice_sets (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, dice_set_id TEXT NOT NULL,
      opponent_name TEXT, z_score REAL, is_loaded INTEGER, photo_url TEXT,
      created_at INTEGER NOT NULL, closed_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS rolls (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, pip_values TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS simulations (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, attacker_content_id TEXT NOT NULL,
      attacker_name TEXT NOT NULL, defender_content_id TEXT NOT NULL,
      defender_name TEXT NOT NULL, result TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS lists (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, faction TEXT NOT NULL, name TEXT NOT NULL,
      total_pts INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS list_units (
      id TEXT PRIMARY KEY, list_id TEXT NOT NULL, unit_content_id TEXT NOT NULL,
      unit_name TEXT NOT NULL, unit_points INTEGER NOT NULL, count INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, list_id TEXT, opponent_faction TEXT NOT NULL,
      mission TEXT NOT NULL, result TEXT, your_final_score INTEGER, their_final_score INTEGER,
      is_tournament INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, closed_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS turns (
      id TEXT PRIMARY KEY, match_id TEXT NOT NULL, turn_number INTEGER NOT NULL, photo_url TEXT,
      your_units_lost TEXT NOT NULL DEFAULT '[]', their_units_lost TEXT NOT NULL DEFAULT '[]',
      primary_scored INTEGER NOT NULL DEFAULT 0, secondary_scored INTEGER NOT NULL DEFAULT 0,
      cp_spent INTEGER NOT NULL DEFAULT 0, notes TEXT, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tournaments (
      id TEXT PRIMARY KEY, to_user_id TEXT NOT NULL, name TEXT NOT NULL,
      event_date INTEGER NOT NULL, location TEXT, format TEXT NOT NULL,
      total_rounds INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'DRAFT', created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tournament_players (
      id TEXT PRIMARY KEY, tournament_id TEXT NOT NULL, user_id TEXT NOT NULL,
      display_name TEXT NOT NULL, faction TEXT NOT NULL, detachment TEXT, list_text TEXT,
      list_locked INTEGER NOT NULL DEFAULT 0, checked_in INTEGER NOT NULL DEFAULT 0,
      dropped INTEGER NOT NULL DEFAULT 0, registered_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS player_elo (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE, rating INTEGER NOT NULL DEFAULT 1200,
      games_played INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS imported_tournament_results (
      id TEXT PRIMARY KEY, imported_by TEXT NOT NULL, event_name TEXT NOT NULL,
      event_date INTEGER NOT NULL, format TEXT NOT NULL, meta_window TEXT NOT NULL,
      raw_data TEXT NOT NULL, parsed_data TEXT NOT NULL, imported_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS player_glicko (
      id TEXT PRIMARY KEY, user_id TEXT, player_name TEXT NOT NULL,
      rating REAL NOT NULL DEFAULT 1500, rating_deviation REAL NOT NULL DEFAULT 350,
      volatility REAL NOT NULL DEFAULT 0.06, games_played INTEGER NOT NULL DEFAULT 0,
      last_rating_period TEXT, updated_at INTEGER NOT NULL
    );
  `)
})

afterAll(() => client.close())

const makeRequest = createRequestHelper(() => createServer(db, ADMIN_EMAILS, TEST_SECRET))

describe('HTTP integration — stats.overview via session cookie', () => {
  it('returns overview when admin authenticated', async () => {
    const res = await makeRequest('/trpc/stats.overview', {
      cookie: await authCookie(),
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.result?.data?.users).toBeDefined()
    expect(json.result.data.sessions).toBeDefined()
  })

  it('returns UNAUTHORIZED without a cookie', async () => {
    const res = await makeRequest('/trpc/stats.overview')
    const json = (await res.json()) as any
    expect(json.error?.data?.code).toBe('UNAUTHORIZED')
  })

  it('returns FORBIDDEN for non-admin user', async () => {
    const res = await makeRequest('/trpc/stats.overview', {
      cookie: await authCookie('bob-token'),
    })
    const json = (await res.json()) as any
    expect(json.error?.data?.code).toBe('FORBIDDEN')
  })
})

describe('HTTP integration — stats.recentUsers via session cookie', () => {
  it('returns recent users when admin authenticated', async () => {
    const res = await makeRequest('/trpc/stats.recentUsers', {
      cookie: await authCookie(),
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(Array.isArray(json.result?.data)).toBe(true)
  })

  it('returns UNAUTHORIZED without a cookie', async () => {
    const res = await makeRequest('/trpc/stats.recentUsers')
    const json = (await res.json()) as any
    expect(json.error?.data?.code).toBe('UNAUTHORIZED')
  })
})

describe('HTTP integration — health endpoint (public)', () => {
  it('works without auth', async () => {
    const res = await makeRequest('/trpc/health')
    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.result?.data?.status).toBe('ok')
  })
})

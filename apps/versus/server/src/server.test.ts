import { createClient } from '@libsql/client'
import {
  authCookie,
  createRequestHelper,
  setupAuthTables,
  TEST_SECRET,
} from '@tabletop-tools/auth/src/test-helpers'
import { createDbFromClient } from '@tabletop-tools/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createServer } from './server'

const client = createClient({ url: ':memory:' })
const db = createDbFromClient(client)

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
      config_hash TEXT,
      weapon_config TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS list (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      edition TEXT NOT NULL DEFAULT '11th',
      faction_id TEXT,
      subfaction_id TEXT,
      detachment_id TEXT,
      battle_size TEXT NOT NULL DEFAULT 'unknown',
      total_points INTEGER NOT NULL DEFAULT 0,
      dataslate_id TEXT,
      source TEXT NOT NULL DEFAULT 'list-builder',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS list_unit (
      id TEXT PRIMARY KEY,
      list_id TEXT NOT NULL REFERENCES list(id) ON DELETE CASCADE,
      datasheet_id TEXT,
      enhancement_id TEXT,
      is_warlord INTEGER NOT NULL DEFAULT 0,
      points INTEGER NOT NULL DEFAULT 0,
      attached_to_unit_id TEXT REFERENCES list_unit(id),
      attach_role TEXT
    );

    CREATE TABLE IF NOT EXISTS simulation (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      label TEXT,
      attacker_unit_id TEXT REFERENCES list_unit(id) ON DELETE SET NULL,
      defender_unit_id TEXT REFERENCES list_unit(id) ON DELETE SET NULL,
      attacker_name TEXT NOT NULL,
      defender_name TEXT NOT NULL,
      dataslate_id TEXT,
      expected_wounds REAL NOT NULL,
      expected_models_removed REAL NOT NULL,
      survivors REAL NOT NULL,
      worst_wounds REAL NOT NULL,
      worst_models REAL NOT NULL,
      best_wounds REAL NOT NULL,
      best_models REAL NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS simulation_weapon (
      id TEXT PRIMARY KEY,
      simulation_id TEXT NOT NULL REFERENCES simulation(id) ON DELETE CASCADE,
      profile_kind TEXT NOT NULL,
      profile_id TEXT,
      weapon_name TEXT NOT NULL,
      model_count INTEGER NOT NULL,
      weapons_per_model INTEGER NOT NULL,
      attacks_per_weapon REAL NOT NULL,
      total_attacks REAL NOT NULL,
      expected_wounds REAL NOT NULL,
      expected_models_removed REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS simulation_modifier (
      id TEXT PRIMARY KEY,
      simulation_id TEXT NOT NULL REFERENCES simulation(id) ON DELETE CASCADE,
      side TEXT NOT NULL,
      source TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT
    );
  `)
})

afterAll(() => client.close())

const makeRequest = createRequestHelper(() => createServer(db, TEST_SECRET))

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

describe('HTTP integration — simulateV2.save via session cookie', () => {
  const v2SaveBody = {
    attackerName: 'Intercessors',
    defenderName: 'Ork Boyz',
    expectedWounds: 2.5,
    expectedModelsRemoved: 1.2,
    survivors: 8.8,
    worstWounds: 0,
    worstModels: 0,
    bestWounds: 8,
    bestModels: 4,
    weapons: [
      {
        profileKind: 'ranged',
        weaponName: 'Bolt Rifle',
        modelCount: 10,
        weaponsPerModel: 1,
        attacksNotation: '2',
        expectedWounds: 2.5,
        expectedModelsRemoved: 1.2,
      },
    ],
    modifiers: [],
  }

  it('saves a v2 simulation when authenticated', async () => {
    const res = await makeRequest('/trpc/simulateV2.save', {
      method: 'POST',
      cookie: await authCookie(),
      body: v2SaveBody,
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.result?.data?.id).toBeTruthy()
  })

  it('returns UNAUTHORIZED without a cookie', async () => {
    const res = await makeRequest('/trpc/simulateV2.save', {
      method: 'POST',
      body: v2SaveBody,
    })

    const json = (await res.json()) as any
    expect(json.error?.data?.code).toBe('UNAUTHORIZED')
  })
})

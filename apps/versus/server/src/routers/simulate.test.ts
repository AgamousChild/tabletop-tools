import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import type { GameContentAdapter, UnitProfile, WeaponProfile } from '@tabletop-tools/game-content'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { createCallerFactory } from '../trpc'
import { appRouter } from './index'

const client = createClient({ url: ':memory:' })
const db = createDbFromClient(client)

function makeWeapon(overrides: Partial<WeaponProfile> = {}): WeaponProfile {
  return {
    name: 'Bolter',
    range: 24,
    attacks: 2,
    skill: 3,
    strength: 4,
    ap: 0,
    damage: 1,
    abilities: [],
    ...overrides,
  }
}

function makeUnit(id: string, overrides: Partial<UnitProfile> = {}): UnitProfile {
  return {
    id,
    faction: 'Space Marines',
    name: 'Test Unit',
    move: 6,
    toughness: 4,
    save: 3,
    wounds: 2,
    leadership: 6,
    oc: 1,
    weapons: [makeWeapon()],
    abilities: [],
    points: 100,
    ...overrides,
  }
}

const mockAdapter: GameContentAdapter = {
  load: vi.fn().mockResolvedValue(undefined),
  getUnit: vi.fn(),
  searchUnits: vi.fn(),
  listFactions: vi.fn(),
}

beforeAll(async () => {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS "user" (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      email_verified INTEGER NOT NULL DEFAULT 0,
      image TEXT,
      username TEXT UNIQUE,
      display_username TEXT UNIQUE,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
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
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES ('user-1', 'Alice', 'alice@example.com', 0, 0, 0);
  `)
})

afterAll(() => client.close())

const createCaller = createCallerFactory(appRouter)
const req = new Request('http://localhost')
const ctx = {
  user: { id: 'user-1', email: 'alice@example.com', name: 'Alice' },
  req,
  db,
  gameContent: mockAdapter,
}
const unauthCtx = { user: null, req, db, gameContent: mockAdapter }

describe('simulate.run', () => {
  it('returns simulation result for two known units', async () => {
    const attacker = makeUnit('a1', {
      weapons: [makeWeapon({ attacks: 4, skill: 3, strength: 4, ap: 0, damage: 1 })],
    })
    const defender = makeUnit('d1', { toughness: 4, save: 3, wounds: 2 })
    vi.mocked(mockAdapter.getUnit)
      .mockResolvedValueOnce(attacker)
      .mockResolvedValueOnce(defender)

    const caller = createCaller(ctx)
    const result = await caller.simulate.run({
      attackerId: 'a1',
      defenderId: 'd1',
      defenderModelCount: 5,
    })

    expect(result.expectedWounds).toBeGreaterThanOrEqual(0)
    expect(result.expectedModelsRemoved).toBeGreaterThanOrEqual(0)
    expect(result.expectedModelsRemoved).toBeLessThanOrEqual(5)
    expect(result.survivors).toBeGreaterThanOrEqual(0)
    expect(result.bestCase).toBeDefined()
    expect(result.worstCase).toBeDefined()
  })

  it('throws NOT_FOUND if attacker does not exist', async () => {
    vi.mocked(mockAdapter.getUnit).mockResolvedValueOnce(null)
    const caller = createCaller(ctx)
    await expect(
      caller.simulate.run({ attackerId: 'bad', defenderId: 'd1', defenderModelCount: 1 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('throws NOT_FOUND if defender does not exist', async () => {
    vi.mocked(mockAdapter.getUnit)
      .mockResolvedValueOnce(makeUnit('a1'))
      .mockResolvedValueOnce(null)
    const caller = createCaller(ctx)
    await expect(
      caller.simulate.run({ attackerId: 'a1', defenderId: 'bad', defenderModelCount: 1 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('rejects unauthenticated callers', async () => {
    const caller = createCaller(unauthCtx)
    await expect(
      caller.simulate.run({ attackerId: 'a1', defenderId: 'd1', defenderModelCount: 1 }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('attacker with no weapons returns zero wounds', async () => {
    const attacker = makeUnit('a1', { weapons: [] })
    const defender = makeUnit('d1')
    vi.mocked(mockAdapter.getUnit)
      .mockResolvedValueOnce(attacker)
      .mockResolvedValueOnce(defender)
    const caller = createCaller(ctx)
    const result = await caller.simulate.run({
      attackerId: 'a1',
      defenderId: 'd1',
      defenderModelCount: 1,
    })
    expect(result.expectedWounds).toBe(0)
    expect(result.expectedModelsRemoved).toBe(0)
  })
})

describe('simulate.save', () => {
  it('saves a simulation result and returns an id', async () => {
    const attacker = makeUnit('a1')
    const defender = makeUnit('d1')
    vi.mocked(mockAdapter.getUnit)
      .mockResolvedValueOnce(attacker)
      .mockResolvedValueOnce(defender)

    const caller = createCaller(ctx)
    const runResult = await caller.simulate.run({
      attackerId: 'a1',
      defenderId: 'd1',
      defenderModelCount: 5,
    })
    const saved = await caller.simulate.save({
      attackerId: 'a1',
      attackerName: 'Test Attacker',
      defenderId: 'd1',
      defenderName: 'Test Defender',
      result: runResult,
    })
    expect(saved.id).toBeTruthy()
  })

  it('rejects unauthenticated callers', async () => {
    const caller = createCaller(unauthCtx)
    await expect(
      caller.simulate.save({
        attackerId: 'a1',
        attackerName: 'A',
        defenderId: 'd1',
        defenderName: 'D',
        result: { expectedWounds: 0, expectedModelsRemoved: 0, survivors: 1, worstCase: { wounds: 0, modelsRemoved: 0 }, bestCase: { wounds: 0, modelsRemoved: 0 } },
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})

describe('simulate.history', () => {
  it('returns saved simulations for the current user', async () => {
    const caller = createCaller(ctx)
    const history = await caller.simulate.history()
    expect(Array.isArray(history)).toBe(true)
    // At least one from the save test
    expect(history.length).toBeGreaterThan(0)
  })

  it('rejects unauthenticated callers', async () => {
    const caller = createCaller(unauthCtx)
    await expect(caller.simulate.history()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})

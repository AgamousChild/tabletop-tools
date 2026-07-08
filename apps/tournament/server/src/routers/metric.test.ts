import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createCallerFactory } from '../trpc'
import { appRouter } from './index'

const client = createClient({ url: ':memory:' })
const db = createDbFromClient(client)

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
    CREATE TABLE IF NOT EXISTS ranking_metric (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      description TEXT
    );
    CREATE TABLE IF NOT EXISTS tournament_pairing_metric (
      id TEXT PRIMARY KEY,
      tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      ranking_metric_id TEXT NOT NULL REFERENCES ranking_metric(id),
      sort_order INTEGER NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      CONSTRAINT uq_tourn_pairing_metric UNIQUE(tournament_id, ranking_metric_id)
    );
    CREATE TABLE IF NOT EXISTS tournament_placing_metric (
      id TEXT PRIMARY KEY,
      tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      ranking_metric_id TEXT NOT NULL REFERENCES ranking_metric(id),
      sort_order INTEGER NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      CONSTRAINT uq_tourn_placing_metric UNIQUE(tournament_id, ranking_metric_id)
    );
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES ('to-1', 'Alice', 'alice@example.com', 0, 0, 0);
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES ('player-1', 'Bob', 'bob@example.com', 0, 0, 0);
    INSERT INTO tournaments (id, to_user_id, name, event_date, format, total_rounds, status, created_at)
    VALUES ('t1', 'to-1', 'Test GT', 1000, '2000pts', 5, 'IN_PROGRESS', 1000);
    INSERT INTO ranking_metric (id, key, label, description)
    VALUES ('wins', 'wins', 'Wins', 'Number of wins');
    INSERT INTO ranking_metric (id, key, label, description)
    VALUES ('battle_points', 'battle_points', 'Battle Points', 'Total VP earned');
    INSERT INTO ranking_metric (id, key, label, description)
    VALUES ('sos_wins', 'sos_wins', 'SOS Wins', 'Sum of opponents wins');
  `)
})

afterAll(() => client.close())

const createCaller = createCallerFactory(appRouter)

function toCaller() {
  return createCaller({
    db,
    user: { id: 'to-1', email: 'alice@example.com', name: 'Alice' },
    req: new Request('http://test'),
    environment: 'development',
  })
}

function playerCaller() {
  return createCaller({
    db,
    user: { id: 'player-1', email: 'bob@example.com', name: 'Bob' },
    req: new Request('http://test'),
    environment: 'development',
  })
}

describe('metric.listMetrics', () => {
  it('returns all ranking metric definitions', async () => {
    const caller = toCaller()
    const metrics = await caller.metric.listMetrics()
    expect(metrics.length).toBeGreaterThanOrEqual(3)
    const keys = metrics.map((m) => m.key)
    expect(keys).toContain('wins')
    expect(keys).toContain('battle_points')
    expect(keys).toContain('sos_wins')
  })
})

describe('metric.upsertMetric', () => {
  it('creates a new custom metric', async () => {
    const caller = toCaller()
    const result = await caller.metric.upsertMetric({
      id: 'custom-vp',
      key: 'custom_vp',
      label: 'Custom VP',
      description: 'Custom victory points metric',
    })
    expect(result).toBeDefined()
    expect(result!.key).toBe('custom_vp')
    expect(result!.label).toBe('Custom VP')
  })

  it('updates an existing metric on conflict', async () => {
    const caller = toCaller()
    const result = await caller.metric.upsertMetric({
      id: 'custom-vp',
      key: 'custom_vp',
      label: 'Custom VP (Updated)',
      description: 'Updated description',
    })
    expect(result!.label).toBe('Custom VP (Updated)')
  })
})

describe('metric.setStack + metric.getStack', () => {
  it('TO can set the pairing metric stack for a tournament', async () => {
    const caller = toCaller()
    const stack = await caller.metric.setStack({
      tournamentId: 't1',
      stackType: 'pairing',
      metrics: [
        { rankingMetricId: 'wins', sortOrder: 0, enabled: true },
        { rankingMetricId: 'battle_points', sortOrder: 1, enabled: true },
        { rankingMetricId: 'sos_wins', sortOrder: 2, enabled: true },
      ],
    })
    expect(stack).toHaveLength(3)
    expect(stack[0]?.key).toBe('wins')
    expect(stack[1]?.key).toBe('battle_points')
    expect(stack[2]?.key).toBe('sos_wins')
  })

  it('getStack returns the same ordered stack', async () => {
    const caller = toCaller()
    const stack = await caller.metric.getStack({ tournamentId: 't1', stackType: 'pairing' })
    expect(stack).toHaveLength(3)
    expect(stack[0]?.sortOrder).toBe(0)
    expect(stack[1]?.sortOrder).toBe(1)
    expect(stack[2]?.sortOrder).toBe(2)
    expect(stack[0]?.label).toBe('Wins')
  })

  it('setStack replaces the existing stack entirely', async () => {
    const caller = toCaller()
    const stack = await caller.metric.setStack({
      tournamentId: 't1',
      stackType: 'pairing',
      metrics: [
        { rankingMetricId: 'wins', sortOrder: 0, enabled: true },
        { rankingMetricId: 'battle_points', sortOrder: 1, enabled: true },
      ],
    })
    expect(stack).toHaveLength(2)
    expect(stack.some((m) => m.key === 'sos_wins')).toBe(false)
  })

  it('non-TO cannot set the metric stack', async () => {
    const caller = playerCaller()
    await expect(
      caller.metric.setStack({
        tournamentId: 't1',
        stackType: 'pairing',
        metrics: [{ rankingMetricId: 'wins', sortOrder: 0, enabled: true }],
      }),
    ).rejects.toThrow('Not authorized')
  })

  it('setStack returns NOT_FOUND for missing tournament', async () => {
    const caller = toCaller()
    await expect(
      caller.metric.setStack({
        tournamentId: 'no-such-tournament',
        stackType: 'placing',
        metrics: [],
      }),
    ).rejects.toThrow('Tournament not found')
  })

  it('placing stack is independent of pairing stack', async () => {
    const caller = toCaller()
    await caller.metric.setStack({
      tournamentId: 't1',
      stackType: 'placing',
      metrics: [
        { rankingMetricId: 'wins', sortOrder: 0, enabled: true },
        { rankingMetricId: 'battle_points', sortOrder: 1, enabled: true },
        { rankingMetricId: 'sos_wins', sortOrder: 2, enabled: true },
      ],
    })

    const placingStack = await caller.metric.getStack({ tournamentId: 't1', stackType: 'placing' })
    const pairingStack = await caller.metric.getStack({ tournamentId: 't1', stackType: 'pairing' })

    expect(placingStack).toHaveLength(3)
    // pairing was previously reduced to 2
    expect(pairingStack).toHaveLength(2)
  })
})

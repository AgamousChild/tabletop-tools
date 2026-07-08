import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { TEST_PLAYERS } from '../__fixtures__/test-players'
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
      registered_at INTEGER NOT NULL,
      faction_entity_id TEXT,
      detachment_entity_id TEXT,
      placement INTEGER
    );
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES ('to-1', 'Alice', 'alice@example.com', 0, 0, 0);
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES ('player-1', 'Bob', 'bob@example.com', 0, 0, 0);
    INSERT INTO tournaments (id, to_user_id, name, event_date, format, total_rounds, status, created_at)
    VALUES ('t1', 'to-1', 'Test GT', 1000, '2000pts', 5, 'REGISTRATION', 1000);
  `)
})

afterAll(() => client.close())

const createCaller = createCallerFactory(appRouter)

function toCaller(environment: string) {
  return createCaller({
    db,
    user: { id: 'to-1', email: 'alice@example.com', name: 'Alice' },
    req: new Request('http://test'),
    environment,
  })
}

function playerCaller(environment: string) {
  return createCaller({
    db,
    user: { id: 'player-1', email: 'bob@example.com', name: 'Bob' },
    req: new Request('http://test'),
    environment,
  })
}

describe('__fixtures__/test-players', () => {
  it('provides a bounded, well-formed fixture list for seedTestPlayers', () => {
    expect(TEST_PLAYERS.length).toBeGreaterThan(0)
    expect(TEST_PLAYERS.length).toBeLessThanOrEqual(32) // seedTestPlayers count input max
    for (const p of TEST_PLAYERS) {
      expect(p.name.length).toBeGreaterThan(0)
      expect(p.faction.length).toBeGreaterThan(0)
    }
  })
})

describe('player.seedTestPlayers — environment gate (Rule 7)', () => {
  it('rejects with FORBIDDEN when environment is production', async () => {
    const caller = toCaller('production')
    await expect(caller.player.seedTestPlayers({ tournamentId: 't1', count: 4 })).rejects.toThrow(
      'not available in production',
    )
  })

  it('does not insert any rows when rejected in production', async () => {
    const caller = toCaller('production')
    await expect(caller.player.seedTestPlayers({ tournamentId: 't1', count: 4 })).rejects.toThrow()

    const players = await caller.player.list({ tournamentId: 't1' })
    expect(players.length).toBe(0)
  })

  it('is not blocked by the environment gate in development (reaches the insert path)', async () => {
    // NOTE: tournament_players.user_id is a NOT NULL FK -> "user"(id) in the real
    // schema (packages/db/src/schema.ts:410-412). seedTestPlayers inserts a
    // fabricated `test-${uuid}` userId with no corresponding user row, so this
    // throws a FK violation rather than UNAUTHORIZED/FORBIDDEN — proving the
    // request got PAST the environment gate (the thing this test suite is
    // responsible for) and reached real insert logic. That FK mismatch is a
    // pre-existing bug in seedTestPlayers, out of scope for the Rule 7 gate
    // fixed here; tracked separately.
    const caller = toCaller('development')
    await expect(caller.player.seedTestPlayers({ tournamentId: 't1', count: 4 })).rejects.toThrow(
      /FOREIGN KEY/i,
    )
  })

  it('still enforces TO-only authorization in non-production', async () => {
    const caller = playerCaller('development')
    await expect(caller.player.seedTestPlayers({ tournamentId: 't1', count: 2 })).rejects.toThrow(
      'Not authorized',
    )
  })

  it('checks the environment gate before tournament lookup (fails closed even for a bad tournamentId)', async () => {
    const caller = toCaller('production')
    await expect(
      caller.player.seedTestPlayers({ tournamentId: 'does-not-exist', count: 2 }),
    ).rejects.toThrow('not available in production')
  })
})

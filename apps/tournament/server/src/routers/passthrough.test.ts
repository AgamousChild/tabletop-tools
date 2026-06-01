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
    CREATE TABLE IF NOT EXISTS passthrough_event (
      id TEXT PRIMARY KEY,
      bcp_event_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      event_date INTEGER,
      location TEXT,
      game_system TEXT,
      player_count INTEGER,
      registration_url TEXT,
      last_synced_at INTEGER NOT NULL
    );
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES ('user-1', 'Alice', 'alice@example.com', 0, 0, 0);
  `)
})

afterAll(() => client.close())

const createCaller = createCallerFactory(appRouter)

function authedCaller() {
  return createCaller({
    db,
    user: { id: 'user-1', email: 'alice@example.com', name: 'Alice' },
    req: new Request('http://test'),
  })
}

function publicCaller() {
  return createCaller({
    db,
    user: null,
    req: new Request('http://test'),
  })
}

describe('passthrough.upsert', () => {
  it('creates a new passthrough event', async () => {
    const caller = authedCaller()
    const event = await caller.passthrough.upsert({
      bcpEventId: 'bcp-123',
      name: 'Regional GT 2026',
      eventDate: 1780000000,
      location: 'Chicago, IL',
      gameSystem: 'Warhammer 40,000',
      playerCount: 64,
      registrationUrl: 'https://bcp.io/register/123',
    })
    expect(event).toBeDefined()
    expect(event!.name).toBe('Regional GT 2026')
    expect(event!.playerCount).toBe(64)
    expect(event!.bcpEventId).toBe('bcp-123')
  })

  it('updates an existing event on conflict (same bcpEventId)', async () => {
    const caller = authedCaller()
    const updated = await caller.passthrough.upsert({
      bcpEventId: 'bcp-123',
      name: 'Regional GT 2026 (Updated)',
      playerCount: 72,
    })
    expect(updated!.name).toBe('Regional GT 2026 (Updated)')
    expect(updated!.playerCount).toBe(72)
  })
})

describe('passthrough.get', () => {
  it('returns a passthrough event by id', async () => {
    const caller = authedCaller()
    // Get the event we just upserted
    const list = await caller.passthrough.list({ limit: 10 })
    const id = list[0]!.id

    const event = await caller.passthrough.get(id)
    expect(event.bcpEventId).toBe('bcp-123')
    expect(event.name).toBe('Regional GT 2026 (Updated)')
  })

  it('throws NOT_FOUND for missing id', async () => {
    const caller = authedCaller()
    await expect(caller.passthrough.get('no-such-id')).rejects.toThrow('Event not found')
  })
})

describe('passthrough.list', () => {
  beforeAll(async () => {
    // Seed more events for search and pagination tests
    const caller = authedCaller()
    await caller.passthrough.upsert({
      bcpEventId: 'bcp-200',
      name: 'Midwest Championship',
      eventDate: 1785000000,
      location: 'Minneapolis, MN',
      playerCount: 128,
    })
    await caller.passthrough.upsert({
      bcpEventId: 'bcp-201',
      name: 'East Coast Open',
      eventDate: 1786000000,
      location: 'New York, NY',
      playerCount: 96,
    })
  })

  it('lists all events (no filter)', async () => {
    const caller = publicCaller()
    const events = await caller.passthrough.list({ limit: 10 })
    expect(events.length).toBeGreaterThanOrEqual(3)
  })

  it('filters by name search', async () => {
    const caller = publicCaller()
    const events = await caller.passthrough.list({ search: 'Championship' })
    expect(events.every((e) => e.name.includes('Championship'))).toBe(true)
    expect(events.length).toBeGreaterThanOrEqual(1)
  })

  it('respects limit', async () => {
    const caller = publicCaller()
    const events = await caller.passthrough.list({ limit: 2 })
    expect(events.length).toBeLessThanOrEqual(2)
  })
})

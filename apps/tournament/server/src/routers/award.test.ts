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
    CREATE TABLE IF NOT EXISTS tournament_awards (
      id TEXT PRIMARY KEY,
      tournament_id TEXT NOT NULL REFERENCES tournaments(id),
      name TEXT NOT NULL,
      description TEXT,
      recipient_id TEXT REFERENCES tournament_players(id),
      created_at INTEGER NOT NULL
    );
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES ('to-1', 'Alice', 'alice@example.com', 0, 0, 0);
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES ('player-1', 'Bob', 'bob@example.com', 0, 0, 0);
    INSERT INTO tournaments (id, to_user_id, name, event_date, format, total_rounds, status, created_at)
    VALUES ('t1', 'to-1', 'Test GT', 1000, '2000pts', 5, 'IN_PROGRESS', 1000);
    INSERT INTO tournament_players (id, tournament_id, user_id, display_name, faction, list_locked, checked_in, dropped, registered_at)
    VALUES ('tp1', 't1', 'player-1', 'Bob', 'Orks', 0, 1, 0, 1000);
  `)
})

afterAll(() => client.close())

const createCaller = createCallerFactory(appRouter)

function toCaller() {
  return createCaller({ db, user: { id: 'to-1', email: 'alice@example.com', name: 'Alice' }, req: new Request('http://test') })
}

function playerCaller() {
  return createCaller({ db, user: { id: 'player-1', email: 'bob@example.com', name: 'Bob' }, req: new Request('http://test') })
}

describe('award router', () => {
  let awardId: string

  it('TO can create an award', async () => {
    const caller = toCaller()
    const award = await caller.award.create({
      tournamentId: 't1',
      name: 'Best Painted',
      description: 'Most impressive paint job',
    })
    expect(award).toBeDefined()
    expect(award!.name).toBe('Best Painted')
    expect(award!.description).toBe('Most impressive paint job')
    expect(award!.recipientId).toBeNull()
    awardId = award!.id
  })

  it('non-TO cannot create awards', async () => {
    const caller = playerCaller()
    await expect(
      caller.award.create({
        tournamentId: 't1',
        name: 'Best General',
      }),
    ).rejects.toThrow('Not authorized')
  })

  it('lists awards for tournament', async () => {
    const caller = toCaller()
    const awards = await caller.award.list({ tournamentId: 't1' })
    expect(awards.length).toBeGreaterThanOrEqual(1)
    expect(awards.some((a) => a.name === 'Best Painted')).toBe(true)
  })

  it('TO can assign an award to a player', async () => {
    const caller = toCaller()
    const award = await caller.award.assign({
      awardId,
      recipientId: 'tp1',
    })
    expect(award).toBeDefined()
    expect(award!.recipientId).toBe('tp1')
  })

  it('non-TO cannot assign awards', async () => {
    const caller = playerCaller()
    await expect(
      caller.award.assign({
        awardId,
        recipientId: 'tp1',
      }),
    ).rejects.toThrow('Not authorized')
  })
})

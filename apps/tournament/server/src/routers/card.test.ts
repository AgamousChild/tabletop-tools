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
    CREATE TABLE IF NOT EXISTS tournament_cards (
      id TEXT PRIMARY KEY,
      tournament_id TEXT NOT NULL REFERENCES tournaments(id),
      player_id TEXT NOT NULL REFERENCES tournament_players(id),
      issued_by TEXT NOT NULL REFERENCES "user"(id),
      card_type TEXT NOT NULL,
      reason TEXT NOT NULL,
      issued_at INTEGER NOT NULL
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

describe('card router', () => {
  it('TO can issue a yellow card', async () => {
    const caller = toCaller()
    const card = await caller.card.issue({
      tournamentId: 't1',
      playerId: 'tp1',
      cardType: 'YELLOW',
      reason: 'Slow play',
    })
    expect(card).toBeDefined()
    expect(card!.cardType).toBe('YELLOW')
    expect(card!.reason).toBe('Slow play')
  })

  it('TO can issue a red card', async () => {
    const caller = toCaller()
    const card = await caller.card.issue({
      tournamentId: 't1',
      playerId: 'tp1',
      cardType: 'RED',
      reason: 'Unsportsmanlike conduct',
    })
    expect(card).toBeDefined()
    expect(card!.cardType).toBe('RED')
  })

  it('non-TO cannot issue cards', async () => {
    const caller = playerCaller()
    await expect(
      caller.card.issue({
        tournamentId: 't1',
        playerId: 'tp1',
        cardType: 'YELLOW',
        reason: 'test',
      }),
    ).rejects.toThrow('Not authorized')
  })

  it('lists cards for tournament', async () => {
    const caller = toCaller()
    const cards = await caller.card.listForTournament({ tournamentId: 't1' })
    expect(cards.length).toBeGreaterThanOrEqual(2)
  })

  it('lists card history for player', async () => {
    const caller = toCaller()
    const cards = await caller.card.playerHistory({ playerId: 'tp1' })
    expect(cards.length).toBeGreaterThanOrEqual(2)
    expect(cards.every((c) => c.playerId === 'tp1')).toBe(true)
  })
})

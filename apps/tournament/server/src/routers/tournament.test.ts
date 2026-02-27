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
    CREATE TABLE IF NOT EXISTS rounds (
      id TEXT PRIMARY KEY,
      tournament_id TEXT NOT NULL REFERENCES tournaments(id),
      round_number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pairings (
      id TEXT PRIMARY KEY,
      round_id TEXT NOT NULL REFERENCES rounds(id),
      table_number INTEGER NOT NULL,
      player1_id TEXT NOT NULL REFERENCES tournament_players(id),
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
      user_id TEXT NOT NULL UNIQUE REFERENCES "user"(id),
      rating INTEGER NOT NULL DEFAULT 1200,
      games_played INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS elo_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES "user"(id),
      pairing_id TEXT NOT NULL REFERENCES pairings(id),
      rating_before INTEGER NOT NULL,
      rating_after INTEGER NOT NULL,
      delta INTEGER NOT NULL,
      opponent_id TEXT NOT NULL REFERENCES "user"(id),
      recorded_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS imported_tournament_results (
      id TEXT PRIMARY KEY,
      imported_by TEXT NOT NULL,
      event_name TEXT NOT NULL,
      event_date INTEGER NOT NULL,
      format TEXT NOT NULL,
      meta_window TEXT NOT NULL,
      raw_data TEXT NOT NULL,
      parsed_data TEXT NOT NULL,
      imported_at INTEGER NOT NULL
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
    CREATE TABLE IF NOT EXISTS tournament_awards (
      id TEXT PRIMARY KEY,
      tournament_id TEXT NOT NULL REFERENCES tournaments(id),
      name TEXT NOT NULL,
      description TEXT,
      recipient_id TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_bans (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES "user"(id),
      reason TEXT NOT NULL,
      banned_by TEXT NOT NULL REFERENCES "user"(id),
      banned_at INTEGER NOT NULL,
      lifted_at INTEGER
    );
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES ('to-1', 'Alice', 'alice@example.com', 0, 0, 0);
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES ('player-1', 'Bob', 'bob@example.com', 0, 0, 0);
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES ('player-2', 'Carol', 'carol@example.com', 0, 0, 0);
  `)
})

afterAll(() => client.close())

const createCaller = createCallerFactory(appRouter)
const req = new Request('http://localhost')
const toCtx = { user: { id: 'to-1', email: 'alice@example.com', name: 'Alice' }, req, db }
const p1Ctx = { user: { id: 'player-1', email: 'bob@example.com', name: 'Bob' }, req, db }
const p2Ctx = { user: { id: 'player-2', email: 'carol@example.com', name: 'Carol' }, req, db }
const unauthCtx = { user: null, req, db }

describe('tournament.create', () => {
  it('creates a tournament and returns it', async () => {
    const caller = createCaller(toCtx)
    const t = await caller.tournament.create({
      name: 'Test GT',
      eventDate: 1700000000,
      format: '2000pts Matched Play',
      totalRounds: 5,
    })
    expect(t?.name).toBe('Test GT')
    expect(t?.status).toBe('DRAFT')
    expect(t?.toUserId).toBe('to-1')
  })

  it('rejects unauthenticated', async () => {
    const caller = createCaller(unauthCtx)
    await expect(
      caller.tournament.create({ name: 'X', eventDate: 0, format: 'f', totalRounds: 3 }),
    ).rejects.toThrow()
  })
})

describe('tournament.advanceStatus', () => {
  it('advances from DRAFT to REGISTRATION', async () => {
    const caller = createCaller(toCtx)
    const t = await caller.tournament.create({
      name: 'Advance Test',
      eventDate: 1700000000,
      format: '2000pts',
      totalRounds: 3,
    })
    const advanced = await caller.tournament.advanceStatus(t!.id)
    expect(advanced?.status).toBe('REGISTRATION')
  })

  it('rejects if user is not the TO', async () => {
    const toCaller = createCaller(toCtx)
    const t = await toCaller.tournament.create({
      name: 'Authorization Test',
      eventDate: 1700000000,
      format: '2000pts',
      totalRounds: 3,
    })
    const p1Caller = createCaller(p1Ctx)
    await expect(p1Caller.tournament.advanceStatus(t!.id)).rejects.toThrow()
  })
})

describe('player.register', () => {
  it('registers a player when registration is open', async () => {
    const toCaller = createCaller(toCtx)
    const t = await toCaller.tournament.create({
      name: 'Player Register Test',
      eventDate: 1700000000,
      format: '2000pts',
      totalRounds: 3,
    })
    await toCaller.tournament.advanceStatus(t!.id) // → REGISTRATION

    const p1Caller = createCaller(p1Ctx)
    const player = await p1Caller.player.register({
      tournamentId: t!.id,
      displayName: 'Bob',
      faction: 'Orks',
    })
    expect(player?.displayName).toBe('Bob')
    expect(player?.faction).toBe('Orks')
    expect(player?.dropped).toBe(0)
  })

  it('rejects registration when not in REGISTRATION status', async () => {
    const toCaller = createCaller(toCtx)
    const t = await toCaller.tournament.create({
      name: 'Closed Registration',
      eventDate: 1700000000,
      format: '2000pts',
      totalRounds: 3,
    })
    // Still DRAFT
    const p1Caller = createCaller(p1Ctx)
    await expect(
      p1Caller.player.register({ tournamentId: t!.id, displayName: 'Bob', faction: 'Orks' }),
    ).rejects.toThrow()
  })
})

describe('tournament.delete', () => {
  it('deletes a DRAFT tournament', async () => {
    const toCaller = createCaller(toCtx)
    const t = await toCaller.tournament.create({
      name: 'Delete Me',
      eventDate: 1700000000,
      format: '2000pts',
      totalRounds: 3,
    })
    const result = await toCaller.tournament.delete(t!.id)
    expect(result.deleted).toBe(true)
  })

  it('cannot delete a non-DRAFT tournament', async () => {
    const toCaller = createCaller(toCtx)
    const t = await toCaller.tournament.create({
      name: 'Cannot Delete',
      eventDate: 1700000000,
      format: '2000pts',
      totalRounds: 3,
    })
    await toCaller.tournament.advanceStatus(t!.id) // REGISTRATION
    await expect(toCaller.tournament.delete(t!.id)).rejects.toThrow()
  })
})

describe('result.report + result.confirm', () => {
  it('reports and confirms a result', async () => {
    // Setup: tournament in IN_PROGRESS with a pairing
    const toCaller = createCaller(toCtx)
    const t = await toCaller.tournament.create({
      name: 'Result Test',
      eventDate: 1700000000,
      format: '2000pts',
      totalRounds: 3,
    })
    await toCaller.tournament.advanceStatus(t!.id) // REGISTRATION

    const p1Caller = createCaller(p1Ctx)
    const p2Caller = createCaller(p2Ctx)
    const tp1 = await p1Caller.player.register({
      tournamentId: t!.id,
      displayName: 'Bob',
      faction: 'Orks',
    })
    const tp2 = await p2Caller.player.register({
      tournamentId: t!.id,
      displayName: 'Carol',
      faction: 'Necrons',
    })

    // Advance to CHECK_IN, then IN_PROGRESS
    await toCaller.tournament.advanceStatus(t!.id) // CHECK_IN
    await toCaller.tournament.advanceStatus(t!.id) // IN_PROGRESS

    // Create round + manual pairing (bypass Swiss for simplicity)
    const round = await toCaller.round.create({ tournamentId: t!.id })

    // Insert a pairing manually
    await client.execute({
      sql: `INSERT INTO pairings (id, round_id, table_number, player1_id, player2_id, mission, confirmed, to_override, created_at)
            VALUES ('pair-1', ?, 1, ?, ?, 'Scorched Earth', 0, 0, ?)`,
      args: [round!.id, tp1!.id, tp2!.id, Date.now()],
    })

    // p1 reports
    const reported = await p1Caller.result.report({
      pairingId: 'pair-1',
      player1VP: 72,
      player2VP: 45,
    })
    expect(reported?.result).toBe('P1_WIN')
    expect(reported?.confirmed).toBe(0)

    // p2 confirms
    const confirmed = await p2Caller.result.confirm('pair-1')
    expect(confirmed.confirmed).toBe(true)
  })
})

describe('elo.get', () => {
  it('returns default rating 1200 for a player with no ELO record', async () => {
    const caller = createCaller(toCtx)
    const result = await caller.elo.get('to-1')
    expect(result.rating).toBe(1200)
    expect(result.gamesPlayed).toBe(0)
  })
})

describe('tournament export to new-meta on COMPLETE', () => {
  it('exports results to imported_tournament_results when advancing to COMPLETE', async () => {
    const toCaller = createCaller(toCtx)
    const t = await toCaller.tournament.create({
      name: 'Export Test GT',
      eventDate: 1700000000,
      format: '2000pts',
      totalRounds: 1,
    })
    // Advance through lifecycle
    await toCaller.tournament.advanceStatus(t!.id) // → REGISTRATION

    const p1Caller = createCaller(p1Ctx)
    const p2Caller = createCaller(p2Ctx)
    await p1Caller.player.register({ tournamentId: t!.id, displayName: 'Bob', faction: 'Orks' })
    await p2Caller.player.register({ tournamentId: t!.id, displayName: 'Carol', faction: 'Necrons' })

    await toCaller.tournament.advanceStatus(t!.id) // → CHECK_IN
    await toCaller.tournament.advanceStatus(t!.id) // → IN_PROGRESS

    // Create round and pairing with result
    const round = await toCaller.round.create({ tournamentId: t!.id })
    const players = await toCaller.player.list({ tournamentId: t!.id })
    const tp1 = players.find((p) => p.displayName === 'Bob')!
    const tp2 = players.find((p) => p.displayName === 'Carol')!

    await client.execute({
      sql: `INSERT INTO pairings (id, round_id, table_number, player1_id, player2_id, mission, player1_vp, player2_vp, result, confirmed, to_override, created_at)
            VALUES ('export-pair', ?, 1, ?, ?, 'Take and Hold', 85, 60, 'P1_WIN', 1, 0, ?)`,
      args: [round!.id, tp1.id, tp2.id, Date.now()],
    })

    // Advance to COMPLETE — should export
    await toCaller.tournament.advanceStatus(t!.id) // → COMPLETE

    // Verify export was written
    const rows = await client.execute({ sql: 'SELECT * FROM imported_tournament_results WHERE event_name = ?', args: ['Export Test GT'] })
    expect(rows.rows).toHaveLength(1)
    const row = rows.rows[0]!
    expect(row['format']).toBe('2000pts')
    const parsed = JSON.parse(row['parsed_data'] as string)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].players).toHaveLength(2)
    // Bob won, so should be first
    expect(parsed[0].players[0].playerName).toBe('Bob')
    expect(parsed[0].players[0].wins).toBe(1)
    expect(parsed[0].players[0].points).toBe(85)
    expect(parsed[0].players[1].playerName).toBe('Carol')
    expect(parsed[0].players[1].losses).toBe(1)
  })
})

describe('player.register with listId and detachment', () => {
  it('registers with detachment and listId', async () => {
    const toCaller = createCaller(toCtx)
    const t = await toCaller.tournament.create({
      name: 'List Integration Test',
      eventDate: 1700000000,
      format: '2000pts',
      totalRounds: 3,
    })
    await toCaller.tournament.advanceStatus(t!.id) // → REGISTRATION

    const p1Caller = createCaller(p1Ctx)
    const player = await p1Caller.player.register({
      tournamentId: t!.id,
      displayName: 'Bob',
      faction: 'Space Marines',
      detachment: 'Gladius Task Force',
      listId: 'list-123',
    })
    expect(player?.detachment).toBe('Gladius Task Force')
    expect(player?.listId).toBe('list-123')
  })
})

describe('tournament.standings', () => {
  it('returns standings with all players', async () => {
    const toCaller = createCaller(toCtx)
    const t = await toCaller.tournament.create({
      name: 'Standings Test',
      eventDate: 1700000000,
      format: '2000pts',
      totalRounds: 3,
    })
    await toCaller.tournament.advanceStatus(t!.id) // REGISTRATION

    const p1Caller = createCaller(p1Ctx)
    await p1Caller.player.register({
      tournamentId: t!.id,
      displayName: 'Bob',
      faction: 'Orks',
    })

    const standings = await toCaller.tournament.standings(t!.id)
    expect(standings.players).toHaveLength(1)
    expect(standings.players[0].wins).toBe(0)
  })
})

describe('tournament.search', () => {
  it('returns non-DRAFT tournaments', async () => {
    const toCaller = createCaller(toCtx)
    const t = await toCaller.tournament.create({
      name: 'Searchable GT',
      eventDate: 1700000000,
      location: 'Denver',
      format: '2000pts',
      totalRounds: 3,
    })
    await toCaller.tournament.advanceStatus(t!.id) // → REGISTRATION

    const results = await toCaller.tournament.search({})
    const found = results.find((r) => r.name === 'Searchable GT')
    expect(found).toBeDefined()
    expect(found!.playerCount).toBe(0)
  })

  it('filters by name query', async () => {
    const toCaller = createCaller(toCtx)
    const results = await toCaller.tournament.search({ query: 'Searchable' })
    expect(results.some((r) => r.name === 'Searchable GT')).toBe(true)
  })

  it('filters by location query', async () => {
    const toCaller = createCaller(toCtx)
    const results = await toCaller.tournament.search({ query: 'Denver' })
    expect(results.some((r) => r.name === 'Searchable GT')).toBe(true)
  })

  it('filters by status', async () => {
    const toCaller = createCaller(toCtx)
    const results = await toCaller.tournament.search({ status: 'COMPLETE' })
    // Should only return complete tournaments
    expect(results.every((r) => r.status === 'COMPLETE')).toBe(true)
  })
})

describe('player.myProfile', () => {
  it('returns profile with tournament history and W-L-D record', async () => {
    // Setup: create tournament, register player, play a match
    const toCaller = createCaller(toCtx)
    const t = await toCaller.tournament.create({
      name: 'Profile Test GT',
      eventDate: 1700000000,
      format: '2000pts',
      totalRounds: 1,
    })
    await toCaller.tournament.advanceStatus(t!.id) // → REGISTRATION

    const p1Caller = createCaller(p1Ctx)
    const p2Caller = createCaller(p2Ctx)
    const tp1 = await p1Caller.player.register({
      tournamentId: t!.id,
      displayName: 'Bob',
      faction: 'Orks',
    })
    await p2Caller.player.register({
      tournamentId: t!.id,
      displayName: 'Carol',
      faction: 'Necrons',
    })

    await toCaller.tournament.advanceStatus(t!.id) // CHECK_IN
    await toCaller.tournament.advanceStatus(t!.id) // IN_PROGRESS

    const round = await toCaller.round.create({ tournamentId: t!.id })
    const players = await toCaller.player.list({ tournamentId: t!.id })
    const dbTp1 = players.find((p) => p.displayName === 'Bob')!
    const dbTp2 = players.find((p) => p.displayName === 'Carol')!

    await client.execute({
      sql: `INSERT INTO pairings (id, round_id, table_number, player1_id, player2_id, mission, player1_vp, player2_vp, result, confirmed, to_override, created_at)
            VALUES ('profile-pair', ?, 1, ?, ?, 'Take and Hold', 80, 55, 'P1_WIN', 1, 0, ?)`,
      args: [round!.id, dbTp1.id, dbTp2.id, Date.now()],
    })

    // Bob's profile
    const profile = await p1Caller.player.myProfile()
    expect(profile.tournamentsPlayed).toBeGreaterThanOrEqual(1)
    expect(profile.wins).toBeGreaterThanOrEqual(1)
    expect(profile.totalVP).toBeGreaterThanOrEqual(80)
    expect(profile.tournaments.some((t) => t.name === 'Profile Test GT')).toBe(true)

    // Carol's profile
    const profile2 = await p2Caller.player.myProfile()
    expect(profile2.losses).toBeGreaterThanOrEqual(1)
  })

  it('returns empty profile for user with no tournaments', async () => {
    const freshCtx = { user: { id: 'to-1', email: 'alice@example.com', name: 'Alice' }, req, db }
    const caller = createCaller(freshCtx)
    const profile = await caller.player.myProfile()
    // Alice is a TO, check that the profile returns at minimum
    expect(profile.userId).toBe('to-1')
    expect(typeof profile.wins).toBe('number')
    expect(typeof profile.losses).toBe('number')
    expect(Array.isArray(profile.cards)).toBe(true)
    expect(Array.isArray(profile.bans)).toBe(true)
  })
})

describe('player.searchLists', () => {
  it('searches lists by faction', async () => {
    // Register a player with list text first
    const toCaller = createCaller(toCtx)
    const t = await toCaller.tournament.create({
      name: 'List Search Test',
      eventDate: 1700000000,
      format: '2000pts',
      totalRounds: 3,
    })
    await toCaller.tournament.advanceStatus(t!.id) // → REGISTRATION

    const p1Caller = createCaller(p1Ctx)
    await p1Caller.player.register({
      tournamentId: t!.id,
      displayName: 'Bob',
      faction: 'Death Guard',
      listText: 'Plague Marines x10\nBlightlord Terminators x5',
    })

    const results = await toCaller.player.searchLists({ faction: 'Death Guard' })
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results.some((r) => r.faction === 'Death Guard')).toBe(true)
    expect(results.some((r) => r.listText?.includes('Plague Marines'))).toBe(true)
  })

  it('returns empty for faction with no lists', async () => {
    const caller = createCaller(toCtx)
    const results = await caller.player.searchLists({ faction: 'Nonexistent Faction' })
    expect(results).toHaveLength(0)
  })
})

describe('player.searchPlayers', () => {
  it('searches players by name', async () => {
    const caller = createCaller(toCtx)
    const results = await caller.player.searchPlayers({ query: 'Bob' })
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results[0].displayName).toBe('Bob')
    expect(results[0].tournamentsPlayed).toBeGreaterThanOrEqual(1)
  })

  it('includes card counts', async () => {
    // Issue a card first
    const toCaller = createCaller(toCtx)
    const t = await toCaller.tournament.create({
      name: 'Card Search Test',
      eventDate: 1700000000,
      format: '2000pts',
      totalRounds: 3,
    })
    await toCaller.tournament.advanceStatus(t!.id) // → REGISTRATION

    const p1Caller = createCaller(p1Ctx)
    const tp = await p1Caller.player.register({
      tournamentId: t!.id,
      displayName: 'Bob',
      faction: 'Orks',
    })

    await toCaller.card.issue({
      tournamentId: t!.id,
      playerId: tp!.id,
      cardType: 'YELLOW',
      reason: 'Slow play',
    })

    const results = await toCaller.player.searchPlayers({ query: 'Bob' })
    const bob = results.find((r) => r.displayName === 'Bob')
    expect(bob).toBeDefined()
    expect(bob!.yellowCards).toBeGreaterThanOrEqual(1)
  })
})

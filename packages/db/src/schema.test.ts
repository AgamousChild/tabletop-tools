import { createClient } from '@libsql/client'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  authUsers,
  diceRollingSessions,
  diceSets,
  eloHistory,
  glickoHistory,
  importedTournamentResults,
  listUnits,
  lists,
  matches,
  pairings,
  playerElo,
  playerGlicko,
  rolls,
  rounds,
  tournamentPlayers,
  tournaments,
  turns,
  unitRatings,
} from './schema'

const client = createClient({ url: ':memory:' })
const db = drizzle(client)

afterAll(() => {
  client.close()
})

beforeAll(async () => {
  // Auth tables (Better Auth managed)
  await client.execute(`CREATE TABLE "user" (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    email_verified INTEGER NOT NULL DEFAULT 0,
    image TEXT,
    username TEXT UNIQUE,
    display_username TEXT UNIQUE,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`)

  await client.execute(`CREATE TABLE "session" (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user"(id),
    token TEXT UNIQUE NOT NULL,
    expires_at INTEGER NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`)

  await client.execute(`CREATE TABLE "account" (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user"(id),
    account_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    access_token_expires_at INTEGER,
    refresh_token_expires_at INTEGER,
    scope TEXT,
    password TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`)

  await client.execute(`CREATE TABLE "verification" (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER,
    updated_at INTEGER
  )`)

  // NoCheat tables
  await client.execute(`CREATE TABLE dice_sets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user"(id),
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`)

  await client.execute(`CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user"(id),
    dice_set_id TEXT NOT NULL REFERENCES dice_sets(id),
    opponent_name TEXT,
    z_score REAL,
    is_loaded INTEGER,
    photo_url TEXT,
    created_at INTEGER NOT NULL,
    closed_at INTEGER
  )`)

  await client.execute(`CREATE TABLE rolls (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    pip_values TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`)

  // List Builder tables
  await client.execute(`CREATE TABLE lists (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user"(id),
    faction TEXT NOT NULL,
    name TEXT NOT NULL,
    total_pts INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`)

  await client.execute(`CREATE TABLE list_units (
    id TEXT PRIMARY KEY,
    list_id TEXT NOT NULL REFERENCES lists(id),
    unit_content_id TEXT NOT NULL,
    unit_name TEXT NOT NULL,
    unit_points INTEGER NOT NULL,
    count INTEGER NOT NULL DEFAULT 1
  )`)

  await client.execute(`CREATE TABLE unit_ratings (
    id TEXT PRIMARY KEY,
    unit_content_id TEXT NOT NULL,
    rating TEXT NOT NULL,
    win_contrib REAL NOT NULL,
    pts_eff REAL NOT NULL,
    meta_window TEXT NOT NULL,
    computed_at INTEGER NOT NULL
  )`)

  // Game Tracker tables
  await client.execute(`CREATE TABLE matches (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user"(id),
    list_id TEXT,
    opponent_faction TEXT NOT NULL,
    mission TEXT NOT NULL,
    result TEXT,
    your_final_score INTEGER,
    their_final_score INTEGER,
    is_tournament INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    closed_at INTEGER
  )`)

  await client.execute(`CREATE TABLE turns (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL REFERENCES matches(id),
    turn_number INTEGER NOT NULL,
    photo_url TEXT,
    your_units_lost TEXT NOT NULL DEFAULT '[]',
    their_units_lost TEXT NOT NULL DEFAULT '[]',
    primary_scored INTEGER NOT NULL DEFAULT 0,
    secondary_scored INTEGER NOT NULL DEFAULT 0,
    cp_spent INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at INTEGER NOT NULL
  )`)

  // Tournament tables
  await client.execute(`CREATE TABLE tournaments (
    id TEXT PRIMARY KEY,
    to_user_id TEXT NOT NULL REFERENCES "user"(id),
    name TEXT NOT NULL,
    event_date INTEGER NOT NULL,
    location TEXT,
    format TEXT NOT NULL,
    total_rounds INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    created_at INTEGER NOT NULL
  )`)

  await client.execute(`CREATE TABLE tournament_players (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES tournaments(id),
    user_id TEXT NOT NULL REFERENCES "user"(id),
    display_name TEXT NOT NULL,
    faction TEXT NOT NULL,
    detachment TEXT,
    list_text TEXT,
    list_locked INTEGER NOT NULL DEFAULT 0,
    checked_in INTEGER NOT NULL DEFAULT 0,
    dropped INTEGER NOT NULL DEFAULT 0,
    registered_at INTEGER NOT NULL
  )`)

  await client.execute(`CREATE TABLE rounds (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES tournaments(id),
    round_number INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    created_at INTEGER NOT NULL
  )`)

  await client.execute(`CREATE TABLE pairings (
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
  )`)

  // ELO tables
  await client.execute(`CREATE TABLE player_elo (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE REFERENCES "user"(id),
    rating INTEGER NOT NULL DEFAULT 1200,
    games_played INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  )`)

  await client.execute(`CREATE TABLE elo_history (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user"(id),
    pairing_id TEXT NOT NULL REFERENCES pairings(id),
    rating_before INTEGER NOT NULL,
    rating_after INTEGER NOT NULL,
    delta INTEGER NOT NULL,
    opponent_id TEXT NOT NULL REFERENCES "user"(id),
    recorded_at INTEGER NOT NULL
  )`)

  // Imported tournament results
  await client.execute(`CREATE TABLE imported_tournament_results (
    id TEXT PRIMARY KEY,
    imported_by TEXT NOT NULL REFERENCES "user"(id),
    event_name TEXT NOT NULL,
    event_date INTEGER NOT NULL,
    format TEXT NOT NULL,
    meta_window TEXT NOT NULL,
    raw_data TEXT NOT NULL,
    parsed_data TEXT NOT NULL,
    imported_at INTEGER NOT NULL
  )`)

  // Glicko-2 tables
  await client.execute(`CREATE TABLE player_glicko (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES "user"(id),
    player_name TEXT NOT NULL,
    rating REAL NOT NULL DEFAULT 1500,
    rating_deviation REAL NOT NULL DEFAULT 350,
    volatility REAL NOT NULL DEFAULT 0.06,
    games_played INTEGER NOT NULL DEFAULT 0,
    last_rating_period TEXT,
    updated_at INTEGER NOT NULL
  )`)

  await client.execute(`CREATE TABLE glicko_history (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL REFERENCES player_glicko(id),
    rating_period TEXT NOT NULL,
    rating_before REAL NOT NULL,
    rd_before REAL NOT NULL,
    rating_after REAL NOT NULL,
    rd_after REAL NOT NULL,
    volatility_after REAL NOT NULL,
    delta REAL NOT NULL,
    games_in_period INTEGER NOT NULL,
    recorded_at INTEGER NOT NULL
  )`)

  // Seed shared users for FK tests
  await db.insert(authUsers).values({
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  await db.insert(authUsers).values({
    id: 'user-2',
    name: 'Opponent User',
    email: 'opponent@example.com',
    createdAt: new Date(),
    updatedAt: new Date(),
  })
})

// ============================================================
// Existing tests
// ============================================================

describe('authUsers', () => {
  it('inserts and retrieves a user', async () => {
    const result = await db.select().from(authUsers).where(eq(authUsers.id, 'user-1'))
    expect(result).toHaveLength(1)
    expect(result[0]?.email).toBe('test@example.com')
  })

  it('enforces unique email constraint', async () => {
    await expect(
      db.insert(authUsers).values({
        id: 'user-2-dupe',
        name: 'Dupe',
        email: 'test@example.com', // duplicate
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ).rejects.toThrow()
  })
})

describe('diceSets', () => {
  it('inserts and retrieves a dice set', async () => {
    await db.insert(diceSets).values({
      id: 'set-1',
      userId: 'user-1',
      name: 'Red Dice',
      createdAt: Date.now(),
    })

    const result = await db.select().from(diceSets).where(eq(diceSets.id, 'set-1'))
    expect(result).toHaveLength(1)
    expect(result[0]?.name).toBe('Red Dice')
    expect(result[0]?.userId).toBe('user-1')
  })
})

describe('diceRollingSessions', () => {
  it('inserts an open session with null verdict fields', async () => {
    await db.insert(diceRollingSessions).values({
      id: 'sess-1',
      userId: 'user-1',
      diceSetId: 'set-1',
      opponentName: 'Bob',
      createdAt: Date.now(),
    })

    const result = await db
      .select()
      .from(diceRollingSessions)
      .where(eq(diceRollingSessions.id, 'sess-1'))
    expect(result).toHaveLength(1)
    expect(result[0]?.closedAt).toBeNull()
    expect(result[0]?.isLoaded).toBeNull()
    expect(result[0]?.zScore).toBeNull()
  })

  it('closes a session with a verdict', async () => {
    const closedAt = Date.now()
    await db
      .update(diceRollingSessions)
      .set({ zScore: 2.84, isLoaded: 1, closedAt })
      .where(eq(diceRollingSessions.id, 'sess-1'))

    const result = await db
      .select()
      .from(diceRollingSessions)
      .where(eq(diceRollingSessions.id, 'sess-1'))
    expect(result[0]?.isLoaded).toBe(1)
    expect(result[0]?.zScore).toBeCloseTo(2.84)
    expect(result[0]?.closedAt).toBe(closedAt)
  })
})

describe('rolls', () => {
  it('inserts a roll and retrieves pip values', async () => {
    const pipValues = [3, 5, 2, 6, 1, 4]

    await db.insert(rolls).values({
      id: 'roll-1',
      sessionId: 'sess-1',
      pipValues: JSON.stringify(pipValues),
      createdAt: Date.now(),
    })

    const result = await db.select().from(rolls).where(eq(rolls.sessionId, 'sess-1'))
    expect(result).toHaveLength(1)
    expect(JSON.parse(result[0]?.pipValues ?? '[]')).toEqual(pipValues)
  })

  it('deletes a roll', async () => {
    await db.delete(rolls).where(eq(rolls.id, 'roll-1'))

    const result = await db.select().from(rolls).where(eq(rolls.id, 'roll-1'))
    expect(result).toHaveLength(0)
  })
})

// ============================================================
// List Builder table tests
// ============================================================

describe('lists', () => {
  it('inserts and retrieves a list', async () => {
    await db.insert(lists).values({
      id: 'list-1',
      userId: 'user-1',
      faction: 'Test Faction',
      name: 'My GT List',
      totalPts: 2000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    const result = await db.select().from(lists).where(eq(lists.id, 'list-1'))
    expect(result).toHaveLength(1)
    expect(result[0]?.name).toBe('My GT List')
    expect(result[0]?.faction).toBe('Test Faction')
    expect(result[0]?.totalPts).toBe(2000)
  })
})

describe('listUnits', () => {
  it('inserts a list unit with denormalized name and points', async () => {
    await db.insert(listUnits).values({
      id: 'lu-1',
      listId: 'list-1',
      unitContentId: 'bsdata-unit-abc123',
      unitName: 'Iron Warrior',
      unitPoints: 75,
      count: 1,
    })

    const result = await db.select().from(listUnits).where(eq(listUnits.listId, 'list-1'))
    expect(result).toHaveLength(1)
    expect(result[0]?.unitContentId).toBe('bsdata-unit-abc123')
    expect(result[0]?.unitName).toBe('Iron Warrior')
    expect(result[0]?.unitPoints).toBe(75)
  })

  it('unit_content_id has no FK constraint (game content boundary)', async () => {
    // Should insert without error — no FK to validate against
    await expect(
      db.insert(listUnits).values({
        id: 'lu-2',
        listId: 'list-1',
        unitContentId: 'nonexistent-content-id',
        unitName: 'Phantom Unit',
        unitPoints: 100,
        count: 1,
      }),
    ).resolves.not.toThrow()
  })
})

describe('unitRatings', () => {
  it('inserts a unit rating', async () => {
    await db.insert(unitRatings).values({
      id: 'rating-1',
      unitContentId: 'bsdata-unit-abc123',
      rating: 'A',
      winContrib: 0.62,
      ptsEff: 1.4,
      metaWindow: '2025-Q2',
      computedAt: Date.now(),
    })

    const result = await db
      .select()
      .from(unitRatings)
      .where(eq(unitRatings.unitContentId, 'bsdata-unit-abc123'))
    expect(result).toHaveLength(1)
    expect(result[0]?.rating).toBe('A')
    expect(result[0]?.metaWindow).toBe('2025-Q2')
  })
})

// ============================================================
// Game Tracker table tests
// ============================================================

describe('matches', () => {
  it('inserts an open match', async () => {
    await db.insert(matches).values({
      id: 'match-1',
      userId: 'user-1',
      opponentFaction: 'Test Opponent Faction',
      mission: 'Test Mission Alpha',
      createdAt: Date.now(),
    })

    const result = await db.select().from(matches).where(eq(matches.id, 'match-1'))
    expect(result).toHaveLength(1)
    expect(result[0]?.result).toBeNull()
    expect(result[0]?.closedAt).toBeNull()
    expect(result[0]?.isTournament).toBe(0)
  })

  it('opponent_faction stored as plain string (no FK)', async () => {
    // opponentFaction can be any string — no FK to validate
    await expect(
      db.insert(matches).values({
        id: 'match-2',
        userId: 'user-1',
        opponentFaction: 'Totally Made Up Faction Name',
        mission: 'Any Mission',
        createdAt: Date.now(),
      }),
    ).resolves.not.toThrow()
  })

  it('closes a match with a result', async () => {
    const closedAt = Date.now()
    await db
      .update(matches)
      .set({ result: 'WIN', yourFinalScore: 85, theirFinalScore: 62, closedAt })
      .where(eq(matches.id, 'match-1'))

    const result = await db.select().from(matches).where(eq(matches.id, 'match-1'))
    expect(result[0]?.result).toBe('WIN')
    expect(result[0]?.yourFinalScore).toBe(85)
    expect(result[0]?.closedAt).toBe(closedAt)
  })
})

describe('turns', () => {
  it('inserts a turn with JSON unit loss arrays', async () => {
    const yourUnitsLost = [{ contentId: 'unit-x', name: 'Iron Warrior' }]
    const theirUnitsLost = [{ contentId: 'unit-y', name: 'Null Titan' }]

    await db.insert(turns).values({
      id: 'turn-1',
      matchId: 'match-1',
      turnNumber: 1,
      yourUnitsLost: JSON.stringify(yourUnitsLost),
      theirUnitsLost: JSON.stringify(theirUnitsLost),
      primaryScored: 4,
      secondaryScored: 3,
      cpSpent: 2,
      createdAt: Date.now(),
    })

    const result = await db.select().from(turns).where(eq(turns.matchId, 'match-1'))
    expect(result).toHaveLength(1)
    expect(JSON.parse(result[0]?.yourUnitsLost ?? '[]')).toEqual(yourUnitsLost)
    expect(result[0]?.primaryScored).toBe(4)
    expect(result[0]?.cpSpent).toBe(2)
  })
})

// ============================================================
// Tournament table tests
// ============================================================

describe('tournaments', () => {
  it('inserts a tournament in DRAFT status', async () => {
    await db.insert(tournaments).values({
      id: 'tourn-1',
      toUserId: 'user-1',
      name: 'Test GT 2025',
      eventDate: Date.now(),
      format: '2000pts Matched Play',
      totalRounds: 5,
      createdAt: Date.now(),
    })

    const result = await db.select().from(tournaments).where(eq(tournaments.id, 'tourn-1'))
    expect(result).toHaveLength(1)
    expect(result[0]?.status).toBe('DRAFT')
    expect(result[0]?.totalRounds).toBe(5)
  })
})

describe('tournamentPlayers', () => {
  it('registers a player with faction as plain string', async () => {
    await db.insert(tournamentPlayers).values({
      id: 'tp-1',
      tournamentId: 'tourn-1',
      userId: 'user-1',
      displayName: 'Alice',
      faction: 'Test Faction',
      listLocked: 0,
      checkedIn: 0,
      dropped: 0,
      registeredAt: Date.now(),
    })

    const result = await db
      .select()
      .from(tournamentPlayers)
      .where(eq(tournamentPlayers.id, 'tp-1'))
    expect(result).toHaveLength(1)
    expect(result[0]?.faction).toBe('Test Faction')
    expect(result[0]?.listLocked).toBe(0)
  })

  it('registers a second player for pairing tests', async () => {
    await db.insert(tournamentPlayers).values({
      id: 'tp-2',
      tournamentId: 'tourn-1',
      userId: 'user-2',
      displayName: 'Bob',
      faction: 'Another Faction',
      listLocked: 0,
      checkedIn: 0,
      dropped: 0,
      registeredAt: Date.now(),
    })

    const result = await db
      .select()
      .from(tournamentPlayers)
      .where(eq(tournamentPlayers.tournamentId, 'tourn-1'))
    expect(result).toHaveLength(2)
  })
})

describe('rounds and pairings', () => {
  it('creates a round and a pairing', async () => {
    await db.insert(rounds).values({
      id: 'round-1',
      tournamentId: 'tourn-1',
      roundNumber: 1,
      status: 'ACTIVE',
      createdAt: Date.now(),
    })

    await db.insert(pairings).values({
      id: 'pairing-1',
      roundId: 'round-1',
      tableNumber: 1,
      player1Id: 'tp-1',
      player2Id: 'tp-2',
      mission: 'Sweeping Engagement',
      createdAt: Date.now(),
    })

    const result = await db.select().from(pairings).where(eq(pairings.roundId, 'round-1'))
    expect(result).toHaveLength(1)
    expect(result[0]?.confirmed).toBe(0)
    expect(result[0]?.player1Vp).toBeNull()
  })

  it('records a result on a pairing', async () => {
    await db
      .update(pairings)
      .set({ player1Vp: 72, player2Vp: 45, result: 'P1_WIN', confirmed: 1 })
      .where(eq(pairings.id, 'pairing-1'))

    const result = await db.select().from(pairings).where(eq(pairings.id, 'pairing-1'))
    expect(result[0]?.result).toBe('P1_WIN')
    expect(result[0]?.confirmed).toBe(1)
  })

  it('supports bye pairings (player2_id is null)', async () => {
    await db.insert(pairings).values({
      id: 'pairing-bye',
      roundId: 'round-1',
      tableNumber: 99,
      player1Id: 'tp-1',
      player2Id: null,
      mission: 'BYE',
      result: 'BYE',
      createdAt: Date.now(),
    })

    const result = await db
      .select()
      .from(pairings)
      .where(eq(pairings.id, 'pairing-bye'))
    expect(result[0]?.player2Id).toBeNull()
    expect(result[0]?.result).toBe('BYE')
  })
})

// ============================================================
// ELO table tests
// ============================================================

describe('playerElo', () => {
  it('creates a player ELO record at default 1200', async () => {
    await db.insert(playerElo).values({
      id: 'elo-1',
      userId: 'user-1',
      updatedAt: Date.now(),
    })

    const result = await db.select().from(playerElo).where(eq(playerElo.userId, 'user-1'))
    expect(result).toHaveLength(1)
    expect(result[0]?.rating).toBe(1200)
    expect(result[0]?.gamesPlayed).toBe(0)
  })

  it('updates rating after a game', async () => {
    await db
      .update(playerElo)
      .set({ rating: 1216, gamesPlayed: 1, updatedAt: Date.now() })
      .where(eq(playerElo.userId, 'user-1'))

    const result = await db.select().from(playerElo).where(eq(playerElo.userId, 'user-1'))
    expect(result[0]?.rating).toBe(1216)
    expect(result[0]?.gamesPlayed).toBe(1)
  })

  it('enforces unique user_id per ELO record', async () => {
    await expect(
      db.insert(playerElo).values({
        id: 'elo-1-dupe',
        userId: 'user-1',  // already exists
        updatedAt: Date.now(),
      }),
    ).rejects.toThrow()
  })
})

describe('eloHistory', () => {
  it('records an ELO change with full audit fields', async () => {
    // Need user-2 ELO record first
    await db.insert(playerElo).values({
      id: 'elo-2',
      userId: 'user-2',
      updatedAt: Date.now(),
    })

    await db.insert(eloHistory).values({
      id: 'elo-hist-1',
      userId: 'user-1',
      pairingId: 'pairing-1',
      ratingBefore: 1200,
      ratingAfter: 1216,
      delta: 16,
      opponentId: 'user-2',
      recordedAt: Date.now(),
    })

    const result = await db
      .select()
      .from(eloHistory)
      .where(eq(eloHistory.userId, 'user-1'))
    expect(result).toHaveLength(1)
    expect(result[0]?.delta).toBe(16)
    expect(result[0]?.ratingBefore).toBe(1200)
    expect(result[0]?.ratingAfter).toBe(1216)
  })
})

// ============================================================
// Imported tournament results tests
// ============================================================

describe('importedTournamentResults', () => {
  it('inserts an import record with raw and parsed data', async () => {
    const rawCsv = 'Place,Faction,W,L,D,Points\n1,Alpha,3,0,0,60\n'
    const parsedJson = JSON.stringify([
      {
        eventName: 'Test Import GT',
        eventDate: '2025-06-14',
        format: 'GT',
        players: [{ placement: 1, faction: 'Alpha', wins: 3, losses: 0, draws: 0, points: 60 }],
      },
    ])

    await db.insert(importedTournamentResults).values({
      id: 'import-1',
      importedBy: 'user-1',
      eventName: 'Test Import GT',
      eventDate: Date.now(),
      format: 'GT',
      metaWindow: '2025-Q2',
      rawData: rawCsv,
      parsedData: parsedJson,
      importedAt: Date.now(),
    })

    const result = await db
      .select()
      .from(importedTournamentResults)
      .where(eq(importedTournamentResults.id, 'import-1'))
    expect(result).toHaveLength(1)
    expect(result[0]?.eventName).toBe('Test Import GT')
    expect(result[0]?.metaWindow).toBe('2025-Q2')

    const parsed = JSON.parse(result[0]?.parsedData ?? '[]')
    expect(parsed[0].players[0].faction).toBe('Alpha')
  })
})

// ============================================================
// tournamentPlayers detachment column
// ============================================================

describe('tournamentPlayers detachment', () => {
  it('stores detachment as nullable string', async () => {
    await db.insert(tournamentPlayers).values({
      id: 'tp-det-1',
      tournamentId: 'tourn-1',
      userId: 'user-1',
      displayName: 'Alice',
      faction: 'Space Marines',
      detachment: 'Gladius Task Force',
      listLocked: 0,
      checkedIn: 0,
      dropped: 0,
      registeredAt: Date.now(),
    })

    const result = await db
      .select()
      .from(tournamentPlayers)
      .where(eq(tournamentPlayers.id, 'tp-det-1'))
    expect(result).toHaveLength(1)
    expect(result[0]?.detachment).toBe('Gladius Task Force')
  })

  it('detachment is null when not provided', async () => {
    await db.insert(tournamentPlayers).values({
      id: 'tp-det-2',
      tournamentId: 'tourn-1',
      userId: 'user-2',
      displayName: 'Bob',
      faction: 'Orks',
      listLocked: 0,
      checkedIn: 0,
      dropped: 0,
      registeredAt: Date.now(),
    })

    const result = await db
      .select()
      .from(tournamentPlayers)
      .where(eq(tournamentPlayers.id, 'tp-det-2'))
    expect(result[0]?.detachment).toBeNull()
  })
})

// ============================================================
// Glicko-2 table tests
// ============================================================

describe('playerGlicko', () => {
  it('creates a Glicko-2 entry at default values', async () => {
    await db.insert(playerGlicko).values({
      id: 'glicko-1',
      playerName: 'Alice',
      updatedAt: Date.now(),
    })

    const result = await db.select().from(playerGlicko).where(eq(playerGlicko.id, 'glicko-1'))
    expect(result).toHaveLength(1)
    expect(result[0]?.rating).toBe(1500)
    expect(result[0]?.ratingDeviation).toBe(350)
    expect(result[0]?.volatility).toBeCloseTo(0.06)
    expect(result[0]?.gamesPlayed).toBe(0)
    expect(result[0]?.userId).toBeNull()
  })

  it('links to a platform account when userId is provided', async () => {
    await db.insert(playerGlicko).values({
      id: 'glicko-2',
      userId: 'user-1',
      playerName: 'Test User',
      updatedAt: Date.now(),
    })

    const result = await db.select().from(playerGlicko).where(eq(playerGlicko.id, 'glicko-2'))
    expect(result[0]?.userId).toBe('user-1')
    expect(result[0]?.playerName).toBe('Test User')
  })

  it('updates rating after a period', async () => {
    await db
      .update(playerGlicko)
      .set({ rating: 1687, ratingDeviation: 94, gamesPlayed: 5, updatedAt: Date.now() })
      .where(eq(playerGlicko.id, 'glicko-1'))

    const result = await db.select().from(playerGlicko).where(eq(playerGlicko.id, 'glicko-1'))
    expect(result[0]?.rating).toBeCloseTo(1687)
    expect(result[0]?.ratingDeviation).toBeCloseTo(94)
    expect(result[0]?.gamesPlayed).toBe(5)
  })
})

describe('glickoHistory', () => {
  it('records a rating period update', async () => {
    await db.insert(glickoHistory).values({
      id: 'gh-1',
      playerId: 'glicko-1',
      ratingPeriod: 'import-1',
      ratingBefore: 1500,
      rdBefore: 350,
      ratingAfter: 1687,
      rdAfter: 94,
      volatilityAfter: 0.06,
      delta: 187,
      gamesInPeriod: 5,
      recordedAt: Date.now(),
    })

    const result = await db
      .select()
      .from(glickoHistory)
      .where(eq(glickoHistory.playerId, 'glicko-1'))
    expect(result).toHaveLength(1)
    expect(result[0]?.ratingPeriod).toBe('import-1')
    expect(result[0]?.delta).toBeCloseTo(187)
    expect(result[0]?.gamesInPeriod).toBe(5)
  })
})

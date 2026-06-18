import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createNullR2Storage } from '../lib/storage/r2'
import { createCallerFactory } from '../trpc'
import { appRouter } from './index'

const client = createClient({ url: ':memory:' })
const db = createDbFromClient(client)
const storage = createNullR2Storage()

const USER_ID = 'user-v2-1'
const USER2_ID = 'user-v2-2'

beforeAll(async () => {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS "user" (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
      email_verified INTEGER NOT NULL DEFAULT 0, image TEXT, username TEXT UNIQUE,
      display_username TEXT UNIQUE, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS content_entity (
      id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL,
      faction_id TEXT, parent_id TEXT, dataslate_id TEXT, r2_key TEXT,
      wahapedia_id TEXT, bsdata_id TEXT, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scoring_mission (
      id TEXT PRIMARY KEY REFERENCES content_entity(id) ON DELETE CASCADE,
      name TEXT NOT NULL, kind TEXT NOT NULL, side TEXT NOT NULL DEFAULT 'symmetric',
      cap INTEGER, ui_pattern TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS game_state (
      id TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE, label TEXT NOT NULL, category TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS deployment (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, zone_overlay TEXT
    );
    CREATE TABLE IF NOT EXISTS terrain_layout (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, source TEXT, terrain_overlay TEXT
    );
    CREATE TABLE IF NOT EXISTS mission_card (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, primary_objective_id TEXT, deployment_id TEXT, mission_rule TEXT
    );
    CREATE TABLE IF NOT EXISTS list (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT,
      author TEXT, edition TEXT NOT NULL DEFAULT '11th', faction_id TEXT, subfaction_id TEXT,
      detachment_id TEXT, battle_size TEXT NOT NULL DEFAULT 'unknown',
      total_points INTEGER NOT NULL DEFAULT 0, dataslate_id TEXT,
      source TEXT NOT NULL DEFAULT 'list-builder', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS list_unit (
      id TEXT PRIMARY KEY, list_id TEXT NOT NULL REFERENCES list(id) ON DELETE CASCADE,
      datasheet_id TEXT, enhancement_id TEXT, is_warlord INTEGER NOT NULL DEFAULT 0,
      points INTEGER NOT NULL DEFAULT 0, attached_to_unit_id TEXT, attach_role TEXT
    );
    CREATE TABLE IF NOT EXISTS match_v2 (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'setup', deployment_id TEXT, terrain_layout_id TEXT,
      mission_rule TEXT, mission_card_id TEXT, conclusion TEXT, result TEXT,
      date INTEGER, location TEXT, tournament_id TEXT, pairing_id TEXT,
      require_photos INTEGER NOT NULL DEFAULT 0, paint_scoring INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL, closed_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS match_player (
      id TEXT PRIMARY KEY, match_id TEXT NOT NULL REFERENCES match_v2(id) ON DELETE CASCADE,
      seat TEXT NOT NULL, is_you INTEGER NOT NULL DEFAULT 0, list_id TEXT,
      faction TEXT, detachment TEXT, primary_objective_id TEXT,
      secondary_mode TEXT NOT NULL DEFAULT 'tactical',
      is_attacker INTEGER, goes_first INTEGER,
      battle_ready INTEGER NOT NULL DEFAULT 1, paint_score INTEGER NOT NULL DEFAULT 10,
      final_primary_vp INTEGER, final_secondary_vp INTEGER
    );
    CREATE TABLE IF NOT EXISTS match_player_primary_option (
      id TEXT PRIMARY KEY, match_player_id TEXT NOT NULL REFERENCES match_player(id) ON DELETE CASCADE,
      primary_objective_id TEXT NOT NULL REFERENCES scoring_mission(id)
    );
    CREATE TABLE IF NOT EXISTS battle_round (
      id TEXT PRIMARY KEY, match_id TEXT NOT NULL REFERENCES match_v2(id) ON DELETE CASCADE,
      round_number INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS round_player (
      id TEXT PRIMARY KEY,
      round_id TEXT NOT NULL REFERENCES battle_round(id) ON DELETE CASCADE,
      match_player_id TEXT NOT NULL REFERENCES match_player(id) ON DELETE CASCADE,
      cp_gained INTEGER NOT NULL DEFAULT 0, cp_spent INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS score_event (
      id TEXT PRIMARY KEY,
      round_player_id TEXT NOT NULL REFERENCES round_player(id) ON DELETE CASCADE,
      scoring_mission_id TEXT NOT NULL REFERENCES scoring_mission(id),
      vp INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS game_state_event (
      id TEXT PRIMARY KEY,
      round_player_id TEXT NOT NULL REFERENCES round_player(id) ON DELETE CASCADE,
      game_state_id TEXT NOT NULL REFERENCES game_state(id),
      score_event_id TEXT, count INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS match_secondary_v2 (
      id TEXT PRIMARY KEY,
      match_player_id TEXT NOT NULL REFERENCES match_player(id) ON DELETE CASCADE,
      scoring_mission_id TEXT NOT NULL REFERENCES scoring_mission(id),
      mode TEXT NOT NULL DEFAULT 'tactical', drawn_round INTEGER,
      status TEXT NOT NULL DEFAULT 'active', discard_timing TEXT
    );
    CREATE TABLE IF NOT EXISTS unit_casualty (
      id TEXT PRIMARY KEY,
      round_player_id TEXT NOT NULL REFERENCES round_player(id) ON DELETE CASCADE,
      list_unit_id TEXT, kind TEXT NOT NULL, destroyed_by_unit_id TEXT
    );
    CREATE TABLE IF NOT EXISTS stratagem_use (
      id TEXT PRIMARY KEY,
      round_id TEXT NOT NULL REFERENCES battle_round(id) ON DELETE CASCADE,
      used_by_id TEXT NOT NULL REFERENCES match_player(id),
      active_side_id TEXT NOT NULL REFERENCES match_player(id),
      stratagem_name TEXT NOT NULL, cp_cost INTEGER NOT NULL DEFAULT 1, phase TEXT
    );
    CREATE TABLE IF NOT EXISTS unit_state (
      id TEXT PRIMARY KEY,
      match_player_id TEXT NOT NULL REFERENCES match_player(id) ON DELETE CASCADE,
      list_unit_id TEXT, state_key TEXT NOT NULL, value TEXT,
      active INTEGER NOT NULL DEFAULT 1, since_round INTEGER NOT NULL, cleared_round INTEGER
    );
    INSERT INTO "user" VALUES ('${USER_ID}','Alice','alice@v2.com',0,NULL,NULL,NULL,0,0);
    INSERT INTO "user" VALUES ('${USER2_ID}','Bob','bob@v2.com',0,NULL,NULL,NULL,0,0);
    INSERT INTO content_entity VALUES ('m-primary','mission','Purge the Foe',NULL,NULL,NULL,NULL,NULL,NULL,0);
    INSERT INTO content_entity VALUES ('m-secondary','mission','Engage on All Fronts',NULL,NULL,NULL,NULL,NULL,NULL,0);
    INSERT INTO scoring_mission VALUES ('m-primary','Purge the Foe','primary','symmetric',50,'checklist');
    INSERT INTO scoring_mission VALUES ('m-secondary','Engage on All Fronts','secondary','symmetric',15,'tier');
    INSERT INTO game_state VALUES ('gs-1','destroyed_enemy','Destroyed >=1 enemy unit','unit_destroyed');
  `)
})

afterAll(() => client.close())

const createCaller = createCallerFactory(appRouter)
const req = new Request('http://localhost')
const ctx = { user: { id: USER_ID, email: 'alice@v2.com', name: 'Alice' }, req, db, storage }
const unauthCtx = { user: null, req, db, storage }

describe('matchV2.start', () => {
  it('creates a match with two match_player rows', async () => {
    const caller = createCaller(ctx)
    const result = await caller.matchV2.start({
      opponentFaction: 'Orks',
      yourFaction: 'Space Marines',
    })
    expect(result.matchId).toBeTruthy()
    expect(result.yourPlayerId).toBeTruthy()
    expect(result.opponentPlayerId).toBeTruthy()
  })

  it('stores list linkage when listId provided', async () => {
    const caller = createCaller(ctx)
    const result = await caller.matchV2.start({
      opponentFaction: 'Necrons',
      yourFaction: 'Tau',
      listId: 'list-x',
    })
    expect(result.matchId).toBeTruthy()
  })

  it('rejects unauthenticated callers', async () => {
    const caller = createCaller(unauthCtx)
    await expect(caller.matchV2.start({ opponentFaction: 'Orks' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
  })
})

describe('matchV2.get', () => {
  it('returns match with players', async () => {
    const caller = createCaller(ctx)
    const { matchId } = await caller.matchV2.start({ opponentFaction: 'Tau' })
    const fetched = await caller.matchV2.get({ matchId })
    expect(fetched.match.id).toBe(matchId)
    expect(fetched.players).toHaveLength(2)
  })

  it('throws NOT_FOUND for unknown match', async () => {
    const caller = createCaller(ctx)
    await expect(caller.matchV2.get({ matchId: 'xxx' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})

describe('matchV2.addRound', () => {
  it('creates a battle_round with two round_player rows', async () => {
    const caller = createCaller(ctx)
    const { matchId } = await caller.matchV2.start({ opponentFaction: 'Eldar' })
    const round = await caller.matchV2.addRound({ matchId, roundNumber: 1 })
    expect(round.roundId).toBeTruthy()
    expect(round.p1RoundPlayerId).toBeTruthy()
    expect(round.p2RoundPlayerId).toBeTruthy()
  })
})

describe('matchV2.scoreRound', () => {
  it('records a score_event', async () => {
    const caller = createCaller(ctx)
    const { matchId } = await caller.matchV2.start({ opponentFaction: 'Chaos' })
    const { p1RoundPlayerId } = await caller.matchV2.addRound({ matchId, roundNumber: 1 })

    await caller.matchV2.scoreRound({
      roundPlayerId: p1RoundPlayerId,
      scoringMissionId: 'm-primary',
      vp: 8,
    })

    const fetched = await caller.matchV2.get({ matchId })
    const scoreEvents = fetched.scoreEvents
    expect(scoreEvents.length).toBeGreaterThan(0)
    expect(scoreEvents[0]!.vp).toBe(8)
  })
})

describe('matchV2.close', () => {
  it('sets result on the match', async () => {
    const caller = createCaller(ctx)
    const { matchId } = await caller.matchV2.start({ opponentFaction: 'Tyranids' })
    const closed = await caller.matchV2.close({
      matchId,
      result: 'P1_WIN',
      conclusion: 'played_to_end',
    })
    expect(closed.result).toBe('P1_WIN')
  })
})

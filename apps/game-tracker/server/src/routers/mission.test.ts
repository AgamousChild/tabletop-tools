import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createNullR2Storage } from '../lib/storage/r2'
import { createCallerFactory } from '../trpc'
import { appRouter } from './index'

const client = createClient({ url: ':memory:' })
const db = createDbFromClient(client)
const storage = createNullR2Storage()

beforeAll(async () => {
  await client.executeMultiple(`
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
      id TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL, category TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS mission_game_state (
      id TEXT PRIMARY KEY,
      scoring_mission_id TEXT NOT NULL REFERENCES scoring_mission(id) ON DELETE CASCADE,
      game_state_id TEXT NOT NULL REFERENCES game_state(id),
      points INTEGER, count_mode TEXT NOT NULL DEFAULT 'flag', sort_order INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO content_entity VALUES ('m-1','mission','Purge the Foe',NULL,NULL,NULL,NULL,NULL,NULL,0);
    INSERT INTO content_entity VALUES ('m-2','mission','Engage on All Fronts',NULL,NULL,NULL,NULL,NULL,NULL,0);
    INSERT INTO scoring_mission VALUES ('m-1','Purge the Foe','primary','symmetric',50,'checklist');
    INSERT INTO scoring_mission VALUES ('m-2','Engage on All Fronts','secondary','symmetric',15,'tier');
    INSERT INTO game_state VALUES ('gs-1','destroyed_enemy_unit','Destroyed >=1 enemy unit','unit_destroyed');
    INSERT INTO mission_game_state VALUES ('mgs-1','m-1','gs-1',4,'flag',0);
  `)
})

afterAll(() => client.close())

const createCaller = createCallerFactory(appRouter)
const req = new Request('http://localhost')
const ctx = { user: { id: 'u1', email: 'a@b.com', name: 'A' }, req, db, storage }

describe('mission.listPrimaries', () => {
  it('returns all scoring_missions with kind=primary', async () => {
    const caller = createCaller(ctx)
    const result = await caller.mission.listPrimaries()
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('m-1')
    expect(result[0]!.kind).toBe('primary')
  })
})

describe('mission.listSecondaries', () => {
  it('returns all scoring_missions with kind=secondary', async () => {
    const caller = createCaller(ctx)
    const result = await caller.mission.listSecondaries()
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('m-2')
    expect(result[0]!.kind).toBe('secondary')
  })
})

describe('mission.getGameStates', () => {
  it('returns mission_game_state rows for a given mission', async () => {
    const caller = createCaller(ctx)
    const result = await caller.mission.getGameStates({ missionId: 'm-1' })
    expect(result).toHaveLength(1)
    expect(result[0]!.gameStateId).toBe('gs-1')
    expect(result[0]!.points).toBe(4)
  })

  it('returns empty array for mission with no game states', async () => {
    const caller = createCaller(ctx)
    const result = await caller.mission.getGameStates({ missionId: 'm-2' })
    expect(result).toHaveLength(0)
  })
})

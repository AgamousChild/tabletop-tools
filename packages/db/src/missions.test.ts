import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDbFromClient } from './client'
import { getRandomMission, missionExists, MISSIONS, seedScoringMissions } from './missions'
import { contentEntity, scoringMission } from './schema'

const client = createClient({ url: ':memory:' })
const db = createDbFromClient(client)

afterAll(() => {
  client.close()
})

beforeAll(async () => {
  await client.execute('PRAGMA foreign_keys = ON')

  await client.execute(`CREATE TABLE content_entity (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    faction_id TEXT REFERENCES content_entity(id),
    parent_id TEXT REFERENCES content_entity(id),
    dataslate_id TEXT,
    r2_key TEXT,
    wahapedia_id TEXT,
    bsdata_id TEXT,
    can_deploy_solo INTEGER NOT NULL DEFAULT 1,
    updated_at INTEGER NOT NULL
  )`)

  await client.execute(`CREATE TABLE scoring_mission (
    id TEXT PRIMARY KEY REFERENCES content_entity(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    side TEXT NOT NULL DEFAULT 'symmetric',
    cap INTEGER,
    ui_pattern TEXT NOT NULL
  )`)
})

describe('seedScoringMissions', () => {
  it('inserts a content_entity row and a scoring_mission row for every mission', async () => {
    await seedScoringMissions(db)

    const entities = await drizzle(client).select().from(contentEntity).all()
    const missions = await drizzle(client).select().from(scoringMission).all()

    expect(entities).toHaveLength(MISSIONS.length)
    expect(missions).toHaveLength(MISSIONS.length)
    expect(entities.every((e) => e.type === 'mission')).toBe(true)
    expect(missions.map((m) => m.name).sort()).toEqual(
      MISSIONS.map((m) => m.name)
        .slice()
        .sort(),
    )
  })

  it('is idempotent — re-seeding does not create duplicates or error', async () => {
    await seedScoringMissions(db)
    await seedScoringMissions(db)

    const missions = await drizzle(client).select().from(scoringMission).all()
    expect(missions).toHaveLength(MISSIONS.length)
  })

  it('each seeded mission is findable by id via missionExists', async () => {
    await seedScoringMissions(db)
    for (const mission of MISSIONS) {
      expect(await missionExists(db, mission.id)).toBe(true)
    }
    expect(await missionExists(db, 'mission-does-not-exist')).toBe(false)
  })
})

describe('getRandomMission', () => {
  it('throws when the scoring_mission table is empty', async () => {
    const emptyClient = createClient({ url: ':memory:' })
    await emptyClient.execute('PRAGMA foreign_keys = ON')
    await emptyClient.execute(`CREATE TABLE content_entity (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      faction_id TEXT,
      parent_id TEXT,
      dataslate_id TEXT,
      r2_key TEXT,
      wahapedia_id TEXT,
      bsdata_id TEXT,
      can_deploy_solo INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL
    )`)
    await emptyClient.execute(`CREATE TABLE scoring_mission (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      side TEXT NOT NULL DEFAULT 'symmetric',
      cap INTEGER,
      ui_pattern TEXT NOT NULL
    )`)
    const emptyDb = createDbFromClient(emptyClient)

    await expect(getRandomMission(emptyDb)).rejects.toThrow(/scoring_mission table is empty/)
    emptyClient.close()
  })

  it('returns a mission name from the seeded catalog once seeded', async () => {
    await seedScoringMissions(db)
    const name = await getRandomMission(db)
    expect(MISSIONS.map((m) => m.name)).toContain(name)
  })

  it('can return every mission in the pool across repeated calls', async () => {
    await seedScoringMissions(db)
    const seen = new Set<string>()
    for (let i = 0; i < 200 && seen.size < MISSIONS.length; i++) {
      seen.add(await getRandomMission(db))
    }
    expect(seen.size).toBe(MISSIONS.length)
  })
})

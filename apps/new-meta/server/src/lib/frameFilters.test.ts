import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  getDimForTypes,
  getDimGranularities,
  getFramesWithData,
  getFrameTypeSummaries,
  getGranularityIdByName,
  getPopulatedGranularities,
  getTypeIdByName,
  resolveDefaultFrame,
} from './frameFilters'

const client = createClient({ url: ':memory:' })
const db = createDbFromClient(client)

beforeAll(async () => {
  await client.executeMultiple(`
    CREATE TABLE dim_for_type (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE dim_granularity (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE meta_for (
      id TEXT PRIMARY KEY,
      type_id INTEGER NOT NULL,
      date INTEGER NOT NULL,
      end_date INTEGER,
      month INTEGER,
      quarter INTEGER,
      year INTEGER NOT NULL
    );
    CREATE TABLE meta_top (
      id TEXT PRIMARY KEY,
      meta_for_id TEXT NOT NULL,
      granularity_id INTEGER NOT NULL,
      faction_id TEXT NOT NULL
    );
  `)
})

afterAll(() => client.close())

beforeEach(async () => {
  await client.executeMultiple(`
    DELETE FROM meta_top;
    DELETE FROM meta_for;
    DELETE FROM dim_granularity;
    DELETE FROM dim_for_type;
  `)
})

async function seedDims() {
  // Match the real dim_for_type ids (1=Event, 2=Weekend, 3=Month, 4=Quarter,
  // 5=Year, 6=DataSlate, 7=TournamentPack, 8=Edition). The library code
  // must not hardcode these — these inserts only set up the test world.
  await client.executeMultiple(`
    INSERT INTO dim_for_type (id, name) VALUES
      (1, 'Event'), (2, 'Weekend'), (3, 'Month'), (4, 'Quarter'),
      (5, 'Year'), (6, 'DataSlate'), (7, 'TournamentPack'), (8, 'Edition');
    INSERT INTO dim_granularity (id, name) VALUES
      (1, 'Faction'), (2, 'SubFaction'), (3, 'Detachment');
  `)
}

describe('getDimForTypes', () => {
  it('returns all dim_for_type rows ordered by id', async () => {
    await seedDims()
    const rows = await getDimForTypes(db)
    expect(rows).toHaveLength(8)
    expect(rows[0]).toEqual({ id: 1, name: 'Event' })
    expect(rows.at(-1)).toEqual({ id: 8, name: 'Edition' })
  })
})

describe('getDimGranularities', () => {
  it('returns all dim_granularity rows', async () => {
    await seedDims()
    const rows = await getDimGranularities(db)
    expect(rows.map((r) => r.name)).toEqual(['Faction', 'SubFaction', 'Detachment'])
  })
})

describe('getPopulatedGranularities', () => {
  it('returns only granularities with meta_top rows', async () => {
    await seedDims()
    await client.executeMultiple(`
      INSERT INTO meta_for (id, type_id, date, year) VALUES ('q1', 4, 100, 2026);
      INSERT INTO meta_top (id, meta_for_id, granularity_id, faction_id)
        VALUES ('t1', 'q1', 1, 'sm');
    `)
    const rows = await getPopulatedGranularities(db)
    expect(rows).toEqual([{ id: 1, name: 'Faction' }])
  })

  it('returns empty when no meta_top rows exist', async () => {
    await seedDims()
    const rows = await getPopulatedGranularities(db)
    expect(rows).toEqual([])
  })
})

describe('getFrameTypeSummaries', () => {
  it('counts only frames that have meta_top rows at the given granularity', async () => {
    await seedDims()
    // 2 quarters: q1 has faction-level data, q2 has none
    // 1 month with faction-level data
    // 1 quarter with detachment-level data only
    await client.executeMultiple(`
      INSERT INTO meta_for (id, type_id, date, year) VALUES
        ('q1', 4, 100, 2026),
        ('q2', 4, 200, 2026),
        ('m1', 3, 50, 2026),
        ('q3', 4, 300, 2026);
      INSERT INTO meta_top (id, meta_for_id, granularity_id, faction_id) VALUES
        ('t1', 'q1', 1, 'sm'),
        ('t2', 'm1', 1, 'sm'),
        ('t3', 'q3', 3, 'sm');
    `)
    const summaries = await getFrameTypeSummaries(db, 1)
    const quarter = summaries.find((s) => s.name === 'Quarter')!
    const month = summaries.find((s) => s.name === 'Month')!
    const year = summaries.find((s) => s.name === 'Year')!
    expect(quarter.framesWithData).toBe(1)
    expect(month.framesWithData).toBe(1)
    expect(year.framesWithData).toBe(0)
  })

  it('returns one row per dim_for_type even when there are zero frames', async () => {
    await seedDims()
    const summaries = await getFrameTypeSummaries(db, 1)
    expect(summaries).toHaveLength(8)
    expect(summaries.every((s) => s.framesWithData === 0)).toBe(true)
  })
})

describe('getFramesWithData', () => {
  it('marks frames as having data only when the granularity matches', async () => {
    await seedDims()
    await client.executeMultiple(`
      INSERT INTO meta_for (id, type_id, date, year, quarter, month) VALUES
        ('quarter:2026:1', 4, 100, 2026, 1, NULL),
        ('quarter:2026:2', 4, 200, 2026, 2, NULL),
        ('month:2026-01', 3, 50, 2026, NULL, 1);
      INSERT INTO meta_top (id, meta_for_id, granularity_id, faction_id) VALUES
        ('t1', 'quarter:2026:1', 1, 'sm'),
        ('t2', 'month:2026-01', 3, 'sm');
    `)
    const frames = await getFramesWithData(db, 1)
    expect(frames.find((f) => f.id === 'quarter:2026:1')?.hasData).toBe(true)
    expect(frames.find((f) => f.id === 'quarter:2026:2')?.hasData).toBe(false)
    expect(frames.find((f) => f.id === 'month:2026-01')?.hasData).toBe(false)
  })

  it('derives labels from type name not from hardcoded type_id', async () => {
    await seedDims()
    await client.executeMultiple(`
      INSERT INTO meta_for (id, type_id, date, year, quarter, month) VALUES
        ('quarter:2026:1', 4, 100, 2026, 1, NULL),
        ('month:2026-03', 3, 50, 2026, NULL, 3),
        ('year:2026', 5, 1, 2026, NULL, NULL),
        ('dataslate:summer-2026', 6, 75, 2026, NULL, NULL);
    `)
    const frames = await getFramesWithData(db, 1)
    const byId = Object.fromEntries(frames.map((f) => [f.id, f.label]))
    expect(byId['quarter:2026:1']).toBe('2026 Q1')
    expect(byId['month:2026-03']).toBe('2026-03')
    expect(byId['year:2026']).toBe('2026')
    expect(byId['dataslate:summer-2026']).toBe('Dataslate: summer-2026')
  })

  it('returns frames ordered by date desc', async () => {
    await seedDims()
    await client.executeMultiple(`
      INSERT INTO meta_for (id, type_id, date, year) VALUES
        ('a', 4, 100, 2026),
        ('b', 4, 300, 2026),
        ('c', 4, 200, 2026);
    `)
    const frames = await getFramesWithData(db, 1)
    expect(frames.map((f) => f.id)).toEqual(['b', 'c', 'a'])
  })
})

describe('resolveDefaultFrame', () => {
  it('picks the most-recent populated frame at the given granularity, not the most-recent dated frame', async () => {
    await seedDims()
    // Latest by date has NO meta_top data; the older one does.
    await client.executeMultiple(`
      INSERT INTO meta_for (id, type_id, date, year, quarter) VALUES
        ('quarter:2026:3', 4, 300, 2026, 3),
        ('quarter:2026:2', 4, 200, 2026, 2),
        ('quarter:2026:1', 4, 100, 2026, 1);
      INSERT INTO meta_top (id, meta_for_id, granularity_id, faction_id) VALUES
        ('t1', 'quarter:2026:2', 1, 'sm');
    `)
    const frame = await resolveDefaultFrame(db, 1, 'Quarter')
    expect(frame).toBe('quarter:2026:2')
  })

  it('falls back to the most-recent populated frame of any type when preferred type has no data', async () => {
    await seedDims()
    // No quarter has any data; a month does.
    await client.executeMultiple(`
      INSERT INTO meta_for (id, type_id, date, year, quarter, month) VALUES
        ('quarter:2026:1', 4, 100, 2026, 1, NULL),
        ('month:2026-09', 3, 500, 2026, NULL, 9);
      INSERT INTO meta_top (id, meta_for_id, granularity_id, faction_id) VALUES
        ('t1', 'month:2026-09', 1, 'sm');
    `)
    const frame = await resolveDefaultFrame(db, 1, 'Quarter')
    expect(frame).toBe('month:2026-09')
  })

  it('returns null when no frame at the granularity has data', async () => {
    await seedDims()
    await client.executeMultiple(`
      INSERT INTO meta_for (id, type_id, date, year, quarter) VALUES
        ('quarter:2026:1', 4, 100, 2026, 1);
    `)
    const frame = await resolveDefaultFrame(db, 1, 'Quarter')
    expect(frame).toBeNull()
  })

  it('respects granularity — a frame with detachment-level data does not satisfy a faction-level request', async () => {
    await seedDims()
    await client.executeMultiple(`
      INSERT INTO meta_for (id, type_id, date, year, quarter) VALUES
        ('quarter:2026:1', 4, 100, 2026, 1);
      INSERT INTO meta_top (id, meta_for_id, granularity_id, faction_id) VALUES
        ('t1', 'quarter:2026:1', 3, 'sm');
    `)
    expect(await resolveDefaultFrame(db, 1)).toBeNull()
    expect(await resolveDefaultFrame(db, 3)).toBe('quarter:2026:1')
  })
})

describe('getTypeIdByName / getGranularityIdByName', () => {
  it('resolves type names to ids without hardcoding', async () => {
    await seedDims()
    expect(await getTypeIdByName(db, 'Month')).toBe(3)
    expect(await getTypeIdByName(db, 'Quarter')).toBe(4)
    expect(await getTypeIdByName(db, 'DoesNotExist')).toBeNull()
  })

  it('resolves granularity names to ids without hardcoding', async () => {
    await seedDims()
    expect(await getGranularityIdByName(db, 'Faction')).toBe(1)
    expect(await getGranularityIdByName(db, 'Detachment')).toBe(3)
    expect(await getGranularityIdByName(db, 'DoesNotExist')).toBeNull()
  })
})

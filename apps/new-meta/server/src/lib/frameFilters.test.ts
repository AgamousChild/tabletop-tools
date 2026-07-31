import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import { applyTestSchema } from '@tabletop-tools/db/src/test-schema'
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
  // Real schema from the committed migrations. This file used to hand-roll a
  // four-table subset, which broke the moment the frame query needed to join
  // meta_events / dim_dataslate / dim_tournament_pack / dim_edition to build
  // labels from real names.
  await applyTestSchema(client)
})

afterAll(() => client.close())

beforeEach(async () => {
  await client.executeMultiple(`
    DELETE FROM meta_top;
    DELETE FROM meta_for;
    DELETE FROM meta_event_players;
    DELETE FROM meta_events;
    DELETE FROM dim_dataslate;
    DELETE FROM dim_tournament_pack;
    DELETE FROM dim_edition;
    DELETE FROM dim_faction;
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
    INSERT OR IGNORE INTO dim_faction (id, name, allegiance) VALUES
      ('sm', 'Space Marines', 'imperium');
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
      INSERT INTO meta_top (id, meta_for_id, granularity_id, faction_id, win_rate, draw_rate, over_rep, four_oh_start, player_pop_pct)
        VALUES ('t1', 'q1', 1, 'sm', 0, 0, 0, 0, 0);
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
      INSERT INTO meta_top (id, meta_for_id, granularity_id, faction_id, win_rate, draw_rate, over_rep, four_oh_start, player_pop_pct) VALUES
        ('t1', 'q1', 1, 'sm', 0, 0, 0, 0, 0),
        ('t2', 'm1', 1, 'sm', 0, 0, 0, 0, 0),
        ('t3', 'q3', 3, 'sm', 0, 0, 0, 0, 0);
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
      INSERT INTO meta_top (id, meta_for_id, granularity_id, faction_id, win_rate, draw_rate, over_rep, four_oh_start, player_pop_pct) VALUES
        ('t1', 'quarter:2026:1', 1, 'sm', 0, 0, 0, 0, 0),
        ('t2', 'month:2026-01', 3, 'sm', 0, 0, 0, 0, 0);
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
    // A dataslate frame with no dim_dataslate row falls back to its date
    // rather than echoing the id back at the user.
    expect(byId['dataslate:summer-2026']).not.toContain('dataslate:')
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
      INSERT INTO meta_top (id, meta_for_id, granularity_id, faction_id, win_rate, draw_rate, over_rep, four_oh_start, player_pop_pct) VALUES
        ('t1', 'quarter:2026:2', 1, 'sm', 0, 0, 0, 0, 0);
    `)
    const frame = await resolveDefaultFrame(db, 1, 'Quarter')
    expect(frame).toBe('quarter:2026:2')
  })

  it('ignores a frame whose period has not started yet', async () => {
    await seedDims()
    // Real prod shape: BCP leagues carry an endDate months out, so 32 events
    // were dated Oct-Dec 2026 while "now" was July. They populated
    // quarter:2026:4 with 36 games, and picking the most-recent POPULATED
    // frame handed every faction page a 36-game headline instead of Q3's
    // 21,807.
    const now = Date.now()
    const future = now + 90 * 24 * 60 * 60 * 1000
    const past = now - 30 * 24 * 60 * 60 * 1000
    await client.executeMultiple(`
      INSERT INTO meta_for (id, type_id, date, year, quarter) VALUES
        ('quarter:future', 4, ${future}, 2026, 4),
        ('quarter:current', 4, ${past}, 2026, 3);
      INSERT INTO meta_top (id, meta_for_id, granularity_id, faction_id, win_rate, draw_rate, over_rep, four_oh_start, player_pop_pct) VALUES
        ('t1', 'quarter:future', 1, 'sm', 0, 0, 0, 0, 0),
        ('t2', 'quarter:current', 1, 'sm', 0, 0, 0, 0, 0);
    `)
    expect(await resolveDefaultFrame(db, 1, 'Quarter')).toBe('quarter:current')
  })

  it('still returns a future frame when it is the only data there is', async () => {
    await seedDims()
    // Excluding future frames must not blank the page out entirely — better a
    // thin headline than none.
    const future = Date.now() + 90 * 24 * 60 * 60 * 1000
    await client.executeMultiple(`
      INSERT INTO meta_for (id, type_id, date, year, quarter) VALUES
        ('quarter:future', 4, ${future}, 2026, 4);
      INSERT INTO meta_top (id, meta_for_id, granularity_id, faction_id, win_rate, draw_rate, over_rep, four_oh_start, player_pop_pct) VALUES
        ('t1', 'quarter:future', 1, 'sm', 0, 0, 0, 0, 0);
    `)
    expect(await resolveDefaultFrame(db, 1, 'Quarter')).toBe('quarter:future')
  })

  it('falls back to the most-recent populated frame of any type when preferred type has no data', async () => {
    await seedDims()
    // No quarter has any data; a month does.
    await client.executeMultiple(`
      INSERT INTO meta_for (id, type_id, date, year, quarter, month) VALUES
        ('quarter:2026:1', 4, 100, 2026, 1, NULL),
        ('month:2026-09', 3, 500, 2026, NULL, 9);
      INSERT INTO meta_top (id, meta_for_id, granularity_id, faction_id, win_rate, draw_rate, over_rep, four_oh_start, player_pop_pct) VALUES
        ('t1', 'month:2026-09', 1, 'sm', 0, 0, 0, 0, 0);
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
      INSERT INTO meta_top (id, meta_for_id, granularity_id, faction_id, win_rate, draw_rate, over_rep, four_oh_start, player_pop_pct) VALUES
        ('t1', 'quarter:2026:1', 3, 'sm', 0, 0, 0, 0, 0);
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

describe('frame labels come from the data, not from the id', () => {
  // Every label was synthesized by string-munging the frame id. Users saw a
  // dropdown of 404 raw nanoids under "Events", plus `pack:pack-pariah-nexus`,
  // `Dataslate: dataslate-2025-01` and `Edition edition-10th` — ids leaking
  // straight through where a name belongs.
  it('labels an event frame with the tournament name and date, not its nanoid', async () => {
    await seedDims()
    await client.executeMultiple(`
      INSERT INTO meta_events (id, name, date, format, player_count, source, source_id, imported_at)
        VALUES ('JCbZ9snZ0Yt_ZO1BmesU-','Bay Area Open 2025 - 40k Champs',
                ${Date.parse('2025-05-26T00:00:00Z')},'GT',174,'bcp','oTK',1);
      INSERT INTO meta_for (id, type_id, date, year)
        VALUES ('event:JCbZ9snZ0Yt_ZO1BmesU-', 1, ${Date.parse('2025-05-26T00:00:00Z')}, 2025);
      INSERT INTO meta_top (id, meta_for_id, granularity_id, faction_id, win_rate, draw_rate, over_rep, four_oh_start, player_pop_pct)
        VALUES ('t1','event:JCbZ9snZ0Yt_ZO1BmesU-',1,'sm', 0, 0, 0, 0, 0);
    `)
    const frames = await getFramesWithData(db, 1)
    const f = frames.find((x) => x.id === 'event:JCbZ9snZ0Yt_ZO1BmesU-')!
    expect(f.label).toContain('Bay Area Open 2025')
    expect(f.label).not.toContain('JCbZ9snZ0Yt')
  })

  it('labels dataslate, pack and edition frames from their dim name', async () => {
    await seedDims()
    await client.executeMultiple(`
      INSERT INTO dim_dataslate (id, name, effective_date, end_date)
        VALUES ('dataslate-2025-01','January 2025 Dataslate',${Date.UTC(2025, 0, 20)},NULL);
      INSERT INTO dim_tournament_pack (id, name, effective_date, end_date)
        VALUES ('pack-pariah-nexus','Pariah Nexus',${Date.UTC(2024, 0, 1)},NULL);
      INSERT INTO dim_edition (id, name, start_date, end_date)
        VALUES ('edition-11th','11th Edition',${Date.UTC(2026, 5, 16)},NULL);
      INSERT INTO meta_for (id, type_id, date, year, dataslate_id)
        VALUES ('dataslate:dataslate-2025-01', 6, ${Date.UTC(2025, 0, 20)}, 2025, 'dataslate-2025-01');
      INSERT INTO meta_for (id, type_id, date, year, tourney_pack_id)
        VALUES ('pack:pack-pariah-nexus', 7, ${Date.UTC(2024, 0, 1)}, 2024, 'pack-pariah-nexus');
      INSERT INTO meta_for (id, type_id, date, year, edition_id)
        VALUES ('edition:edition-11th', 8, ${Date.UTC(2026, 5, 16)}, 2026, 'edition-11th');
      INSERT INTO meta_top (id, meta_for_id, granularity_id, faction_id, win_rate, draw_rate, over_rep, four_oh_start, player_pop_pct) VALUES
        ('t1','dataslate:dataslate-2025-01',1,'sm', 0, 0, 0, 0, 0),
        ('t2','pack:pack-pariah-nexus',1,'sm', 0, 0, 0, 0, 0),
        ('t3','edition:edition-11th',1,'sm', 0, 0, 0, 0, 0);
    `)
    const frames = await getFramesWithData(db, 1)
    const label = (id: string) => frames.find((x) => x.id === id)!.label

    expect(label('dataslate:dataslate-2025-01')).toBe('January 2025 Dataslate')
    // The pack branch looked for a `tourney_pack:` prefix while generateFrames
    // writes `pack:`, so it never matched and the raw id leaked to the user.
    expect(label('pack:pack-pariah-nexus')).toBe('Pariah Nexus')
    expect(label('edition:edition-11th')).toBe('11th Edition')
  })

  it('falls back to something readable when the source row is missing', async () => {
    await seedDims()
    await client.executeMultiple(`
      INSERT INTO meta_for (id, type_id, date, year)
        VALUES ('event:orphaned', 1, ${Date.parse('2025-05-26T00:00:00Z')}, 2025);
      INSERT INTO meta_top (id, meta_for_id, granularity_id, faction_id, win_rate, draw_rate, over_rep, four_oh_start, player_pop_pct)
        VALUES ('t1','event:orphaned',1,'sm', 0, 0, 0, 0, 0);
    `)
    const frames = await getFramesWithData(db, 1)
    const f = frames.find((x) => x.id === 'event:orphaned')!
    // No meta_events row to name it — must still be identifiable by date
    // rather than rendering as an empty option.
    expect(f.label).toContain('2025-05-26')
  })
})

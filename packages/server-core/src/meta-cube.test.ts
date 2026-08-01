import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import { applyTestSchema, seedReferenceDims } from '@tabletop-tools/db/src/test-schema'
import { sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { buildCubeForEvents, generateFrames } from './meta-cube'

function createTestDb() {
  const client = createClient({ url: ':memory:' })
  const db = createDbFromClient(client)
  return { client, db }
}

async function setupTables(client: ReturnType<typeof createClient>) {
  // Real schema from the committed migrations — see packages/db test-schema.
  await applyTestSchema(client)
  await seedReferenceDims(client)
}

async function seedDims(client: ReturnType<typeof createClient>) {
  await client.execute({
    sql: `INSERT INTO dim_faction VALUES (?, ?, ?)`,
    args: ['sm', 'Space Marines', 'imperium'],
  })
  await client.execute({
    sql: `INSERT INTO dim_faction VALUES (?, ?, ?)`,
    args: ['ork', 'Orks', 'xenos'],
  })
  // dim_granularity / dim_for_type come from seedReferenceDims()
}

async function insertEvent(
  client: ReturnType<typeof createClient>,
  opts: {
    id: string
    date: number
    source: string
    sourceId: string
    importedAt: number
  },
) {
  await client.execute({
    sql: `INSERT INTO meta_events (id, name, date, location, region_id, format, rounds, player_count, source, source_id, imported_at, win_faction_id, win_subfaction_id, win_detachment_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      opts.id,
      `Event ${opts.id}`,
      opts.date,
      'London',
      null,
      'GT',
      5,
      2,
      opts.source,
      opts.sourceId,
      opts.importedAt,
      null,
      null,
      null,
    ],
  })
  await client.execute({
    sql: `INSERT INTO meta_event_players (id, event_id, player_name, faction_id, subfaction_id, detachment_id, placement, list_text, wins, losses, draws)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [`${opts.id}-p1`, opts.id, 'Alice', 'sm', null, null, 1, null, 3, 2, 0],
  })
  await client.execute({
    sql: `INSERT INTO meta_event_players (id, event_id, player_name, faction_id, subfaction_id, detachment_id, placement, list_text, wins, losses, draws)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [`${opts.id}-p2`, opts.id, 'Bob', 'ork', null, null, 2, null, 2, 3, 0],
  })
  await client.execute({
    sql: `INSERT INTO meta_pairings (id, event_id, round, player1_id, player2_id, player1_score, player2_score, result)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [`${opts.id}-pair1`, opts.id, 1, `${opts.id}-p1`, `${opts.id}-p2`, 80, 60, 'p1'],
  })
}

describe('generateFrames', () => {
  it('generates all frame types for a single event', () => {
    const eventDate = Date.UTC(2025, 5, 14) // June 14, 2025
    const events = [{ id: 'evt1', date: eventDate, name: 'Test GT' }]
    const dataslates = [{ id: 'ds1', effective_date: Date.UTC(2025, 0, 1), end_date: null }]
    const packs: Array<{
      id: string
      effective_date: number
      end_date: number | null
    }> = []
    const editions = [{ id: '10th', start_date: Date.UTC(2023, 5, 1), end_date: null }]

    const frames = generateFrames(events, dataslates, packs, editions)

    const types = frames.map((f) => f.id.split(':')[0])
    expect(types).toContain('event')
    expect(types).toContain('weekend')
    expect(types).toContain('month')
    expect(types).toContain('quarter')
    expect(types).toContain('year')
    expect(types).toContain('dataslate')
    expect(types).toContain('edition')

    const eventFrame = frames.find((f) => f.id === 'event:evt1')!
    expect(eventFrame.typeId).toBe(1)
    expect(eventFrame.date).toBe(eventDate)
    expect(eventFrame.year).toBe(2025)
    expect(eventFrame.month).toBe(6)
  })

  it('assigns editions across a closed boundary without leaving a gap', () => {
    // 10th closes at the END of 2026-06-15 and 11th opens on the 16th. The
    // matcher is `date >= start && (!end || date <= end)`, and 379 of 400 real
    // event dates carry a time component — so closing 10th at plain
    // '2026-06-15' (midnight) would drop every later event that day into a gap
    // with a null edition.
    const editions = [
      {
        id: 'edition-10th',
        start_date: Date.UTC(2023, 5, 1),
        end_date: Date.parse('2026-06-15T23:59:59.999Z'),
      },
      { id: 'edition-11th', start_date: Date.parse('2026-06-16T00:00:00.000Z'), end_date: null },
    ]
    const events = [
      { id: 'e-early', date: Date.parse('2026-06-14T23:00:00Z'), name: '10e GT' },
      { id: 'e-last10th', date: Date.parse('2026-06-15T00:00:00Z'), name: 'Last of 10th' },
      { id: 'e-lateday', date: Date.parse('2026-06-15T22:00:00Z'), name: 'late on the 15th' },
      { id: 'e-first11th', date: Date.parse('2026-06-16T00:00:00Z'), name: 'first 11e' },
      { id: 'e-later', date: Date.parse('2026-06-21T16:00:00Z'), name: '11e GT' },
    ]

    const frames = generateFrames(events, [], [], editions)
    const editionOf = (eventId: string) =>
      frames.find((f) => f.id === `event:${eventId}`)!.editionId

    expect(editionOf('e-early')).toBe('edition-10th')
    expect(editionOf('e-last10th')).toBe('edition-10th')
    // The trap: late on the closing day still belongs to 10th.
    expect(editionOf('e-lateday')).toBe('edition-10th')
    expect(editionOf('e-first11th')).toBe('edition-11th')
    expect(editionOf('e-later')).toBe('edition-11th')

    // Nothing may fall between the two editions.
    expect(frames.filter((f) => f.id.startsWith('event:')).every((f) => f.editionId !== null)).toBe(
      true,
    )
  })

  it('deduplicates frames with the same id', () => {
    const events = [
      { id: 'evt1', date: Date.UTC(2025, 5, 13), name: 'GT 1' },
      { id: 'evt2', date: Date.UTC(2025, 5, 14), name: 'GT 2' }, // same weekend
    ]
    const frames = generateFrames(events, [], [], [])

    const eventFrames = frames.filter((f) => f.id.startsWith('event:'))
    const weekendFrames = frames.filter((f) => f.id.startsWith('weekend:'))
    expect(eventFrames).toHaveLength(2)
    expect(weekendFrames).toHaveLength(1)
  })
})

describe('buildCubeForEvents', () => {
  let client: ReturnType<typeof createClient>
  let db: ReturnType<typeof createDbFromClient>

  beforeEach(async () => {
    const testDb = createTestDb()
    client = testDb.client
    db = testDb.db
    await setupTables(client)
    await seedDims(client)
  })

  it('builds fact rows and meta_top scoped to the given event only', async () => {
    await insertEvent(client, {
      id: 'evt1',
      date: Date.UTC(2025, 5, 14),
      source: 'native',
      sourceId: 'tourn-1',
      importedAt: 1000,
    })

    await buildCubeForEvents(db, ['evt1'])

    const frames = await db.all(sql`SELECT * FROM meta_for`)
    expect(frames.length).toBeGreaterThan(0)

    const facts = (await db.all(sql`SELECT * FROM fact_game_results`)) as Array<
      Record<string, unknown>
    >
    expect(facts).toHaveLength(2) // 1 pairing -> 2 perspectives

    const p1Fact = facts.find((f) => f.player_id === 'evt1-p1')!
    expect(p1Fact.result).toBe(1.0)
    expect(p1Fact.faction_id).toBe('sm')
    expect(p1Fact.opponent_faction_id).toBe('ork')

    const tops = (await db.all(sql`SELECT * FROM meta_top`)) as Array<Record<string, unknown>>
    expect(tops.length).toBeGreaterThan(0)
    const smTop = tops.find((t) => t.faction_id === 'sm')!
    expect(smTop.wins).toBe(3)
    expect(smTop.players).toBe(1)
  })

  it('carries each army detachment combo into the fact grain, both perspectives', async () => {
    await insertEvent(client, {
      id: 'evt-combo',
      date: Date.UTC(2025, 5, 14),
      source: 'native',
      sourceId: 'tourn-combo',
      importedAt: 1000,
    })
    await client.executeMultiple(`
      INSERT INTO dim_detachment (id, name, faction_id, subfaction_id, dp) VALUES
        ('sm:gladius','Gladius','sm',NULL,2),
        ('sm:librarius','Librarius','sm',NULL,1),
        ('ork:war-horde','War Horde','ork',NULL,3);
      INSERT INTO dim_detachment_combo (id, faction_id, member_count, total_dp, is_legal) VALUES
        ('sm:gladius+librarius','sm',2,3,1),
        ('ork:war-horde','ork',1,3,1);
      UPDATE meta_event_players SET detachment_id='sm:gladius', combo_id='sm:gladius+librarius'
        WHERE id='evt-combo-p1';
      UPDATE meta_event_players SET detachment_id='ork:war-horde', combo_id='ork:war-horde'
        WHERE id='evt-combo-p2';
    `)

    await buildCubeForEvents(db, ['evt-combo'])

    const facts = (await db.all(sql`
      SELECT player_id, detachment_id, combo_id, opponent_combo_id FROM fact_game_results
    `)) as Array<Record<string, unknown>>
    // Grain unchanged: a two-detachment army is still ONE row per game, not two.
    expect(facts).toHaveLength(2)

    const p1 = facts.find((f) => f.player_id === 'evt-combo-p1')!
    expect(p1.combo_id).toBe('sm:gladius+librarius')
    expect(p1.opponent_combo_id).toBe('ork:war-horde')
    // detachment_id keeps holding the primary for consumers not yet on combo_id.
    expect(p1.detachment_id).toBe('sm:gladius')

    const p2 = facts.find((f) => f.player_id === 'evt-combo-p2')!
    expect(p2.combo_id).toBe('ork:war-horde')
    expect(p2.opponent_combo_id).toBe('sm:gladius+librarius')
  })

  it('does NOT cube events outside the given id list (regression: unscoped watermark query)', async () => {
    // Two events land in the DB with different sources/imported_at times, simulating
    // three independent writers landing rows without any single writer "owning" a global watermark.
    await insertEvent(client, {
      id: 'evt-native',
      date: Date.UTC(2025, 5, 14),
      source: 'native',
      sourceId: 'tourn-1',
      importedAt: 1000,
    })
    await insertEvent(client, {
      id: 'evt-csv',
      date: Date.UTC(2025, 5, 15),
      source: 'csv-import',
      sourceId: 'hash-abc',
      importedAt: 2000,
    })

    // Only cube evt-native — evt-csv must be completely untouched
    await buildCubeForEvents(db, ['evt-native'])

    const facts = (await db.all(sql`SELECT * FROM fact_game_results`)) as Array<
      Record<string, unknown>
    >
    expect(facts).toHaveLength(2)
    expect(facts.every((f) => f.event_id === 'evt-native')).toBe(true)

    const eventFrame = await db.all(sql`SELECT * FROM meta_for WHERE id = 'event:evt-csv'`)
    expect(eventFrame).toHaveLength(0)
  })

  it('keys each fact row to its pairing so a duplicate game cannot be stored', async () => {
    // The 2026-07-30 rebuild left 23,995 duplicate rows (90,690 for 66,695
    // games) because DELETE-by-event and the INSERTs were separate statements
    // and something re-applied a tail of them. Every affected win rate counted
    // those games twice, silently. Two guards now: the writes go in one batch,
    // and the pairing key makes a second copy unstorable.
    await insertEvent(client, {
      id: 'evt-key',
      date: Date.UTC(2025, 5, 14),
      source: 'native',
      sourceId: 'tourn-key',
      importedAt: 1000,
    })
    await buildCubeForEvents(db, ['evt-key'])

    const facts = (await db.all(
      sql`SELECT id, pairing_id, player_id FROM fact_game_results WHERE event_id = 'evt-key'`,
    )) as Array<Record<string, unknown>>
    expect(facts).toHaveLength(2)
    expect(facts.every((f) => f.pairing_id === 'evt-key-pair1')).toBe(true)

    // Re-inserting the same game under a new surrogate id must be rejected.
    await expect(
      db.run(sql`INSERT INTO fact_game_results
        (id, pairing_id, event_id, player_id, opponent_id, round, faction_id, result)
        VALUES ('dupe', 'evt-key-pair1', 'evt-key', 'evt-key-p1', 'evt-key-p2', 1, 'sm', 1.0)`),
    ).rejects.toThrow()

    // A player with TWO pairings in one round is real data (27 such pairs in
    // prod, against different opponents) — the key is the pairing, not the
    // round, so both games are storable.
    await client.execute({
      sql: `INSERT INTO meta_pairings (id, event_id, round, player1_id, player2_id, player1_score, player2_score, result)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: ['evt-key-pair2', 'evt-key', 1, 'evt-key-p1', 'evt-key-p2', 50, 90, 'p2'],
    })
    await buildCubeForEvents(db, ['evt-key'])
    const bothGames = (await db.all(sql`
      SELECT pairing_id FROM fact_game_results
      WHERE event_id = 'evt-key' AND player_id = 'evt-key-p1' AND round = 1
    `)) as Array<Record<string, unknown>>
    expect(bothGames.map((g) => g.pairing_id).sort()).toEqual(['evt-key-pair1', 'evt-key-pair2'])
  })

  it('refreshes a frame dimension when the dim changes, instead of keeping the stale one', async () => {
    // Frames were written with INSERT OR IGNORE, so an existing frame never
    // picked up a dimension change. When 11th edition was added to dim_edition,
    // all 719 existing frames kept saying edition-10th — including the events
    // that had 11e detachment combos on them.
    await insertEvent(client, {
      id: 'evt-ed',
      date: Date.parse('2026-06-21T16:00:00Z'),
      source: 'native',
      sourceId: 'tourn-ed',
      importedAt: 1000,
    })
    await client.executeMultiple(`
      INSERT INTO dim_edition (id, name, start_date, end_date)
        VALUES ('edition-10th','10th Edition',${Date.UTC(2023, 5, 1)},NULL);
    `)
    await buildCubeForEvents(db, ['evt-ed'])
    const before = (await db.all(
      sql`SELECT edition_id FROM meta_for WHERE id = 'event:evt-ed'`,
    )) as Array<{ edition_id: string | null }>
    expect(before[0]!.edition_id).toBe('edition-10th')

    // Close 10th and open 11th, exactly as the real dim change did.
    await client.executeMultiple(`
      UPDATE dim_edition SET end_date = ${Date.parse('2026-06-15T23:59:59.999Z')}
        WHERE id = 'edition-10th';
      INSERT INTO dim_edition (id, name, start_date, end_date)
        VALUES ('edition-11th','11th Edition',${Date.parse('2026-06-16T00:00:00.000Z')},NULL);
    `)
    await buildCubeForEvents(db, ['evt-ed'])

    const after = (await db.all(
      sql`SELECT edition_id FROM meta_for WHERE id = 'event:evt-ed'`,
    )) as Array<{ edition_id: string | null }>
    expect(after[0]!.edition_id).toBe('edition-11th')
  })

  it("moves an event's frame when the event's date is corrected", async () => {
    // An `event:{id}` frame is keyed on the event, not the date, so a corrected
    // event date must move its frame. Nine majors were stored under 2001 by a
    // bad BCP import and repaired to their true 2025 dates; refreshing only the
    // dimension FKs would have left their frames stranded in 2001.
    await insertEvent(client, {
      id: 'evt-move',
      date: Date.parse('2001-05-03T00:00:00Z'),
      source: 'bcp',
      sourceId: 'moved',
      importedAt: 1000,
    })
    await buildCubeForEvents(db, ['evt-move'])
    const before = (await db.all(
      sql`SELECT date, year FROM meta_for WHERE id = 'evt-move' OR id = 'event:evt-move'`,
    )) as Array<{ date: number; year: number }>
    expect(before[0]!.year).toBe(2001)

    await client.execute({
      sql: `UPDATE meta_events SET date = ? WHERE id = 'evt-move'`,
      args: [Date.parse('2025-05-04T00:00:00Z')],
    })
    await buildCubeForEvents(db, ['evt-move'])

    const after = (await db.all(
      sql`SELECT date, year FROM meta_for WHERE id = 'event:evt-move'`,
    )) as Array<{ date: number; year: number }>
    expect(after[0]!.year).toBe(2025)
    expect(after[0]!.date).toBe(Date.parse('2025-05-04T00:00:00Z'))
  })

  it('builds Detachment and Combo rollups so the interface never aggregates facts', async () => {
    // The cube only ever wrote Faction rollups — 6,859 rows in prod, zero at
    // any other granularity — so every detachment question was a runtime join
    // over 75k fact rows: 4.3s to return 12 rows on a faction page. The whole
    // point of the cube is that the read path is an indexed SELECT.
    await insertEvent(client, {
      id: 'evt-roll',
      date: Date.UTC(2025, 5, 14),
      source: 'native',
      sourceId: 'tourn-roll',
      importedAt: 1000,
    })
    await client.executeMultiple(`
      INSERT INTO dim_detachment (id, name, faction_id, subfaction_id, dp) VALUES
        ('sm:gladius','Gladius','sm',NULL,2),
        ('sm:librarius','Librarius','sm',NULL,1);
      INSERT INTO dim_detachment_combo (id, faction_id, member_count, total_dp, is_legal, members)
        VALUES ('sm:gladius+librarius','sm',2,3,1,'Gladius + Librarius');
      INSERT INTO dim_detachment_combo_member (combo_id, detachment_id) VALUES
        ('sm:gladius+librarius','sm:gladius'),
        ('sm:gladius+librarius','sm:librarius');
      UPDATE meta_event_players SET combo_id='sm:gladius+librarius', detachment_id='sm:gladius'
        WHERE id='evt-roll-p1';
    `)

    await buildCubeForEvents(db, ['evt-roll'])

    const det = (await db.all(sql`
      SELECT detachment_id, games, wins, players FROM meta_top
      WHERE granularity_id = 3 AND meta_for_id = 'event:evt-roll' ORDER BY detachment_id
    `)) as Array<Record<string, unknown>>
    // BOTH members credited for the same game — the "any position" rule,
    // resolved at build time instead of per request.
    expect(det.map((d) => d.detachment_id)).toEqual(['sm:gladius', 'sm:librarius'])
    expect(det[0]!.games).toBe(1)
    expect(det[1]!.games).toBe(1)

    const combo = (await db.all(sql`
      SELECT combo_id, games, players FROM meta_top
      WHERE granularity_id = 4 AND meta_for_id = 'event:evt-roll'
    `)) as Array<Record<string, unknown>>
    // ONE row for the army, not one per member — the grain is per game.
    expect(combo).toHaveLength(1)
    expect(combo[0]!.combo_id).toBe('sm:gladius+librarius')
    expect(combo[0]!.games).toBe(1)
  })

  it('populates the SAME metric set at every granularity, not just Faction', async () => {
    // Three near-copies of the rollup writer each filled a different subset:
    // detachment and combo wrote zeros for player_pop_pct, over_rep and every
    // placement column, so the dashboard showed "Meta% 0.0%" and blank 1st/T4
    // on every row. SubFaction was never written at all while the selector
    // still offered it, so choosing it returned an empty table.
    //
    // This asserts the invariant rather than the values: whatever levels exist,
    // they all carry the same measures. A new granularity cannot ship
    // half-populated without failing here.
    await insertEvent(client, {
      id: 'evt-metrics',
      date: Date.UTC(2025, 5, 14),
      source: 'native',
      sourceId: 'tourn-metrics',
      importedAt: 1000,
    })
    await client.executeMultiple(`
      INSERT INTO dim_subfaction (id, name, faction_id) VALUES ('sm-sub','Ultramarines','sm');
      INSERT INTO dim_detachment (id, name, faction_id, subfaction_id, dp) VALUES
        ('sm:gladius','Gladius','sm',NULL,2),
        ('sm:librarius','Librarius','sm',NULL,1);
      INSERT INTO dim_detachment_combo (id, faction_id, member_count, total_dp, is_legal, members)
        VALUES ('sm:gladius+librarius','sm',2,3,1,'Gladius + Librarius');
      INSERT INTO dim_detachment_combo_member (combo_id, detachment_id) VALUES
        ('sm:gladius+librarius','sm:gladius'),
        ('sm:gladius+librarius','sm:librarius');
      UPDATE meta_event_players
        SET combo_id='sm:gladius+librarius', detachment_id='sm:gladius', subfaction_id='sm-sub'
        WHERE id='evt-metrics-p1';
      INSERT INTO meta_event_player_detachment (player_id, detachment_id, position, detachment_points)
        VALUES ('evt-metrics-p1','sm:gladius',1,2), ('evt-metrics-p1','sm:librarius',2,1);
    `)

    await buildCubeForEvents(db, ['evt-metrics'])

    const rows = (await db.all(sql`
      SELECT granularity_id, games, players, player_pop_pct, over_rep, event_wins, event_top4
      FROM meta_top WHERE meta_for_id = 'event:evt-metrics' ORDER BY granularity_id
    `)) as Array<Record<string, number>>

    // SubFaction (2), Detachment (3) and Combo (4) all present alongside Faction.
    const levels = [...new Set(rows.map((r) => r.granularity_id))].sort()
    expect(levels).toEqual([1, 2, 3, 4])

    // The player placed 1st, so every level that describes that army must say so
    // — not zero, which is what the old per-level copies wrote.
    for (const level of [2, 3, 4]) {
      const atLevel = rows.filter((r) => r.granularity_id === level)
      expect(atLevel.length).toBeGreaterThan(0)
      for (const r of atLevel) {
        expect(r.games).toBeGreaterThan(0)
        expect(r.players).toBeGreaterThan(0)
        expect(r.player_pop_pct).toBeGreaterThan(0)
        expect(r.over_rep).toBeGreaterThan(0)
        expect(r.event_wins).toBe(1)
        expect(r.event_top4).toBe(1)
      }
    }
  })

  it('is idempotent — calling twice for the same event does not duplicate fact rows', async () => {
    await insertEvent(client, {
      id: 'evt1',
      date: Date.UTC(2025, 5, 14),
      source: 'native',
      sourceId: 'tourn-1',
      importedAt: 1000,
    })

    await buildCubeForEvents(db, ['evt1'])
    await buildCubeForEvents(db, ['evt1'])

    const facts = await db.all(sql`SELECT * FROM fact_game_results`)
    expect(facts).toHaveLength(2)
  })

  it('handles multiple event ids in one call', async () => {
    await insertEvent(client, {
      id: 'evt1',
      date: Date.UTC(2025, 5, 14),
      source: 'native',
      sourceId: 'tourn-1',
      importedAt: 1000,
    })
    await insertEvent(client, {
      id: 'evt2',
      date: Date.UTC(2025, 5, 15),
      source: 'bcp',
      sourceId: 'bcp-1',
      importedAt: 2000,
    })

    await buildCubeForEvents(db, ['evt1', 'evt2'])

    const facts = await db.all(sql`SELECT * FROM fact_game_results`)
    expect(facts).toHaveLength(4)
  })

  it('no-ops gracefully for an empty event id list', async () => {
    await expect(buildCubeForEvents(db, [])).resolves.not.toThrow()
    const frames = await db.all(sql`SELECT * FROM meta_for`)
    expect(frames).toHaveLength(0)
  })
})

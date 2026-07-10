import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import { sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { buildCubeForEvents, generateFrames } from './meta-cube'

const CREATE_TABLES = `
CREATE TABLE IF NOT EXISTS dim_faction (id TEXT PRIMARY KEY, name TEXT NOT NULL, allegiance TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS dim_subfaction (id TEXT PRIMARY KEY, name TEXT NOT NULL, faction_id TEXT);
CREATE TABLE IF NOT EXISTS dim_detachment (id TEXT PRIMARY KEY, name TEXT NOT NULL, faction_id TEXT, subfaction_id TEXT);
CREATE TABLE IF NOT EXISTS dim_for_type (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS dim_granularity (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS dim_dataslate (id TEXT PRIMARY KEY, name TEXT NOT NULL, effective_date INTEGER NOT NULL, end_date INTEGER);
CREATE TABLE IF NOT EXISTS dim_tournament_pack (id TEXT PRIMARY KEY, name TEXT NOT NULL, effective_date INTEGER NOT NULL, end_date INTEGER);
CREATE TABLE IF NOT EXISTS dim_edition (id TEXT PRIMARY KEY, name TEXT NOT NULL, start_date INTEGER NOT NULL, end_date INTEGER);
CREATE TABLE IF NOT EXISTS meta_events (id TEXT PRIMARY KEY, name TEXT NOT NULL, date INTEGER NOT NULL, location TEXT, region_id INTEGER, format TEXT NOT NULL, rounds INTEGER, player_count INTEGER NOT NULL, source TEXT NOT NULL, source_id TEXT, imported_at INTEGER NOT NULL, win_faction_id TEXT, win_subfaction_id TEXT, win_detachment_id TEXT);
CREATE TABLE IF NOT EXISTS meta_event_players (id TEXT PRIMARY KEY, event_id TEXT NOT NULL, player_name TEXT NOT NULL, faction_id TEXT, subfaction_id TEXT, detachment_id TEXT, placement INTEGER NOT NULL, list_text TEXT, wins INTEGER NOT NULL DEFAULT 0, losses INTEGER NOT NULL DEFAULT 0, draws INTEGER NOT NULL DEFAULT 0, gl2_rating_start REAL, gl2_rd_start REAL, gl2_vol_start REAL, gl2_rating_end REAL, gl2_rd_end REAL, gl2_vol_end REAL);
CREATE TABLE IF NOT EXISTS meta_pairings (id TEXT PRIMARY KEY, event_id TEXT NOT NULL, round INTEGER NOT NULL, player1_id TEXT, player2_id TEXT, player1_score INTEGER, player2_score INTEGER, player1_gl2 REAL, player2_gl2 REAL, result TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS meta_for (id TEXT PRIMARY KEY, type_id INTEGER NOT NULL, date INTEGER NOT NULL, end_date INTEGER, day INTEGER, month INTEGER, quarter INTEGER, year INTEGER NOT NULL, dataslate_id TEXT, tourney_pack_id TEXT, edition_id TEXT);
CREATE TABLE IF NOT EXISTS fact_game_results (id TEXT PRIMARY KEY, event_id TEXT NOT NULL, player_id TEXT NOT NULL, opponent_id TEXT, round INTEGER NOT NULL, faction_id TEXT NOT NULL, subfaction_id TEXT, detachment_id TEXT, opponent_faction_id TEXT, opponent_subfaction_id TEXT, opponent_detachment_id TEXT, result REAL NOT NULL, player_score INTEGER, opponent_score INTEGER);
CREATE TABLE IF NOT EXISTS meta_top (id TEXT PRIMARY KEY, granularity_id INTEGER NOT NULL, faction_id TEXT NOT NULL, subfaction_id TEXT, detachment_id TEXT, meta_for_id TEXT NOT NULL, win_rate REAL NOT NULL, draw_rate REAL NOT NULL, over_rep REAL NOT NULL, four_oh_start REAL NOT NULL, event_wins INTEGER NOT NULL DEFAULT 0, event_finals INTEGER NOT NULL DEFAULT 0, event_top4 INTEGER NOT NULL DEFAULT 0, event_top8 INTEGER NOT NULL DEFAULT 0, event_top16 INTEGER NOT NULL DEFAULT 0, player_pop_pct REAL NOT NULL, wins INTEGER NOT NULL DEFAULT 0, losses INTEGER NOT NULL DEFAULT 0, draws INTEGER NOT NULL DEFAULT 0, games INTEGER NOT NULL DEFAULT 0, players INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS meta_cube_status (id INTEGER PRIMARY KEY DEFAULT 1, last_started_at INTEGER, last_completed_at INTEGER, last_event_id TEXT, status TEXT NOT NULL DEFAULT 'pending');
INSERT OR IGNORE INTO meta_cube_status (id, status) VALUES (1, 'pending');
`

function createTestDb() {
  const client = createClient({ url: ':memory:' })
  const db = createDbFromClient(client)
  return { client, db }
}

async function setupTables(client: ReturnType<typeof createClient>) {
  for (const stmt of CREATE_TABLES.split(';')
    .map((s) => s.trim())
    .filter(Boolean)) {
    await client.execute(stmt)
  }
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
  await client.execute({
    sql: `INSERT INTO dim_granularity VALUES (?, ?)`,
    args: [1, 'faction'],
  })
  await client.execute({
    sql: `INSERT INTO dim_for_type VALUES (?, ?)`,
    args: [1, 'event'],
  })
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

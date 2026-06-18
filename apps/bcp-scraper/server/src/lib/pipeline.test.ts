import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import { sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { generateFrames, runPipeline } from './pipeline'

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

// Seed: 1 event, 2 players (different factions), 1 pairing, 1 dataslate, 1 edition
async function seedData(client: ReturnType<typeof createClient>) {
  const eventDate = Date.UTC(2025, 5, 14) // June 14, 2025 (Saturday)

  await client.execute({
    sql: `INSERT INTO dim_faction VALUES (?, ?, ?)`,
    args: ['sm', 'Space Marines', 'imperium'],
  })
  await client.execute({
    sql: `INSERT INTO dim_faction VALUES (?, ?, ?)`,
    args: ['ork', 'Orks', 'xenos'],
  })
  await client.execute({
    sql: `INSERT INTO dim_edition VALUES (?, ?, ?, ?)`,
    args: ['10th', '10th Edition', Date.UTC(2023, 5, 1), null],
  })
  await client.execute({
    sql: `INSERT INTO dim_dataslate VALUES (?, ?, ?, ?)`,
    args: ['ds-2025q1', 'Q1 2025 Dataslate', Date.UTC(2025, 0, 1), null],
  })
  await client.execute({
    sql: `INSERT INTO dim_granularity VALUES (?, ?)`,
    args: [1, 'faction'],
  })
  await client.execute({
    sql: `INSERT INTO dim_for_type VALUES (?, ?)`,
    args: [1, 'event'],
  })
  await client.execute({
    sql: `INSERT INTO meta_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      'evt1',
      'Test GT',
      eventDate,
      'London',
      null,
      'GT',
      5,
      2,
      'bcp',
      'bcp-1',
      Date.now(),
      null,
      null,
      null,
    ],
  })
  await client.execute({
    sql: `INSERT INTO meta_event_players VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      'p1',
      'evt1',
      'Alice',
      'sm',
      null,
      null,
      1,
      null,
      3,
      2,
      0,
      null,
      null,
      null,
      null,
      null,
      null,
    ],
  })
  await client.execute({
    sql: `INSERT INTO meta_event_players VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      'p2',
      'evt1',
      'Bob',
      'ork',
      null,
      null,
      2,
      null,
      2,
      3,
      0,
      null,
      null,
      null,
      null,
      null,
      null,
    ],
  })
  await client.execute({
    sql: `INSERT INTO meta_pairings VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: ['pair1', 'evt1', 1, 'p1', 'p2', 80, 60, null, null, 'p1'],
  })
}

describe('generateFrames', () => {
  it('generates all frame types for a single event', () => {
    const eventDate = Date.UTC(2025, 5, 14) // June 14, 2025
    const events = [{ id: 'evt1', date: eventDate, name: 'Test GT' }]
    const dataslates = [{ id: 'ds1', effective_date: Date.UTC(2025, 0, 1), end_date: null }]
    const packs: any[] = []
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
    expect(eventFrame.dataslateId).toBe('ds1')
    expect(eventFrame.editionId).toBe('10th')
  })

  it('deduplicates frames with the same id', () => {
    // June 13 (Fri) and June 14 (Sat) 2025 — both map to Saturday June 14
    const events = [
      { id: 'evt1', date: Date.UTC(2025, 5, 13), name: 'GT 1' },
      { id: 'evt2', date: Date.UTC(2025, 5, 14), name: 'GT 2' }, // same weekend
    ]
    const frames = generateFrames(events, [], [], [])

    // Should have 2 event frames but only 1 weekend frame (same Saturday)
    const eventFrames = frames.filter((f) => f.id.startsWith('event:'))
    const weekendFrames = frames.filter((f) => f.id.startsWith('weekend:'))
    expect(eventFrames).toHaveLength(2)
    expect(weekendFrames).toHaveLength(1)
  })
})

describe('runPipeline', () => {
  let client: ReturnType<typeof createClient>
  let db: ReturnType<typeof createDbFromClient>

  beforeEach(async () => {
    const testDb = createTestDb()
    client = testDb.client
    db = testDb.db
    await setupTables(client)
    await seedData(client)
  })

  it('builds the full cube from seeded data', async () => {
    await runPipeline(db)

    // Check meta_cube_status
    const status = await db.all(sql`SELECT status FROM meta_cube_status WHERE id = 1`)
    expect(status[0].status).toBe('complete')

    // Check meta_for has frames
    const frames = await db.all(sql`SELECT * FROM meta_for`)
    expect(frames.length).toBeGreaterThan(0)

    // Should have event, weekend, month, quarter, year, dataslate, edition frames
    const typeIds = [...new Set(frames.map((f: any) => f.type_id))]
    expect(typeIds).toContain(1) // event
    expect(typeIds).toContain(5) // year

    // Check fact_game_results — 1 pairing → 2 fact rows
    const facts = await db.all(sql`SELECT * FROM fact_game_results`)
    expect(facts).toHaveLength(2)

    // Player 1 won — result should be 1.0 for p1 perspective
    const p1Fact = facts.find((f: any) => f.player_id === 'p1') as any
    expect(p1Fact.result).toBe(1.0)
    expect(p1Fact.faction_id).toBe('sm')
    expect(p1Fact.opponent_faction_id).toBe('ork')
    expect(p1Fact.player_score).toBe(80)
    expect(p1Fact.opponent_score).toBe(60)

    const p2Fact = facts.find((f: any) => f.player_id === 'p2') as any
    expect(p2Fact.result).toBe(0.0)
    expect(p2Fact.faction_id).toBe('ork')

    // Check meta_top has rows
    const tops = await db.all(sql`SELECT * FROM meta_top`)
    expect(tops.length).toBeGreaterThan(0)

    // Should have faction-level aggregations
    const smTop = tops.find((t: any) => t.faction_id === 'sm') as any
    expect(smTop).toBeDefined()
    expect(smTop.wins).toBe(3)
    expect(smTop.losses).toBe(2)
    expect(smTop.players).toBe(1)
    expect(smTop.win_rate).toBeGreaterThan(0)
  })

  it('sets status to failed on error', async () => {
    // Drop a required table to cause an error
    await client.execute('DROP TABLE meta_pairings')

    await expect(runPipeline(db)).rejects.toThrow()

    const status = await db.all(sql`SELECT status FROM meta_cube_status WHERE id = 1`)
    expect(status[0].status).toBe('failed')
  })

  it('clears existing cube data before rebuild', async () => {
    // Run pipeline twice — second run should not duplicate data
    await runPipeline(db)
    await runPipeline(db)

    const facts = await db.all(sql`SELECT * FROM fact_game_results`)
    // Still only 2 fact rows (1 pairing × 2 perspectives)
    expect(facts).toHaveLength(2)
  })
})

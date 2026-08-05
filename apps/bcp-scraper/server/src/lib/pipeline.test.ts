import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import { applyTestSchema, seedReferenceDims } from '@tabletop-tools/db/src/test-schema'
import { sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { generateFrames, runPipeline } from './pipeline'

const SEED = `
INSERT OR IGNORE INTO meta_cube_status (id, status) VALUES (1, 'pending');
`

function createTestDb() {
  const client = createClient({ url: ':memory:' })
  const db = createDbFromClient(client)
  return { client, db }
}

async function setupTables(client: ReturnType<typeof createClient>) {
  // Real schema from the committed migrations — see packages/db test-schema.
  await applyTestSchema(client)
  await seedReferenceDims(client)
  await client.executeMultiple(SEED)
}

// Seed: 1 event, 2 players (different factions), 5 pairings, 1 dataslate, 1 edition
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
  // dim_granularity / dim_for_type come from seedReferenceDims()
  await client.execute({
    sql: `INSERT INTO meta_events
            (id, name, date, location, region_id, format, rounds, player_count,
             source, source_id, imported_at,
             win_faction_id, win_subfaction_id, win_detachment_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    sql: `INSERT INTO meta_event_players
            (id, event_id, player_name, faction_id, subfaction_id, detachment_id,
             placement, list_text, wins, losses, draws,
             gl2_rating_start, gl2_rd_start, gl2_vol_start,
             gl2_rating_end, gl2_rd_end, gl2_vol_end)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    sql: `INSERT INTO meta_event_players
            (id, event_id, player_name, faction_id, subfaction_id, detachment_id,
             placement, list_text, wins, losses, draws,
             gl2_rating_start, gl2_rd_start, gl2_vol_start,
             gl2_rating_end, gl2_rd_end, gl2_vol_end)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
  // Five rounds, matching the records declared above: Alice (sm) 3-2, Bob
  // (ork) 2-3. The fixture used to seed a single pairing while both players
  // claimed a five-round record, which only passed because faction rollups
  // copied meta_event_players.wins/losses straight across. They are derived
  // from fact_game_results now — one row per player per game — so a rollup
  // that sums correctly and a rollup that copies one game are no longer the
  // same number, and the fixture has to mean what it says.
  const rounds: Array<{ p1Score: number; p2Score: number; winner: string }> = [
    { p1Score: 80, p2Score: 60, winner: 'p1' },
    { p1Score: 75, p2Score: 65, winner: 'p1' },
    { p1Score: 90, p2Score: 40, winner: 'p1' },
    { p1Score: 55, p2Score: 70, winner: 'p2' },
    { p1Score: 50, p2Score: 85, winner: 'p2' },
  ]

  for (const [i, r] of rounds.entries()) {
    await client.execute({
      sql: `INSERT INTO meta_pairings VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [`pair${i + 1}`, 'evt1', i + 1, 'p1', 'p2', r.p1Score, r.p2Score, null, null, r.winner],
    })
  }
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
    const status = (await db.all(sql`SELECT status FROM meta_cube_status WHERE id = 1`)) as Array<{
      status: string
    }>
    expect(status[0]!.status).toBe('complete')

    // Check meta_for has frames
    const frames = await db.all(sql`SELECT * FROM meta_for`)
    expect(frames.length).toBeGreaterThan(0)

    // Should have event, weekend, month, quarter, year, dataslate, edition frames
    const typeIds = [...new Set(frames.map((f: any) => f.type_id))]
    expect(typeIds).toContain(1) // event
    expect(typeIds).toContain(5) // year

    // Check fact_game_results — 5 pairings → one row per player per game
    const facts = await db.all(sql`SELECT * FROM fact_game_results`)
    expect(facts).toHaveLength(10)

    // Round 1: player 1 won 80-60, so result is 1.0 from the p1 perspective
    // and 0.0 from p2's. Anchored on the round rather than taking whichever
    // row came back first, now that each player has five of them.
    const p1Fact = facts.find((f: any) => f.player_id === 'p1' && f.round === 1) as any
    expect(p1Fact.result).toBe(1.0)
    expect(p1Fact.faction_id).toBe('sm')
    expect(p1Fact.opponent_faction_id).toBe('ork')
    expect(p1Fact.player_score).toBe(80)
    expect(p1Fact.opponent_score).toBe(60)

    const p2Fact = facts.find((f: any) => f.player_id === 'p2' && f.round === 1) as any
    expect(p2Fact.result).toBe(0.0)
    expect(p2Fact.faction_id).toBe('ork')

    // Both players' declared records are reproduced by summing the facts.
    expect(facts.filter((f: any) => f.player_id === 'p1' && f.result === 1.0)).toHaveLength(3)
    expect(facts.filter((f: any) => f.player_id === 'p2' && f.result === 1.0)).toHaveLength(2)

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

    const status = (await db.all(sql`SELECT status FROM meta_cube_status WHERE id = 1`)) as Array<{
      status: string
    }>
    expect(status[0]!.status).toBe('failed')
  })

  it('clears existing cube data before rebuild', async () => {
    // Run pipeline twice — second run should not duplicate data
    await runPipeline(db)
    await runPipeline(db)

    const facts = await db.all(sql`SELECT * FROM fact_game_results`)
    // Still 10 rows, not 20 — 5 pairings × 2 perspectives, written once.
    expect(facts).toHaveLength(10)
  })
})

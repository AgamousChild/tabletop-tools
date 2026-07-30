import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import { beforeEach, describe, expect, it } from 'vitest'

import { upsertMetaEvent } from './meta-ingest'

const CREATE_TABLES = `
CREATE TABLE IF NOT EXISTS dim_faction (id TEXT PRIMARY KEY, name TEXT NOT NULL, allegiance TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS dim_faction_alias (alias TEXT PRIMARY KEY, faction_id TEXT NOT NULL REFERENCES dim_faction(id));
CREATE TABLE IF NOT EXISTS dim_subfaction (id TEXT PRIMARY KEY, name TEXT NOT NULL, faction_id TEXT);
CREATE TABLE IF NOT EXISTS dim_detachment (id TEXT PRIMARY KEY, name TEXT NOT NULL, faction_id TEXT, subfaction_id TEXT);
CREATE TABLE IF NOT EXISTS dim_for_type (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS dim_granularity (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS dim_dataslate (id TEXT PRIMARY KEY, name TEXT NOT NULL, effective_date INTEGER NOT NULL, end_date INTEGER);
CREATE TABLE IF NOT EXISTS dim_tournament_pack (id TEXT PRIMARY KEY, name TEXT NOT NULL, effective_date INTEGER NOT NULL, end_date INTEGER);
CREATE TABLE IF NOT EXISTS dim_edition (id TEXT PRIMARY KEY, name TEXT NOT NULL, start_date INTEGER NOT NULL, end_date INTEGER);
CREATE TABLE IF NOT EXISTS "user" (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, username TEXT UNIQUE, display_username TEXT UNIQUE, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS meta_events (id TEXT PRIMARY KEY, name TEXT NOT NULL, date INTEGER NOT NULL, location TEXT, gps_coords TEXT, region_id INTEGER, format TEXT NOT NULL, rounds INTEGER, player_count INTEGER NOT NULL, source TEXT NOT NULL, source_id TEXT, imported_at INTEGER NOT NULL, win_faction_id TEXT, win_subfaction_id TEXT, win_detachment_id TEXT, UNIQUE(source, source_id));
CREATE TABLE IF NOT EXISTS meta_event_players (id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES meta_events(id) ON DELETE CASCADE, player_name TEXT NOT NULL, source_player_id TEXT, faction_id TEXT NOT NULL, subfaction_id TEXT, detachment_id TEXT, placement INTEGER NOT NULL, source_list_id TEXT, list_text TEXT, list_ttt TEXT, combo_id TEXT, wins INTEGER NOT NULL DEFAULT 0, losses INTEGER NOT NULL DEFAULT 0, draws INTEGER NOT NULL DEFAULT 0, gl2_rating_start REAL, gl2_rd_start REAL, gl2_vol_start REAL, gl2_rating_end REAL, gl2_rd_end REAL, gl2_vol_end REAL);
CREATE TABLE IF NOT EXISTS meta_pairings (id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES meta_events(id) ON DELETE CASCADE, round INTEGER NOT NULL, player1_id TEXT NOT NULL, player2_id TEXT NOT NULL, player1_score INTEGER, player2_score INTEGER, player1_gl2 REAL, player2_gl2 REAL, result TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS meta_for (id TEXT PRIMARY KEY, type_id INTEGER NOT NULL, date INTEGER NOT NULL, end_date INTEGER, day INTEGER, month INTEGER, quarter INTEGER, year INTEGER NOT NULL, dataslate_id TEXT, tourney_pack_id TEXT, edition_id TEXT);
CREATE TABLE IF NOT EXISTS fact_game_results (id TEXT PRIMARY KEY, event_id TEXT NOT NULL, player_id TEXT NOT NULL, opponent_id TEXT, round INTEGER NOT NULL, faction_id TEXT NOT NULL, subfaction_id TEXT, detachment_id TEXT, opponent_faction_id TEXT, opponent_subfaction_id TEXT, opponent_detachment_id TEXT, result REAL NOT NULL, player_score INTEGER, opponent_score INTEGER);
CREATE TABLE IF NOT EXISTS meta_top (id TEXT PRIMARY KEY, granularity_id INTEGER NOT NULL, faction_id TEXT NOT NULL, subfaction_id TEXT, detachment_id TEXT, meta_for_id TEXT NOT NULL, win_rate REAL NOT NULL, draw_rate REAL NOT NULL, over_rep REAL NOT NULL, four_oh_start REAL NOT NULL, event_wins INTEGER NOT NULL DEFAULT 0, event_finals INTEGER NOT NULL DEFAULT 0, event_top4 INTEGER NOT NULL DEFAULT 0, event_top8 INTEGER NOT NULL DEFAULT 0, event_top16 INTEGER NOT NULL DEFAULT 0, player_pop_pct REAL NOT NULL, wins INTEGER NOT NULL DEFAULT 0, losses INTEGER NOT NULL DEFAULT 0, draws INTEGER NOT NULL DEFAULT 0, games INTEGER NOT NULL DEFAULT 0, players INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS meta_cube_status (id INTEGER PRIMARY KEY DEFAULT 1, last_started_at INTEGER, last_completed_at INTEGER, last_event_id TEXT, status TEXT NOT NULL DEFAULT 'pending');
CREATE TABLE IF NOT EXISTS player_glicko (id TEXT PRIMARY KEY, user_id TEXT REFERENCES "user"(id), player_name TEXT NOT NULL, rating REAL NOT NULL DEFAULT 1500, rating_deviation REAL NOT NULL DEFAULT 350, volatility REAL NOT NULL DEFAULT 0.06, games_played INTEGER NOT NULL DEFAULT 0, last_rating_period TEXT, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS glicko_history (id TEXT PRIMARY KEY, player_id TEXT NOT NULL REFERENCES player_glicko(id), rating_period TEXT NOT NULL, rating_before REAL NOT NULL, rd_before REAL NOT NULL, rating_after REAL NOT NULL, rd_after REAL NOT NULL, volatility_after REAL NOT NULL, delta REAL NOT NULL, games_in_period INTEGER NOT NULL, recorded_at INTEGER NOT NULL);
INSERT OR IGNORE INTO dim_faction (id, name, allegiance) VALUES ('unknown', 'Unknown', 'unknown');
`

function createTestDb() {
  const client = createClient({ url: ':memory:' })
  const db = createDbFromClient(client)
  return { client, db }
}

async function setupTables(client: ReturnType<typeof createClient>) {
  await client.executeMultiple(CREATE_TABLES)
  await client.execute({
    sql: `INSERT INTO dim_faction VALUES (?, ?, ?)`,
    args: ['aeldari', 'Aeldari', 'xenos'],
  })
  await client.execute({
    sql: `INSERT INTO dim_faction VALUES (?, ?, ?)`,
    args: ['necrons', 'Necrons', 'xenos'],
  })
}

describe('upsertMetaEvent', () => {
  let client: ReturnType<typeof createClient>
  let db: ReturnType<typeof createDbFromClient>

  beforeEach(async () => {
    const testDb = createTestDb()
    client = testDb.client
    db = testDb.db
    await setupTables(client)
  })

  it('rejects an empty sourceId at runtime', async () => {
    await expect(
      upsertMetaEvent(db, {
        source: 'csv-import',
        sourceId: '',
        name: 'Empty Source Test',
        date: Date.now(),
        format: 'GT',
        players: [],
        pairings: [],
      }),
    ).rejects.toThrow(/sourceId/i)
  })

  it('uses the explicit playerCount override when the source reports a registered count independent of the players array (BCP partial-scrape case)', async () => {
    const { eventId } = await upsertMetaEvent(db, {
      source: 'bcp',
      sourceId: 'bcp-partial',
      name: 'Partial Scrape GT',
      date: 1000,
      format: 'GT',
      playerCount: 32, // BCP reports 32 registered, but only 2 recovered from pairing data
      players: [
        { playerName: 'Alice', faction: 'aeldari', placement: 1, wins: 1, losses: 0, draws: 0 },
        { playerName: 'Bob', faction: 'necrons', placement: 2, wins: 0, losses: 1, draws: 0 },
      ],
      pairings: [],
    })

    const eventRows = await client.execute({
      sql: `SELECT * FROM meta_events WHERE id = ?`,
      args: [eventId],
    })
    expect(eventRows.rows[0]!.player_count).toBe(32)
  })

  it('defaults playerCount to players.length when no override is given', async () => {
    const { eventId } = await upsertMetaEvent(db, {
      source: 'csv-import',
      sourceId: 'csv-default-count',
      name: 'Default Count Test',
      date: 1000,
      format: 'GT',
      players: [
        { playerName: 'Alice', faction: 'aeldari', placement: 1, wins: 1, losses: 0, draws: 0 },
      ],
      pairings: [],
    })

    const eventRows = await client.execute({
      sql: `SELECT * FROM meta_events WHERE id = ?`,
      args: [eventId],
    })
    expect(eventRows.rows[0]!.player_count).toBe(1)
  })

  it('writes a meta event, players, and pairings (happy path)', async () => {
    const { eventId } = await upsertMetaEvent(db, {
      source: 'native',
      sourceId: 'tourn-1',
      name: 'Happy Path GT',
      date: 1700000000000,
      location: 'Springfield',
      format: '2000pts',
      rounds: 1,
      players: [
        { playerName: 'Alice', faction: 'aeldari', placement: 1, wins: 1, losses: 0, draws: 0 },
        { playerName: 'Bob', faction: 'necrons', placement: 2, wins: 0, losses: 1, draws: 0 },
      ],
      pairings: [
        {
          round: 1,
          player1Index: 0,
          player2Index: 1,
          player1Score: 85,
          player2Score: 60,
          result: 'p1',
        },
      ],
    })

    expect(eventId).toBeTruthy()

    const eventRows = await client.execute({
      sql: `SELECT * FROM meta_events WHERE id = ?`,
      args: [eventId],
    })
    expect(eventRows.rows).toHaveLength(1)
    expect(eventRows.rows[0]!.name).toBe('Happy Path GT')
    expect(eventRows.rows[0]!.source).toBe('native')
    expect(eventRows.rows[0]!.source_id).toBe('tourn-1')
    expect(eventRows.rows[0]!.player_count).toBe(2)

    const playerRows = await client.execute({
      sql: `SELECT * FROM meta_event_players WHERE event_id = ? ORDER BY placement`,
      args: [eventId],
    })
    expect(playerRows.rows).toHaveLength(2)
    expect(playerRows.rows[0]!.player_name).toBe('Alice')
    expect(playerRows.rows[0]!.faction_id).toBe('aeldari')
    expect(playerRows.rows[1]!.player_name).toBe('Bob')

    const pairingRows = await client.execute({
      sql: `SELECT * FROM meta_pairings WHERE event_id = ?`,
      args: [eventId],
    })
    expect(pairingRows.rows).toHaveLength(1)
    expect(pairingRows.rows[0]!.result).toBe('p1')
    expect(pairingRows.rows[0]!.player1_score).toBe(85)
  })

  it('re-upserting the same (source, sourceId) replaces rather than duplicates', async () => {
    const first = await upsertMetaEvent(db, {
      source: 'native',
      sourceId: 'tourn-dup',
      name: 'First Version',
      date: 1000,
      format: 'GT',
      players: [
        { playerName: 'Alice', faction: 'aeldari', placement: 1, wins: 1, losses: 0, draws: 0 },
      ],
      pairings: [],
    })

    const second = await upsertMetaEvent(db, {
      source: 'native',
      sourceId: 'tourn-dup',
      name: 'Second Version (re-export)',
      date: 1000,
      format: 'GT',
      players: [
        { playerName: 'Alice', faction: 'aeldari', placement: 1, wins: 2, losses: 0, draws: 0 },
        { playerName: 'Carol', faction: 'necrons', placement: 2, wins: 0, losses: 2, draws: 0 },
      ],
      pairings: [],
    })

    // The row is replaced (new id is fine — what matters is exactly one event row for this source/sourceId)
    expect(second.eventId).toBeTruthy()

    const allEvents = await client.execute({
      sql: `SELECT * FROM meta_events WHERE source = 'native' AND source_id = 'tourn-dup'`,
      args: [],
    })
    expect(allEvents.rows).toHaveLength(1)
    expect(allEvents.rows[0]!.name).toBe('Second Version (re-export)')
    expect(allEvents.rows[0]!.player_count).toBe(2)

    // Old event's children must be gone too (cascade / explicit cleanup)
    const oldPlayers = await client.execute({
      sql: `SELECT * FROM meta_event_players WHERE event_id = ?`,
      args: [first.eventId],
    })
    expect(oldPlayers.rows).toHaveLength(0)
  })

  it('resolves unknown factions to the unknown dim_faction row rather than failing', async () => {
    const { eventId } = await upsertMetaEvent(db, {
      source: 'csv-import',
      sourceId: 'csv-1',
      name: 'Unknown Faction Test',
      date: 1000,
      format: 'GT',
      players: [
        {
          playerName: 'Dave',
          faction: 'Some Homebrew Faction',
          placement: 1,
          wins: 1,
          losses: 0,
          draws: 0,
        },
      ],
      pairings: [],
    })

    const playerRows = await client.execute({
      sql: `SELECT * FROM meta_event_players WHERE event_id = ?`,
      args: [eventId],
    })
    expect(playerRows.rows[0]!.faction_id).toBe('unknown')
  })

  it('scopes cube rows (fact_game_results) to only the event just written', async () => {
    // Seed dim_for_type / dim_granularity needed by the cube builder
    await client.execute({ sql: `INSERT INTO dim_for_type VALUES (1, 'event')`, args: [] })
    await client.execute({ sql: `INSERT INTO dim_granularity VALUES (1, 'faction')`, args: [] })

    // Write an unrelated event directly (simulating another writer's row landing concurrently,
    // bypassing upsertMetaEvent so it has no fact_game_results yet)
    await client.execute({
      sql: `INSERT INTO meta_events (id, name, date, format, player_count, source, source_id, imported_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: ['other-evt', 'Other Event', 2000, 'GT', 0, 'bcp', 'bcp-other', Date.now()],
    })

    const { eventId } = await upsertMetaEvent(db, {
      source: 'native',
      sourceId: 'tourn-scoped',
      name: 'Scoped Cube Test',
      date: 1700000000000,
      format: 'GT',
      players: [
        { playerName: 'Alice', faction: 'aeldari', placement: 1, wins: 1, losses: 0, draws: 0 },
        { playerName: 'Bob', faction: 'necrons', placement: 2, wins: 0, losses: 1, draws: 0 },
      ],
      pairings: [
        {
          round: 1,
          player1Index: 0,
          player2Index: 1,
          player1Score: 80,
          player2Score: 40,
          result: 'p1',
        },
      ],
    })

    const facts = await client.execute(`SELECT * FROM fact_game_results`)
    expect(facts.rows).toHaveLength(2) // 1 pairing -> 2 perspectives, only for our event
    expect(facts.rows.every((r) => r.event_id === eventId)).toBe(true)

    // The "other" event must NOT have been cubed by our call
    const otherFrame = await client.execute({
      sql: `SELECT * FROM meta_for WHERE id = ?`,
      args: ['event:other-evt'],
    })
    expect(otherFrame.rows).toHaveLength(0)
  })

  it('writes Glicko ratings exactly once per player using real pairing data', async () => {
    await upsertMetaEvent(db, {
      source: 'native',
      sourceId: 'tourn-glicko',
      name: 'Glicko Test',
      date: 1000,
      format: 'GT',
      players: [
        { playerName: 'Alice', faction: 'aeldari', placement: 1, wins: 1, losses: 0, draws: 0 },
        { playerName: 'Bob', faction: 'necrons', placement: 2, wins: 0, losses: 1, draws: 0 },
      ],
      pairings: [
        {
          round: 1,
          player1Index: 0,
          player2Index: 1,
          player1Score: 80,
          player2Score: 40,
          result: 'p1',
        },
      ],
    })

    const glickoRows = await client.execute(
      `SELECT * FROM player_glicko WHERE player_name IN ('Alice', 'Bob') ORDER BY player_name`,
    )
    expect(glickoRows.rows).toHaveLength(2)
    // Alice won — rating should have moved up from the 1500 default
    const alice = glickoRows.rows[0]!
    expect(Number(alice.rating)).toBeGreaterThan(1500)
    expect(Number(alice.games_played)).toBe(1)

    const historyRows = await client.execute(`SELECT * FROM glicko_history`)
    expect(historyRows.rows).toHaveLength(2) // one per player, not duplicated

    // Sanity: re-running with different sourceId shouldn't touch the first event's history rows
    const beforeCount = historyRows.rows.length
    await upsertMetaEvent(db, {
      source: 'native',
      sourceId: 'tourn-glicko-2',
      name: 'Glicko Test 2',
      date: 2000,
      format: 'GT',
      players: [
        { playerName: 'Alice', faction: 'aeldari', placement: 1, wins: 1, losses: 0, draws: 0 },
        { playerName: 'Carol', faction: 'necrons', placement: 2, wins: 0, losses: 1, draws: 0 },
      ],
      pairings: [
        {
          round: 1,
          player1Index: 0,
          player2Index: 1,
          player1Score: 80,
          player2Score: 40,
          result: 'p1',
        },
      ],
    })
    const afterHistory = await client.execute(`SELECT * FROM glicko_history`)
    expect(afterHistory.rows.length).toBe(beforeCount + 2) // +1 Alice (again), +1 Carol (new)
  })

  it('synthesizes Glicko games from W/L/D when no pairings are provided (CSV-without-pairing-data case)', async () => {
    await upsertMetaEvent(db, {
      source: 'csv-import',
      sourceId: 'csv-no-pairings',
      name: 'CSV No Pairings',
      date: 1000,
      format: 'GT',
      players: [
        { playerName: 'Eve', faction: 'aeldari', placement: 1, wins: 3, losses: 1, draws: 0 },
      ],
      pairings: [],
    })

    const glickoRows = await client.execute(`SELECT * FROM player_glicko WHERE player_name = 'Eve'`)
    expect(glickoRows.rows).toHaveLength(1)
    // 3 wins + 1 loss against synthesized average opponents should move rating up
    expect(Number(glickoRows.rows[0]!.games_played)).toBe(4)
    expect(Number(glickoRows.rows[0]!.rating)).toBeGreaterThan(1500)
  })
})

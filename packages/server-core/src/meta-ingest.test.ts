import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import { applyTestSchema, seedReferenceDims } from '@tabletop-tools/db/src/test-schema'
import { sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { upsertMetaEvent } from './meta-ingest'

function createTestDb() {
  const client = createClient({ url: ':memory:' })
  const db = createDbFromClient(client)
  return { client, db }
}

async function setupTables(client: ReturnType<typeof createClient>) {
  // Real schema from the committed migrations — no hand-rolled DDL to drift
  // when a shared table gains a column.
  await applyTestSchema(client)
  await seedReferenceDims(client)
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

  it('costs round trips per EVENT, not per player — a 4x roster is not 4x the requests', async () => {
    // A 129-event refresh took ~4 hours. Every player cost 1-2 SELECTs inside
    // resolveFaction plus its own INSERT, and Glicko added an update and a
    // history insert each. Faction lookup is now preloaded once and the writes
    // go in batches, so what remains scales with FRAMES (a handful per event),
    // not with the roster.
    //
    // Asserting the ratio rather than a magic number: the absolute count
    // depends on how many cube frames an event date produces, which is not what
    // this is guarding.
    const ingest = async (sourceId: string, size: number) => {
      let roundTrips = 0
      const countingClient = new Proxy(client, {
        get(target, prop, receiver) {
          const value = Reflect.get(target, prop, receiver)
          if (prop === 'execute' || prop === 'batch') {
            return (...args: unknown[]) => {
              roundTrips++
              return (value as (...a: unknown[]) => unknown).apply(target, args)
            }
          }
          return typeof value === 'function' ? value.bind(target) : value
        },
      })
      const { eventId } = await upsertMetaEvent(createDbFromClient(countingClient), {
        source: 'bcp',
        sourceId,
        name: `Round Trip ${size}`,
        date: Date.UTC(2025, 5, 14),
        format: 'GT',
        players: Array.from({ length: size }, (_, i) => ({
          playerName: `${sourceId}-P${i}`,
          faction: i % 2 === 0 ? 'aeldari' : 'necrons',
          placement: i + 1,
          wins: 3,
          losses: 2,
          draws: 0,
        })),
        pairings: Array.from({ length: size / 2 }, (_, i) => ({
          round: 1,
          player1Index: i * 2,
          player2Index: i * 2 + 1,
          player1Score: 80,
          player2Score: 60,
          result: 'p1' as const,
        })),
      })
      return { roundTrips, eventId }
    }

    const small = await ingest('rt-small', 20)
    const large = await ingest('rt-large', 80)

    // Unbatched this was ~1 request per player: 20 -> ~130, 80 -> ~500.
    expect(large.roundTrips).toBeLessThan(small.roundTrips + 10)

    // ...and the data is still correct.
    const rows = (await db.all(
      sql`SELECT COUNT(*) AS n FROM meta_event_players WHERE event_id = ${large.eventId}`,
    )) as unknown as Array<{ n: number }>
    expect(rows[0]!.n).toBe(80)
    const pairRows = (await db.all(
      sql`SELECT COUNT(*) AS n FROM meta_pairings WHERE event_id = ${large.eventId}`,
    )) as unknown as Array<{ n: number }>
    expect(pairRows[0]!.n).toBe(40)
    // Factions still resolve through the preloaded map, and Glicko still ran.
    const factions = (await db.all(
      sql`SELECT DISTINCT faction_id AS f FROM meta_event_players WHERE event_id = ${large.eventId} ORDER BY f`,
    )) as unknown as Array<{ f: string }>
    expect(factions.map((r) => r.f)).toEqual(['aeldari', 'necrons'])
    const rated = (await db.all(
      sql`SELECT COUNT(*) AS n FROM player_glicko WHERE last_rating_period = ${large.eventId}`,
    )) as unknown as Array<{ n: number }>
    expect(rated[0]!.n).toBe(80)
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
    // dim_for_type / dim_granularity come from seedReferenceDims()

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

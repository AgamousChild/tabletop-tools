/**
 * Meta analytics cube builder — shared, event-scoped.
 *
 * Populates meta_for / fact_game_results / meta_top from the 3NF meta tables
 * (meta_events / meta_event_players / meta_pairings) for a specific set of
 * event ids.
 *
 * D2-01: extracted from apps/bcp-scraper/server/src/lib/pipeline.ts, which
 * previously selected "events since the last cube run" via an unscoped
 * `WHERE imported_at > lastCompleted` query — it cubed every writer's rows
 * (native tournament exports, CSV imports, BCP scrapes) whenever any of them
 * landed a row, with no `source` filter. Callers now pass explicit event
 * ids, so `upsertMetaEvent()` can cube exactly the event it just wrote
 * without racing or double-processing another writer's concurrent insert.
 *
 * `apps/bcp-scraper`'s `runPipeline()` keeps its own watermark bookkeeping
 * (meta_cube_status) for its periodic full-catch-up sweep, but delegates
 * the actual cube-building work to `buildCubeForEvents()` here.
 */
import type { Db } from '@tabletop-tools/db'
import { type SQL, sql } from 'drizzle-orm'

import { generateId } from './id'

// ── Frame of Reference generation ─────────────────────────────────────────────

export interface EventRow {
  id: string
  date: number
  name: string
}

interface DimRow {
  id: string
  effective_date: number
  end_date: number | null
}

interface EditionRow {
  id: string
  start_date: number
  end_date: number | null
}

export interface Frame {
  id: string
  typeId: number
  date: number
  endDate: number | null
  day: number | null
  month: number | null
  quarter: number | null
  year: number
  dataslateId: string | null
  packId: string | null
  editionId: string | null
}

export function generateFrames(
  events: EventRow[],
  dataslates: DimRow[],
  packs: DimRow[],
  editions: EditionRow[],
): Frame[] {
  const frames: Frame[] = []
  const seen = new Set<string>()

  function add(f: Frame) {
    if (seen.has(f.id)) return
    seen.add(f.id)
    frames.push(f)
  }

  for (const event of events) {
    const d = new Date(event.date)
    const year = d.getUTCFullYear()
    const month = d.getUTCMonth() + 1
    const quarter = Math.ceil(month / 3)
    const day = d.getUTCDate()

    const dsId =
      dataslates.find(
        (ds) => event.date >= ds.effective_date && (!ds.end_date || event.date <= ds.end_date),
      )?.id ?? null
    const tpId =
      packs.find(
        (tp) => event.date >= tp.effective_date && (!tp.end_date || event.date <= tp.end_date),
      )?.id ?? null
    const edId =
      editions.find(
        (ed) => event.date >= ed.start_date && (!ed.end_date || event.date <= ed.end_date),
      )?.id ?? null

    const dayOfWeek = d.getUTCDay()
    const saturday = new Date(d)
    saturday.setUTCDate(d.getUTCDate() - dayOfWeek + 6)
    const weekendStr = saturday.toISOString().slice(0, 10)

    add({
      id: `event:${event.id}`,
      typeId: 1,
      date: event.date,
      endDate: null,
      day,
      month,
      quarter: null,
      year,
      dataslateId: dsId,
      packId: tpId,
      editionId: edId,
    })
    add({
      id: `weekend:${weekendStr}`,
      typeId: 2,
      date: saturday.getTime(),
      endDate: null,
      day: null,
      month,
      quarter: null,
      year,
      dataslateId: dsId,
      packId: tpId,
      editionId: edId,
    })
    add({
      id: `month:${year}-${String(month).padStart(2, '0')}`,
      typeId: 3,
      date: new Date(Date.UTC(year, month - 1, 1)).getTime(),
      endDate: new Date(Date.UTC(year, month, 0)).getTime(),
      day: null,
      month,
      quarter: null,
      year,
      dataslateId: dsId,
      packId: tpId,
      editionId: edId,
    })
    add({
      id: `quarter:${year}:${quarter}`,
      typeId: 4,
      date: new Date(Date.UTC(year, (quarter - 1) * 3, 1)).getTime(),
      endDate: new Date(Date.UTC(year, quarter * 3, 0)).getTime(),
      day: null,
      month: null,
      quarter,
      year,
      dataslateId: dsId,
      packId: tpId,
      editionId: edId,
    })
    add({
      id: `year:${year}`,
      typeId: 5,
      date: new Date(Date.UTC(year, 0, 1)).getTime(),
      endDate: new Date(Date.UTC(year, 11, 31)).getTime(),
      day: null,
      month: null,
      quarter: null,
      year,
      dataslateId: null,
      packId: null,
      editionId: edId,
    })
  }

  for (const ds of dataslates) {
    const d = new Date(ds.effective_date)
    add({
      id: `dataslate:${ds.id}`,
      typeId: 6,
      date: ds.effective_date,
      endDate: ds.end_date,
      day: null,
      month: null,
      quarter: null,
      year: d.getUTCFullYear(),
      dataslateId: ds.id,
      packId: null,
      editionId: null,
    })
  }
  for (const tp of packs) {
    const d = new Date(tp.effective_date)
    add({
      id: `pack:${tp.id}`,
      typeId: 7,
      date: tp.effective_date,
      endDate: tp.end_date,
      day: null,
      month: null,
      quarter: null,
      year: d.getUTCFullYear(),
      dataslateId: null,
      packId: tp.id,
      editionId: null,
    })
  }
  for (const ed of editions) {
    const d = new Date(ed.start_date)
    add({
      id: `edition:${ed.id}`,
      typeId: 8,
      date: ed.start_date,
      endDate: ed.end_date,
      day: null,
      month: null,
      quarter: null,
      year: d.getUTCFullYear(),
      dataslateId: null,
      packId: null,
      editionId: ed.id,
    })
  }

  return frames
}

// ── Scoped cube build ──────────────────────────────────────────────────────

/**
 * Build (or refresh) the analytics cube for a specific set of meta events.
 *
 * Idempotent per event: re-running for the same event id first deletes that
 * event's existing fact_game_results rows, so repeated calls (e.g. a
 * delete-then-reinsert upsert) never duplicate fact rows. meta_top rows for
 * any frame touched by these events are fully rebuilt from the underlying
 * 3NF tables, not incremented, so aggregates stay correct across re-imports.
 *
 * No-ops for an empty eventIds array.
 */
export interface BuildCubeOptions {
  /**
   * Called once per event and once per frame, with a one-line progress string.
   *
   * A 400-event rebuild takes over an hour and used to print exactly one line,
   * so a failure told you only that it happened somewhere in that hour. Every
   * unit of work reports itself now: which event, how many pairings, how long.
   */
  onProgress?: (message: string) => void
}

export async function buildCubeForEvents(
  db: Db,
  eventIds: string[],
  opts: BuildCubeOptions = {},
): Promise<void> {
  const report = opts.onProgress ?? (() => {})
  if (eventIds.length === 0) return

  const rows = (await db.all(
    sql`SELECT id, date, name FROM meta_events WHERE id IN ${eventIds}`,
  )) as unknown as EventRow[]

  if (rows.length === 0) return

  // Load reference data (dataslates / packs / editions apply platform-wide,
  // not per event — safe to load unfiltered).
  const dataslates = (await db.all(sql`SELECT * FROM dim_dataslate`)) as unknown as DimRow[]
  const packs = (await db.all(sql`SELECT * FROM dim_tournament_pack`)) as unknown as DimRow[]
  const editions = (await db.all(sql`SELECT * FROM dim_edition`)) as unknown as EditionRow[]

  const frames = generateFrames(rows, dataslates, packs, editions)

  // Frames are shared across events, so an existing row is expected — but its
  // dimension columns are DERIVED from dim_edition / dim_dataslate /
  // dim_tournament_pack and must be refreshed, not preserved.
  //
  // This was INSERT OR IGNORE, which meant a dimension change never reached the
  // frames already written. Adding 11th edition to dim_edition left all 719
  // existing frames still claiming edition-10th, including every event carrying
  // 11e detachment combos.
  //
  // The date columns are refreshed too. For weekend:/month:/quarter: frames the
  // id encodes the date, so that is a no-op — but an `event:{id}` frame is keyed
  // on the EVENT, and an event's date can legitimately be corrected. Nine majors
  // stored under 2001 were repaired to their true 2025 dates; without this their
  // frames would have stayed in 2001 while the events moved.
  //
  // type_id is the only column left alone: it is genuinely frame identity.
  for (const f of frames) {
    await db.run(sql`INSERT INTO meta_for
      (id, type_id, date, end_date, day, month, quarter, year, dataslate_id, tourney_pack_id, edition_id)
      VALUES (${f.id}, ${f.typeId}, ${f.date}, ${f.endDate}, ${f.day}, ${f.month}, ${f.quarter}, ${f.year}, ${f.dataslateId}, ${f.packId}, ${f.editionId})
      ON CONFLICT(id) DO UPDATE SET
        date = excluded.date,
        end_date = excluded.end_date,
        day = excluded.day,
        month = excluded.month,
        quarter = excluded.quarter,
        year = excluded.year,
        dataslate_id = excluded.dataslate_id,
        tourney_pack_id = excluded.tourney_pack_id,
        edition_id = excluded.edition_id`)
  }

  // Rebuild fact_game_results for exactly these events. The delete and the
  // inserts go in ONE batch, which libSQL runs as a transaction.
  //
  // Sending them as separate statements is what corrupted the table on
  // 2026-07-30: a rebuild of 155 events left 23,995 duplicate rows (90,690
  // where 66,695 games exist), with a contiguous tail of each event's pairings
  // inserted twice — the signature of a retried request re-applying inserts the
  // delete had already accounted for. Nothing failed loudly; every affected win
  // rate simply counted those games twice.
  //
  // To check after a rebuild — these two must be equal:
  //   SELECT COUNT(*) FROM fact_game_results;
  //   SELECT COUNT(*) FROM (SELECT DISTINCT event_id, player_id, round,
  //                         opponent_id FROM fact_game_results);
  // Do NOT group by (event_id, player_id, round) alone: 27 players legitimately
  // have two pairings in one round against different opponents, so that query
  // reports real games as duplicates.
  let eventNo = 0
  for (const event of rows) {
    const eventId = event.id
    eventNo += 1
    const eventStarted = Date.now()
    const pairingRows = await db.all(sql`
      SELECT mp.id, mp.event_id, mp.round, mp.result,
             mp.player1_id, mp.player2_id,
             mp.player1_score, mp.player2_score,
             p1.faction_id AS p1_faction, p1.subfaction_id AS p1_subfaction,
             p1.detachment_id AS p1_detachment, p1.combo_id AS p1_combo,
             p2.faction_id AS p2_faction, p2.subfaction_id AS p2_subfaction,
             p2.detachment_id AS p2_detachment, p2.combo_id AS p2_combo
      FROM meta_pairings mp
      JOIN meta_event_players p1 ON mp.player1_id = p1.id
      JOIN meta_event_players p2 ON mp.player2_id = p2.id
      WHERE mp.event_id = ${eventId}
    `)

    const factWrites: SQL[] = [sql`DELETE FROM fact_game_results WHERE event_id = ${eventId}`]

    for (const row of pairingRows as Array<Record<string, unknown>>) {
      const result = row.result as string
      const p1Result = result === 'p1' ? 1.0 : result === 'draw' ? 0.5 : 0.0
      const p2Result = result === 'p2' ? 1.0 : result === 'draw' ? 0.5 : 0.0

      // Grain is one row per player per game, keyed by (pairing_id, player_id).
      // A player can legitimately appear twice in one round — 27 such pairs
      // exist, against different opponents — so (event, player, round) is NOT
      // the key; the pairing is. The unique index on that pair is what makes a
      // duplicate impossible rather than merely unlikely.
      //
      // The combo rides along as an attribute. Fanning out per member
      // detachment would count a two-detachment army as two games and corrupt
      // every win rate.
      factWrites.push(
        sql`INSERT OR REPLACE INTO fact_game_results
        (id, pairing_id, event_id, player_id, opponent_id, round, faction_id, subfaction_id, detachment_id, combo_id,
         opponent_faction_id, opponent_subfaction_id, opponent_detachment_id, opponent_combo_id,
         result, player_score, opponent_score)
        VALUES (${generateId()}, ${row.id}, ${row.event_id}, ${row.player1_id}, ${row.player2_id}, ${row.round},
                ${row.p1_faction}, ${row.p1_subfaction}, ${row.p1_detachment}, ${row.p1_combo},
                ${row.p2_faction}, ${row.p2_subfaction}, ${row.p2_detachment}, ${row.p2_combo},
                ${p1Result}, ${row.player1_score}, ${row.player2_score})`,
      )

      factWrites.push(
        sql`INSERT OR REPLACE INTO fact_game_results
        (id, pairing_id, event_id, player_id, opponent_id, round, faction_id, subfaction_id, detachment_id, combo_id,
         opponent_faction_id, opponent_subfaction_id, opponent_detachment_id, opponent_combo_id,
         result, player_score, opponent_score)
        VALUES (${generateId()}, ${row.id}, ${row.event_id}, ${row.player2_id}, ${row.player1_id}, ${row.round},
                ${row.p2_faction}, ${row.p2_subfaction}, ${row.p2_detachment}, ${row.p2_combo},
                ${row.p1_faction}, ${row.p1_subfaction}, ${row.p1_detachment}, ${row.p1_combo},
                ${p2Result}, ${row.player2_score}, ${row.player1_score})`,
      )
    }

    // Chunked, not one giant transaction. The largest event has 1,884 pairings
    // -> 3,768 inserts, which went out as a single ~3MB request and got the
    // connection closed mid-flight.
    //
    // Losing per-event atomicity is safe HERE specifically because the delete
    // leads the sequence (so a retry re-clears first) and because
    // uq_fact_game_results_pairing_player makes a duplicated game unstorable.
    // That index is what the original single-transaction was really protecting
    // against, and it does the job better.
    await flushWrites(db, factWrites)
    report(
      `event ${eventNo}/${rows.length} ${eventId} ${event.name ?? ''} — ` +
        `${pairingRows.length} pairings, ${factWrites.length - 1} fact rows, ` +
        `${Date.now() - eventStarted}ms`,
    )
  }

  // Rebuild meta_top for every frame touched by these events (full
  // aggregate recompute per frame, not an increment — correct even when an
  // event is re-processed).
  const affectedFrameIds = frames.map((f) => f.id)
  report(`facts done — rebuilding ${affectedFrameIds.length} frames`)
  for (const frameId of affectedFrameIds) {
    await db.run(sql`DELETE FROM meta_top WHERE meta_for_id = ${frameId}`)
  }

  let frameNo = 0
  for (const frame of frames) {
    frameNo += 1
    const frameStarted = Date.now()
    await buildLevelRollups(db, frame.id, frameEventIds(frame))
    const topMs = Date.now() - frameStarted
    const matchupStarted = Date.now()
    await buildMatchupRollups(db, frame.id, frameEventIds(frame))
    report(
      `frame ${frameNo}/${frames.length} ${frame.id} — ` +
        `top ${topMs}ms, matchup ${Date.now() - matchupStarted}ms`,
    )
  }
}

/**
 * The frame's events as an IN-subquery.
 *
 * Joining meta_events and filtering on me.date made SQLite drive from the
 * 37k-row players table and scan it — the year:2026 placements rollup took over
 * 60s and Turso closed the connection mid-query. Restricting the event set
 * first and letting the join follow takes the same query to 25s.
 */
function frameEventIds(frame: Frame): SQL {
  if (frame.typeId === 1) {
    return sql`(SELECT id FROM meta_events WHERE id = ${frame.id.replace('event:', '')})`
  }
  if (frame.endDate !== null) {
    return sql`(SELECT id FROM meta_events WHERE date >= ${frame.date} AND date <= ${frame.endDate})`
  }
  return sql`(SELECT id FROM meta_events WHERE date >= ${frame.date} AND date < ${frame.date + 86400000})`
}

/**
 * Statements per round trip for rollup writes.
 *
 * The rollup writers issued one INSERT per row, awaited individually. For a
 * broad frame that is enormous: year:2026's combo matchups alone are 10,202
 * rows, i.e. 10,202 sequential round trips to Turso. The connection died
 * partway every time, and retrying the event just replayed the same doomed
 * sequence — six attempts, same failure.
 */
const ROLLUP_WRITES_PER_BATCH = 200

async function flushWrites(db: Db, writes: SQL[]): Promise<void> {
  for (let i = 0; i < writes.length; i += ROLLUP_WRITES_PER_BATCH) {
    const slice = writes.slice(i, i + ROLLUP_WRITES_PER_BATCH).map((st) => db.run(st))
    await runWithRetry(() => db.batch(slice as [(typeof slice)[number], ...typeof slice]))
  }
}

/**
 * Retry a write batch through a dropped connection.
 *
 * Turso closes long-lived keep-alive sockets; over an hour-long rebuild that is
 * routine rather than exceptional, and it surfaces as UND_ERR_SOCKET / "other
 * side closed" with no indication of which statement was in flight.
 *
 * A blind retry is what corrupted fact_game_results on 2026-07-30 — replaying
 * inserts the delete had already accounted for. It is safe now, and only now,
 * because uq_fact_game_results_pairing_player rejects a duplicated game and the
 * rollup writers use INSERT OR REPLACE on their own keys. Every statement this
 * wraps is idempotent by construction. Do not widen it to anything that is not.
 */
async function runWithRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const transient = String((err as Error)?.message ?? err).match(
        /fetch failed|other side closed|UND_ERR_SOCKET|ECONNRESET|socket hang up/i,
      )
      if (!transient || attempt >= attempts) throw err
      await new Promise((r) => setTimeout(r, 500 * attempt))
    }
  }
}

/**
 * Sub-faction, detachment and combo rollups — ONE writer, ONE metric set.
 *
 * These were three near-copies, and each populated a different subset: the
 * detachment and combo rollups wrote zeros for player_pop_pct, over_rep and
 * every placement column, so the dashboard rendered "Meta% 0.0%" and blank
 * 1st/T4 for every row. SubFaction was never written at all, so selecting it
 * returned an empty table from a selector that offered it.
 *
 * A level is defined by two keys — how to group the FACT rows and how to group
 * the PLAYER rows — and everything else is shared. Adding a level cannot ship
 * half-populated because there is only one implementation to populate.
 *
 * Measures come from fact_game_results (one row per player per game, which is
 * what a win rate needs). Placements come from meta_event_players, because
 * placement is a property of a player at an event, not of a game.
 */
interface RollupLevel {
  granularityId: number
  /** meta_top column receiving the key. */
  column: 'faction_only' | 'subfaction_id' | 'detachment_id' | 'combo_id'
  /** Key expression + any extra FROM/JOIN needed, over fact_game_results f. */
  factKey: SQL
  factJoin: SQL
  /** Key expression + join over meta_event_players ep. */
  playerKey: SQL
  playerJoin: SQL
}

const ROLLUP_LEVELS: RollupLevel[] = [
  {
    // Faction was computed separately, summing self-reported W/L/D off
    // meta_event_players, while every other level counted fact rows. The two
    // never reconciled. It is now the same writer as the rest: measures from
    // the fact grain, placements from the player rows.
    granularityId: 1,
    column: 'faction_only',
    factKey: sql`f.faction_id`,
    factJoin: sql``,
    playerKey: sql`ep.faction_id`,
    playerJoin: sql``,
  },
  {
    granularityId: 2,
    column: 'subfaction_id',
    factKey: sql`f.subfaction_id`,
    factJoin: sql``,
    playerKey: sql`ep.subfaction_id`,
    playerJoin: sql``,
  },
  {
    granularityId: 3,
    column: 'detachment_id',
    // A detachment is credited whenever the army CONTAINED it, in any
    // position — resolved here once, not per request.
    factKey: sql`m.detachment_id`,
    factJoin: sql`JOIN dim_detachment_combo_member m ON f.combo_id = m.combo_id`,
    playerKey: sql`pd.detachment_id`,
    playerJoin: sql`JOIN meta_event_player_detachment pd ON pd.player_id = ep.id`,
  },
  {
    granularityId: 4,
    column: 'combo_id',
    factKey: sql`f.combo_id`,
    factJoin: sql``,
    playerKey: sql`ep.combo_id`,
    playerJoin: sql``,
  },
]

async function buildLevelRollups(db: Db, frameId: string, eventIds: SQL): Promise<void> {
  const rollupWrites: SQL[] = []
  for (const level of ROLLUP_LEVELS) {
    const measures = (await db.all(sql`
      SELECT f.faction_id, ${level.factKey} AS key,
             COUNT(*) AS games,
             SUM(CASE WHEN f.result = 1.0 THEN 1 ELSE 0 END) AS wins,
             SUM(CASE WHEN f.result = 0.0 THEN 1 ELSE 0 END) AS losses,
             SUM(CASE WHEN f.result = 0.5 THEN 1 ELSE 0 END) AS draws
      FROM fact_game_results f
      ${level.factJoin}
      WHERE f.event_id IN ${eventIds} AND ${level.factKey} IS NOT NULL
      GROUP BY f.faction_id, ${level.factKey}
    `)) as Array<Record<string, unknown>>

    if (measures.length === 0) continue

    const placements = (await db.all(sql`
      SELECT ep.faction_id, ${level.playerKey} AS key,
             COUNT(*) AS players,
             SUM(CASE WHEN ep.placement = 1 THEN 1 ELSE 0 END) AS event_wins,
             SUM(CASE WHEN ep.placement <= 2 THEN 1 ELSE 0 END) AS event_finals,
             SUM(CASE WHEN ep.placement <= 4 THEN 1 ELSE 0 END) AS event_top4,
             SUM(CASE WHEN ep.placement <= 8 THEN 1 ELSE 0 END) AS event_top8,
             SUM(CASE WHEN ep.placement <= 16 THEN 1 ELSE 0 END) AS event_top16
      FROM meta_event_players ep
      ${level.playerJoin}
      WHERE ep.event_id IN ${eventIds} AND ${level.playerKey} IS NOT NULL
      GROUP BY ep.faction_id, ${level.playerKey}
    `)) as Array<Record<string, unknown>>

    const byKey = new Map(placements.map((p) => [`${p.faction_id}::${p.key}`, p]))
    const totalPlayers = placements.reduce((sum, p) => sum + (p.players as number), 0)
    // Even share across everything present at THIS level, so over_rep means the
    // same thing here as it does for factions.
    const expectedPct = measures.length > 0 ? 1.0 / measures.length : 0

    for (const r of measures) {
      const games = r.games as number
      const wins = r.wins as number
      const draws = r.draws as number
      const key = r.key as string
      const pl = byKey.get(`${r.faction_id as string}::${key}`)
      const players = (pl?.players as number) ?? 0
      const playerPct = totalPlayers > 0 ? players / totalPlayers : 0

      rollupWrites.push(sql`INSERT OR REPLACE INTO meta_top
        (id, granularity_id, faction_id, subfaction_id, detachment_id, combo_id, meta_for_id,
         win_rate, draw_rate, over_rep, four_oh_start,
         event_wins, event_finals, event_top4, event_top8, event_top16,
         player_pop_pct, wins, losses, draws, games, players)
        VALUES (
          ${`g${level.granularityId}:${key}:${frameId}`},
          ${level.granularityId},
          ${r.faction_id as string},
          ${level.column === 'subfaction_id' ? key : null},
          ${level.column === 'detachment_id' ? key : null},
          ${level.column === 'combo_id' ? key : null},
          ${frameId},
          ${games > 0 ? (wins + draws * 0.5) / games : 0},
          ${games > 0 ? draws / games : 0},
          ${expectedPct > 0 ? playerPct / expectedPct : 0},
          ${players > 0 ? ((pl?.event_top8 as number) ?? 0) / players : 0},
          ${(pl?.event_wins as number) ?? 0},
          ${(pl?.event_finals as number) ?? 0},
          ${(pl?.event_top4 as number) ?? 0},
          ${(pl?.event_top8 as number) ?? 0},
          ${(pl?.event_top16 as number) ?? 0},
          ${playerPct}, ${wins}, ${r.losses}, ${draws}, ${games}, ${players})`)
    }
  }

  await flushWrites(db, rollupWrites)
}

/**
 * Matchup rollups — the head-to-head matrix, precomputed per frame.
 *
 * Only levels with a direct opponent column on the fact grain are built:
 * faction has (faction_id, opponent_faction_id) and combo has (combo_id,
 * opponent_combo_id). Detachment would need the combo-member bridge joined on
 * BOTH sides, fanning every game out by members_a x members_b — that is a real
 * design decision about what "detachment vs detachment" even means for a
 * two-detachment army, not something to guess at here.
 *
 * key_a < key_b so each pairing is stored once; a_wins / b_wins are relative to
 * that ordering.
 */
async function buildMatchupRollups(db: Db, frameId: string, eventIds: SQL): Promise<void> {
  const levels: Array<{ granularityId: number; a: SQL; b: SQL }> = [
    { granularityId: 1, a: sql`f.faction_id`, b: sql`f.opponent_faction_id` },
    { granularityId: 4, a: sql`f.combo_id`, b: sql`f.opponent_combo_id` },
  ]

  const matchupWrites: SQL[] = []
  for (const level of levels) {
    await db.run(sql`
      DELETE FROM meta_matchup
      WHERE meta_for_id = ${frameId} AND granularity_id = ${level.granularityId}
    `)

    const rows = (await db.all(sql`
      SELECT ${level.a} AS key_a, ${level.b} AS key_b,
             SUM(CASE WHEN f.result = 1.0 THEN 1 ELSE 0 END) AS a_wins,
             SUM(CASE WHEN f.result = 0.0 THEN 1 ELSE 0 END) AS b_wins,
             SUM(CASE WHEN f.result = 0.5 THEN 1 ELSE 0 END) AS draws,
             COUNT(*) AS games,
             AVG(f.result) AS a_win_rate
      FROM fact_game_results f
      WHERE f.event_id IN ${eventIds}
        AND ${level.a} IS NOT NULL AND ${level.b} IS NOT NULL
        AND ${level.a} < ${level.b}
      GROUP BY ${level.a}, ${level.b}
    `)) as Array<Record<string, unknown>>

    for (const r of rows) {
      matchupWrites.push(sql`INSERT OR REPLACE INTO meta_matchup
        (id, granularity_id, meta_for_id, key_a, key_b, a_wins, b_wins, draws, games, a_win_rate)
        VALUES (
          ${`m${level.granularityId}:${r.key_a as string}:${r.key_b as string}:${frameId}`},
          ${level.granularityId}, ${frameId},
          ${r.key_a as string}, ${r.key_b as string},
          ${r.a_wins}, ${r.b_wins}, ${r.draws}, ${r.games}, ${r.a_win_rate})`)
    }
  }

  await flushWrites(db, matchupWrites)
}

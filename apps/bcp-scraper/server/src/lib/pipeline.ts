/**
 * Incremental meta analytics cube builder.
 *
 * Only processes events that don't already have fact_game_results rows.
 * Uses INSERT OR IGNORE for frames so existing data is preserved.
 */

import { sql } from 'drizzle-orm'
import type { Db } from '@tabletop-tools/db'
import { generateId } from '@tabletop-tools/server-core'

// ── Frame of Reference generation ─────────────────────────────────────────────

export interface EventRow {
  id: string
  date: number
  name: string
}

interface Frame {
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
  dataslates: any[],
  packs: any[],
  editions: any[],
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
        (ds) =>
          event.date >= ds.effective_date &&
          (!ds.end_date || event.date <= ds.end_date),
      )?.id || null
    const tpId =
      packs.find(
        (tp) =>
          event.date >= tp.effective_date &&
          (!tp.end_date || event.date <= tp.end_date),
      )?.id || null
    const edId =
      editions.find(
        (ed) =>
          event.date >= ed.start_date &&
          (!ed.end_date || event.date <= ed.end_date),
      )?.id || null

    const dayOfWeek = d.getUTCDay()
    const saturday = new Date(d)
    saturday.setUTCDate(d.getUTCDate() - dayOfWeek + 6)
    const weekendStr = saturday.toISOString().slice(0, 10)

    add({ id: `event:${event.id}`, typeId: 1, date: event.date, endDate: null, day, month, quarter: null, year, dataslateId: dsId, packId: tpId, editionId: edId })
    add({ id: `weekend:${weekendStr}`, typeId: 2, date: saturday.getTime(), endDate: null, day: null, month, quarter: null, year, dataslateId: dsId, packId: tpId, editionId: edId })
    add({ id: `month:${year}-${String(month).padStart(2, '0')}`, typeId: 3, date: new Date(Date.UTC(year, month - 1, 1)).getTime(), endDate: new Date(Date.UTC(year, month, 0)).getTime(), day: null, month, quarter: null, year, dataslateId: dsId, packId: tpId, editionId: edId })
    add({ id: `quarter:${year}:${quarter}`, typeId: 4, date: new Date(Date.UTC(year, (quarter - 1) * 3, 1)).getTime(), endDate: new Date(Date.UTC(year, quarter * 3, 0)).getTime(), day: null, month: null, quarter, year, dataslateId: dsId, packId: tpId, editionId: edId })
    add({ id: `year:${year}`, typeId: 5, date: new Date(Date.UTC(year, 0, 1)).getTime(), endDate: new Date(Date.UTC(year, 11, 31)).getTime(), day: null, month: null, quarter: null, year, dataslateId: null, packId: null, editionId: edId })
  }

  for (const ds of dataslates) {
    const d = new Date(ds.effective_date)
    add({ id: `dataslate:${ds.id}`, typeId: 6, date: ds.effective_date, endDate: ds.end_date, day: null, month: null, quarter: null, year: d.getUTCFullYear(), dataslateId: ds.id, packId: null, editionId: null })
  }
  for (const tp of packs) {
    const d = new Date(tp.effective_date)
    add({ id: `pack:${tp.id}`, typeId: 7, date: tp.effective_date, endDate: tp.end_date, day: null, month: null, quarter: null, year: d.getUTCFullYear(), dataslateId: null, packId: tp.id, editionId: null })
  }
  for (const ed of editions) {
    const d = new Date(ed.start_date)
    add({ id: `edition:${ed.id}`, typeId: 8, date: ed.start_date, endDate: ed.end_date, day: null, month: null, quarter: null, year: d.getUTCFullYear(), dataslateId: null, packId: null, editionId: ed.id })
  }

  return frames
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

export async function runPipeline(db: Db): Promise<void> {
  await db.run(
    sql`UPDATE meta_cube_status SET status = 'running', last_started_at = ${Date.now()} WHERE id = 1`,
  )

  try {
    // Find events imported since last cube build
    const cubeStatus = (await db.all(sql`SELECT last_completed_at FROM meta_cube_status WHERE id = 1`)) as any[]
    const lastCompleted = cubeStatus[0]?.last_completed_at || 0

    const newEvents = (await db.all(sql`
      SELECT id, date, name FROM meta_events
      WHERE imported_at > ${lastCompleted}
    `)) as unknown as EventRow[]

    if (newEvents.length === 0) {
      await db.run(
        sql`UPDATE meta_cube_status SET status = 'complete', last_completed_at = ${Date.now()} WHERE id = 1`,
      )
      return
    }

    // Load reference data
    const dataslates = await db.all(sql`SELECT * FROM dim_dataslate`)
    const packs = await db.all(sql`SELECT * FROM dim_tournament_pack`)
    const editions = await db.all(sql`SELECT * FROM dim_edition`)

    // Generate frames for new events only
    const frames = generateFrames(newEvents, dataslates as any[], packs as any[], editions as any[])

    // Insert frames (IGNORE if already exists)
    for (const f of frames) {
      await db.run(sql`INSERT OR IGNORE INTO meta_for
        (id, type_id, date, end_date, day, month, quarter, year, dataslate_id, tourney_pack_id, edition_id)
        VALUES (${f.id}, ${f.typeId}, ${f.date}, ${f.endDate}, ${f.day}, ${f.month}, ${f.quarter}, ${f.year}, ${f.dataslateId}, ${f.packId}, ${f.editionId})`)
    }

    // Build fact rows for new events only
    const newEventIds = newEvents.map(e => e.id)
    for (const eventId of newEventIds) {
      const pairingRows = await db.all(sql`
        SELECT mp.id, mp.event_id, mp.round, mp.result,
               mp.player1_id, mp.player2_id,
               mp.player1_score, mp.player2_score,
               p1.faction_id AS p1_faction, p1.subfaction_id AS p1_subfaction, p1.detachment_id AS p1_detachment,
               p2.faction_id AS p2_faction, p2.subfaction_id AS p2_subfaction, p2.detachment_id AS p2_detachment
        FROM meta_pairings mp
        JOIN meta_event_players p1 ON mp.player1_id = p1.id
        JOIN meta_event_players p2 ON mp.player2_id = p2.id
        WHERE mp.event_id = ${eventId}
      `)

      for (const row of pairingRows as any[]) {
        const result = row.result as string
        const p1Result = result === 'p1' ? 1.0 : result === 'draw' ? 0.5 : 0.0
        const p2Result = result === 'p2' ? 1.0 : result === 'draw' ? 0.5 : 0.0

        await db.run(sql`INSERT INTO fact_game_results
          (id, event_id, player_id, opponent_id, round, faction_id, subfaction_id, detachment_id,
           opponent_faction_id, opponent_subfaction_id, opponent_detachment_id, result, player_score, opponent_score)
          VALUES (${generateId()}, ${row.event_id}, ${row.player1_id}, ${row.player2_id}, ${row.round},
                  ${row.p1_faction}, ${row.p1_subfaction}, ${row.p1_detachment},
                  ${row.p2_faction}, ${row.p2_subfaction}, ${row.p2_detachment},
                  ${p1Result}, ${row.player1_score}, ${row.player2_score})`)

        await db.run(sql`INSERT INTO fact_game_results
          (id, event_id, player_id, opponent_id, round, faction_id, subfaction_id, detachment_id,
           opponent_faction_id, opponent_subfaction_id, opponent_detachment_id, result, player_score, opponent_score)
          VALUES (${generateId()}, ${row.event_id}, ${row.player2_id}, ${row.player1_id}, ${row.round},
                  ${row.p2_faction}, ${row.p2_subfaction}, ${row.p2_detachment},
                  ${row.p1_faction}, ${row.p1_subfaction}, ${row.p1_detachment},
                  ${p2Result}, ${row.player2_score}, ${row.player1_score})`)
      }
    }

    // Rebuild meta_top for affected frames only
    // Delete existing meta_top rows for frames that include new events
    const affectedFrameIds = frames.map(f => f.id)
    for (const frameId of affectedFrameIds) {
      await db.run(sql`DELETE FROM meta_top WHERE meta_for_id = ${frameId}`)
    }

    // Rebuild meta_top for affected frames
    for (const frame of frames) {
      let eventFilter: string
      if (frame.typeId === 1) {
        const eventId = frame.id.replace('event:', '')
        eventFilter = `me.id = '${eventId}'`
      } else if (frame.endDate) {
        eventFilter = `me.date >= ${frame.date} AND me.date <= ${frame.endDate}`
      } else {
        eventFilter = `me.date >= ${frame.date} AND me.date < ${frame.date + 86400000}`
      }

      const stats = await db.all(
        sql.raw(`
          SELECT ep.faction_id,
                 SUM(ep.wins) AS wins, SUM(ep.losses) AS losses, SUM(ep.draws) AS draws,
                 COUNT(*) AS players,
                 SUM(CASE WHEN ep.placement = 1 THEN 1 ELSE 0 END) AS event_wins,
                 SUM(CASE WHEN ep.placement <= 2 THEN 1 ELSE 0 END) AS event_finals,
                 SUM(CASE WHEN ep.placement <= 4 THEN 1 ELSE 0 END) AS event_top4,
                 SUM(CASE WHEN ep.placement <= 8 THEN 1 ELSE 0 END) AS event_top8,
                 SUM(CASE WHEN ep.placement <= 16 THEN 1 ELSE 0 END) AS event_top16
          FROM meta_event_players ep
          JOIN meta_events me ON ep.event_id = me.id
          WHERE ${eventFilter}
          GROUP BY ep.faction_id
        `),
      )

      if (stats.length === 0) continue

      const totalPlayers = stats.reduce((sum, r: any) => sum + (r.players as number), 0)
      const activeFactions = stats.length
      const expectedPct = activeFactions > 0 ? 1.0 / activeFactions : 0

      for (const row of stats as any[]) {
        const wins = row.wins as number
        const losses = row.losses as number
        const draws = row.draws as number
        const games = wins + losses + draws
        const winRate = games > 0 ? (wins + draws * 0.5) / games : 0
        const drawRate = games > 0 ? draws / games : 0
        const playerPct = totalPlayers > 0 ? (row.players as number) / totalPlayers : 0
        const overRep = expectedPct > 0 ? playerPct / expectedPct : 0
        const fourOhStart = (row.players as number) > 0 ? (row.event_top8 as number) / (row.players as number) : 0
        const topId = `faction:${row.faction_id}:${frame.id}`

        await db.run(sql`INSERT OR REPLACE INTO meta_top
          (id, granularity_id, faction_id, subfaction_id, detachment_id, meta_for_id,
           win_rate, draw_rate, over_rep, four_oh_start,
           event_wins, event_finals, event_top4, event_top8, event_top16,
           player_pop_pct, wins, losses, draws, games, players)
          VALUES (${topId}, 1, ${row.faction_id}, ${null}, ${null}, ${frame.id},
                  ${winRate}, ${drawRate}, ${overRep}, ${fourOhStart},
                  ${row.event_wins}, ${row.event_finals}, ${row.event_top4}, ${row.event_top8}, ${row.event_top16},
                  ${playerPct}, ${wins}, ${losses}, ${draws}, ${games}, ${row.players})`)
      }
    }

    await db.run(
      sql`UPDATE meta_cube_status SET status = 'complete', last_completed_at = ${Date.now()} WHERE id = 1`,
    )
  } catch (err) {
    await db.run(
      sql`UPDATE meta_cube_status SET status = 'failed' WHERE id = 1`,
    )
    throw err
  }
}

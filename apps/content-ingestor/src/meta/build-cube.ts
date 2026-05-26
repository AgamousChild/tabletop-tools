/**
 * Build the analytics cube from 3NF meta tables.
 *
 * Populates: meta_for, fact_game_results, meta_top, meta_cube_status
 *
 * Run: TURSO_DB_URL=... TURSO_AUTH_TOKEN=... npx tsx src/meta/build-cube.ts
 */

import { createClient, type Client } from '@libsql/client'

function generateId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let r = ''
  for (let i = 0; i < 21; i++) r += chars.charAt(Math.floor(Math.random() * chars.length))
  return r
}

async function createTables(client: Client) {
  await client.batch([
    `CREATE TABLE IF NOT EXISTS meta_for (
      id TEXT PRIMARY KEY, type_id INTEGER NOT NULL REFERENCES dim_for_type(id),
      date INTEGER NOT NULL, end_date INTEGER,
      day INTEGER, month INTEGER, quarter INTEGER, year INTEGER NOT NULL,
      dataslate_id TEXT REFERENCES dim_dataslate(id),
      tourney_pack_id TEXT REFERENCES dim_tournament_pack(id),
      edition_id TEXT REFERENCES dim_edition(id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_meta_for_type ON meta_for(type_id)`,
    `CREATE INDEX IF NOT EXISTS idx_meta_for_type_date ON meta_for(type_id, date)`,

    `CREATE TABLE IF NOT EXISTS fact_game_results (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES meta_events(id) ON DELETE CASCADE,
      player_id TEXT NOT NULL REFERENCES meta_event_players(id) ON DELETE CASCADE,
      opponent_id TEXT REFERENCES meta_event_players(id) ON DELETE CASCADE,
      round INTEGER NOT NULL,
      faction_id TEXT NOT NULL REFERENCES dim_faction(id),
      subfaction_id TEXT REFERENCES dim_subfaction(id),
      detachment_id TEXT REFERENCES dim_detachment(id),
      opponent_faction_id TEXT REFERENCES dim_faction(id),
      opponent_subfaction_id TEXT REFERENCES dim_subfaction(id),
      opponent_detachment_id TEXT REFERENCES dim_detachment(id),
      result REAL NOT NULL, player_score INTEGER, opponent_score INTEGER
    )`,
    `CREATE INDEX IF NOT EXISTS idx_fact_results_faction ON fact_game_results(faction_id)`,
    `CREATE INDEX IF NOT EXISTS idx_fact_results_event ON fact_game_results(event_id)`,
    `CREATE INDEX IF NOT EXISTS idx_fact_results_player ON fact_game_results(player_id)`,
    `CREATE INDEX IF NOT EXISTS idx_fact_results_matchup ON fact_game_results(faction_id, opponent_faction_id)`,

    `CREATE TABLE IF NOT EXISTS meta_top (
      id TEXT PRIMARY KEY,
      granularity_id INTEGER NOT NULL REFERENCES dim_granularity(id),
      faction_id TEXT NOT NULL REFERENCES dim_faction(id),
      subfaction_id TEXT REFERENCES dim_subfaction(id),
      detachment_id TEXT REFERENCES dim_detachment(id),
      meta_for_id TEXT NOT NULL REFERENCES meta_for(id) ON DELETE CASCADE,
      win_rate REAL NOT NULL, draw_rate REAL NOT NULL,
      over_rep REAL NOT NULL, four_oh_start REAL NOT NULL,
      event_wins INTEGER NOT NULL DEFAULT 0, event_finals INTEGER NOT NULL DEFAULT 0,
      event_top4 INTEGER NOT NULL DEFAULT 0, event_top8 INTEGER NOT NULL DEFAULT 0,
      event_top16 INTEGER NOT NULL DEFAULT 0,
      player_pop_pct REAL NOT NULL,
      wins INTEGER NOT NULL DEFAULT 0, losses INTEGER NOT NULL DEFAULT 0,
      draws INTEGER NOT NULL DEFAULT 0, games INTEGER NOT NULL DEFAULT 0,
      players INTEGER NOT NULL DEFAULT 0,
      CHECK(win_rate >= 0.0 AND win_rate <= 1.0),
      CHECK(draw_rate >= 0.0 AND draw_rate <= 1.0)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_meta_top_for ON meta_top(meta_for_id)`,
    `CREATE INDEX IF NOT EXISTS idx_meta_top_for_granularity ON meta_top(meta_for_id, granularity_id)`,
    `CREATE INDEX IF NOT EXISTS idx_meta_top_faction_for ON meta_top(faction_id, meta_for_id)`,

    `CREATE TABLE IF NOT EXISTS meta_cube_status (
      id INTEGER PRIMARY KEY DEFAULT 1,
      last_started_at INTEGER, last_completed_at INTEGER,
      last_event_id TEXT, status TEXT NOT NULL DEFAULT 'pending'
    )`,
    `INSERT OR IGNORE INTO meta_cube_status (id, status) VALUES (1, 'pending')`,
  ])
}

// ── Frame of Reference generation ─────────────────────────────────────────────

interface EventRow { id: string; date: number; name: string }

function generateFrames(events: EventRow[], dataslates: any[], packs: any[], editions: any[]) {
  const frames: Array<{ id: string; typeId: number; date: number; endDate: number | null; day: number | null; month: number | null; quarter: number | null; year: number; dataslateId: string | null; packId: string | null; editionId: string | null }> = []
  const seen = new Set<string>()

  function add(f: typeof frames[0]) {
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

    // Find applicable dataslate, pack, edition
    const dsId = dataslates.find(ds => event.date >= ds.effective_date && (!ds.end_date || event.date <= ds.end_date))?.id || null
    const tpId = packs.find(tp => event.date >= tp.effective_date && (!tp.end_date || event.date <= tp.end_date))?.id || null
    const edId = editions.find(ed => event.date >= ed.start_date && (!ed.end_date || event.date <= ed.end_date))?.id || null

    // Weekend (Saturday of event week)
    const dayOfWeek = d.getUTCDay()
    const saturday = new Date(d)
    saturday.setUTCDate(d.getUTCDate() - dayOfWeek + 6)
    const weekendStr = saturday.toISOString().slice(0, 10)

    // Event frame
    add({ id: `event:${event.id}`, typeId: 1, date: event.date, endDate: null, day, month, quarter: null, year, dataslateId: dsId, packId: tpId, editionId: edId })

    // Weekend frame
    add({ id: `weekend:${weekendStr}`, typeId: 2, date: saturday.getTime(), endDate: null, day: null, month, quarter: null, year, dataslateId: dsId, packId: tpId, editionId: edId })

    // Month frame
    add({ id: `month:${year}-${String(month).padStart(2, '0')}`, typeId: 3, date: new Date(Date.UTC(year, month - 1, 1)).getTime(), endDate: new Date(Date.UTC(year, month, 0)).getTime(), day: null, month, quarter: null, year, dataslateId: dsId, packId: tpId, editionId: edId })

    // Quarter frame
    add({ id: `quarter:${year}:${quarter}`, typeId: 4, date: new Date(Date.UTC(year, (quarter - 1) * 3, 1)).getTime(), endDate: new Date(Date.UTC(year, quarter * 3, 0)).getTime(), day: null, month: null, quarter, year, dataslateId: dsId, packId: tpId, editionId: edId })

    // Year frame
    add({ id: `year:${year}`, typeId: 5, date: new Date(Date.UTC(year, 0, 1)).getTime(), endDate: new Date(Date.UTC(year, 11, 31)).getTime(), day: null, month: null, quarter: null, year, dataslateId: null, packId: null, editionId: edId })
  }

  // Dataslate frames
  for (const ds of dataslates) {
    const d = new Date(ds.effective_date)
    add({ id: `dataslate:${ds.id}`, typeId: 6, date: ds.effective_date, endDate: ds.end_date, day: null, month: null, quarter: null, year: d.getUTCFullYear(), dataslateId: ds.id, packId: null, editionId: null })
  }

  // Tournament pack frames
  for (const tp of packs) {
    const d = new Date(tp.effective_date)
    add({ id: `pack:${tp.id}`, typeId: 7, date: tp.effective_date, endDate: tp.end_date, day: null, month: null, quarter: null, year: d.getUTCFullYear(), dataslateId: null, packId: tp.id, editionId: null })
  }

  // Edition frames
  for (const ed of editions) {
    const d = new Date(ed.start_date)
    add({ id: `edition:${ed.id}`, typeId: 8, date: ed.start_date, endDate: ed.end_date, day: null, month: null, quarter: null, year: d.getUTCFullYear(), dataslateId: null, packId: null, editionId: ed.id })
  }

  return frames
}

// ── Main ──────────────────────────────────────────────────────────────────────

function getClient() {
  const local = process.argv.includes('--local')
  if (local) {
    console.log('Using local DB: .local/meta/meta.db\n')
    return createClient({ url: 'file:.local/meta/meta.db' })
  }
  const dbUrl = process.env.TURSO_DB_URL
  const authToken = process.env.TURSO_AUTH_TOKEN
  if (!dbUrl || !authToken) { console.error('Set TURSO_DB_URL and TURSO_AUTH_TOKEN'); process.exit(1) }
  return createClient({ url: dbUrl, authToken })
}

async function main() {
  const client = getClient()

  await createTables(client)

  // Mark cube as building
  await client.execute({ sql: `UPDATE meta_cube_status SET status = 'running', last_started_at = ? WHERE id = 1`, args: [Date.now()] })

  try {
    // Clear existing cube data
    await client.batch([
      'DELETE FROM meta_top',
      'DELETE FROM fact_game_results',
      'DELETE FROM meta_for',
    ])
    console.log('Cleared existing cube data\n')

    // ── 1. Load reference data ──────────────────────────────────────────────
    const dataslates = (await client.execute('SELECT * FROM dim_dataslate')).rows
    const packs = (await client.execute('SELECT * FROM dim_tournament_pack')).rows
    const editions = (await client.execute('SELECT * FROM dim_edition')).rows
    const events = (await client.execute('SELECT id, date, name FROM meta_events')).rows as unknown as EventRow[]

    console.log(`${events.length} events, ${dataslates.length} dataslates, ${packs.length} packs\n`)

    // ── 2. Generate frames of reference ─────────────────────────────────────
    const frames = generateFrames(events, dataslates as any[], packs as any[], editions as any[])
    console.log(`Generated ${frames.length} frames of reference`)

    for (let i = 0; i < frames.length; i += 50) {
      const batch = frames.slice(i, i + 50).map(f => ({
        sql: `INSERT OR REPLACE INTO meta_for (id, type_id, date, end_date, day, month, quarter, year, dataslate_id, tourney_pack_id, edition_id)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [f.id, f.typeId, f.date, f.endDate, f.day, f.month, f.quarter, f.year, f.dataslateId, f.packId, f.editionId],
      }))
      await client.batch(batch)
    }

    // ── 3. Build fact_game_results from meta_pairings ────────────────────────
    console.log('\nBuilding fact_game_results...')

    // Load all pairings with player faction info
    const pairingRows = await client.execute(`
      SELECT mp.id, mp.event_id, mp.round, mp.result,
             mp.player1_id, mp.player2_id,
             mp.player1_score, mp.player2_score,
             p1.faction_id AS p1_faction, p1.subfaction_id AS p1_subfaction, p1.detachment_id AS p1_detachment,
             p2.faction_id AS p2_faction, p2.subfaction_id AS p2_subfaction, p2.detachment_id AS p2_detachment
      FROM meta_pairings mp
      JOIN meta_event_players p1 ON mp.player1_id = p1.id
      JOIN meta_event_players p2 ON mp.player2_id = p2.id
    `)

    console.log(`  ${pairingRows.rows.length} pairings to process`)

    // Each pairing creates 2 fact rows (one per player's perspective)
    const factBatch: Array<{ sql: string; args: unknown[] }> = []

    for (const row of pairingRows.rows) {
      const result = row.result as string
      const p1Result = result === 'p1' ? 1.0 : result === 'draw' ? 0.5 : 0.0
      const p2Result = result === 'p2' ? 1.0 : result === 'draw' ? 0.5 : 0.0

      // Player 1's perspective
      factBatch.push({
        sql: `INSERT INTO fact_game_results (id, event_id, player_id, opponent_id, round, faction_id, subfaction_id, detachment_id, opponent_faction_id, opponent_subfaction_id, opponent_detachment_id, result, player_score, opponent_score)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [generateId(), row.event_id, row.player1_id, row.player2_id, row.round,
               row.p1_faction, row.p1_subfaction, row.p1_detachment,
               row.p2_faction, row.p2_subfaction, row.p2_detachment,
               p1Result, row.player1_score, row.player2_score],
      })

      // Player 2's perspective
      factBatch.push({
        sql: `INSERT INTO fact_game_results (id, event_id, player_id, opponent_id, round, faction_id, subfaction_id, detachment_id, opponent_faction_id, opponent_subfaction_id, opponent_detachment_id, result, player_score, opponent_score)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [generateId(), row.event_id, row.player2_id, row.player1_id, row.round,
               row.p2_faction, row.p2_subfaction, row.p2_detachment,
               row.p1_faction, row.p1_subfaction, row.p1_detachment,
               p2Result, row.player2_score, row.player1_score],
      })
    }

    console.log(`  ${factBatch.length} fact rows to insert`)
    for (let i = 0; i < factBatch.length; i += 50) {
      await client.batch(factBatch.slice(i, i + 50))
    }

    // ── 4. Build meta_top ───────────────────────────────────────────────────
    console.log('\nBuilding meta_top...')

    // For each frame, aggregate faction stats
    let topRows = 0
    for (const frame of frames) {
      // Determine which events fall in this frame
      let eventFilter: string
      if (frame.typeId === 1) {
        // Event frame — single event
        const eventId = frame.id.replace('event:', '')
        eventFilter = `me.id = '${eventId}'`
      } else if (frame.endDate) {
        eventFilter = `me.date >= ${frame.date} AND me.date <= ${frame.endDate}`
      } else {
        // Single-day frame (weekend)
        const dayStart = frame.date
        const dayEnd = frame.date + 86400000
        eventFilter = `me.date >= ${dayStart} AND me.date < ${dayEnd}`
      }

      // Get faction stats for this frame
      const stats = await client.execute(`
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
      `)

      if (stats.rows.length === 0) continue

      // Total players in this frame (for representation calc)
      const totalPlayers = stats.rows.reduce((sum, r) => sum + (r.players as number), 0)
      // Use active factions in this frame, not total dim_faction count
      const activeFactions = stats.rows.length
      const expectedPct = activeFactions > 0 ? 1.0 / activeFactions : 0

      const batch = stats.rows.map(row => {
        const wins = row.wins as number
        const losses = row.losses as number
        const draws = row.draws as number
        const games = wins + losses + draws
        const winRate = games > 0 ? (wins + draws * 0.5) / games : 0
        const drawRate = games > 0 ? draws / games : 0
        const playerPct = totalPlayers > 0 ? (row.players as number) / totalPlayers : 0
        const overRep = expectedPct > 0 ? playerPct / expectedPct : 0

        // 4-0 start: players with 4+ wins out of this faction's players
        // (simplified — true 4-0 requires round-by-round data)
        const fourOhStart = (row.players as number) > 0
          ? (row.event_top8 as number) / (row.players as number)
          : 0

        const topId = `faction:${row.faction_id}:${frame.id}`

        return {
          sql: `INSERT OR REPLACE INTO meta_top (id, granularity_id, faction_id, subfaction_id, detachment_id, meta_for_id,
                win_rate, draw_rate, over_rep, four_oh_start,
                event_wins, event_finals, event_top4, event_top8, event_top16,
                player_pop_pct, wins, losses, draws, games, players)
                VALUES (?, 1, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [topId, row.faction_id, frame.id,
                 winRate, drawRate, overRep, fourOhStart,
                 row.event_wins, row.event_finals, row.event_top4, row.event_top8, row.event_top16,
                 playerPct, wins, losses, draws, games, row.players],
        }
      })

      for (let i = 0; i < batch.length; i += 50) {
        await client.batch(batch.slice(i, i + 50))
      }
      topRows += batch.length
    }

    console.log(`  ${topRows} meta_top rows created`)

    // Mark cube as complete
    await client.execute({
      sql: `UPDATE meta_cube_status SET status = 'complete', last_completed_at = ? WHERE id = 1`,
      args: [Date.now()],
    })

    console.log('\nCube build complete.')
  } catch (err) {
    await client.execute({ sql: `UPDATE meta_cube_status SET status = 'failed' WHERE id = 1`, args: [] })
    throw err
  } finally {
    client.close()
  }
}

main().catch(console.error)

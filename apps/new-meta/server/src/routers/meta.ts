import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { router, publicProcedure } from '../trpc.js'

const FrameSchema = z.string().optional()

export const metaRouter = router({
  factions: publicProcedure
    .input(z.object({ frame: FrameSchema, minGames: z.number().int().min(1).default(5) }).optional())
    .query(async ({ ctx, input }) => {
      // Resolve frame: use given frame or latest quarter
      let frameId = input?.frame
      if (!frameId) {
        const latest = await ctx.db.all(sql`SELECT id FROM meta_for WHERE type_id = 4 ORDER BY date DESC LIMIT 1`)
        frameId = (latest[0] as any)?.id ?? null
        if (!frameId) return []
      }

      const rows = await ctx.db.all(sql`
        SELECT mt.faction_id, df.name AS faction, df.allegiance,
               mt.win_rate, mt.draw_rate, mt.over_rep, mt.four_oh_start,
               mt.event_wins, mt.event_finals, mt.event_top4, mt.event_top8, mt.event_top16,
               mt.player_pop_pct, mt.wins, mt.losses, mt.draws, mt.games, mt.players
        FROM meta_top mt
        JOIN dim_faction df ON mt.faction_id = df.id
        WHERE mt.meta_for_id = ${frameId} AND mt.granularity_id = 1
        ORDER BY mt.win_rate DESC
      `)

      const minGames = input?.minGames ?? 5
      return (rows as any[])
        .filter(r => r.games >= minGames)
        .map(r => ({
          factionId: r.faction_id,
          faction: r.faction,
          allegiance: r.allegiance,
          winRate: r.win_rate,
          drawRate: r.draw_rate,
          overRep: r.over_rep,
          fourOhStart: r.four_oh_start,
          eventWins: r.event_wins,
          eventFinals: r.event_finals,
          eventTop4: r.event_top4,
          eventTop8: r.event_top8,
          eventTop16: r.event_top16,
          playerPopPct: r.player_pop_pct,
          wins: r.wins,
          losses: r.losses,
          draws: r.draws,
          games: r.games,
          players: r.players,
        }))
    }),

  faction: publicProcedure
    .input(z.object({ factionId: z.string(), frame: FrameSchema }))
    .query(async ({ ctx, input }) => {
      let frameId = input.frame
      if (!frameId) {
        const latest = await ctx.db.all(sql`SELECT id FROM meta_for WHERE type_id = 4 ORDER BY date DESC LIMIT 1`)
        frameId = (latest[0] as any)?.id ?? null
      }

      // Faction stats
      let stat = null
      if (frameId) {
        const statRows = await ctx.db.all(sql`
          SELECT mt.*, df.name AS faction FROM meta_top mt
          JOIN dim_faction df ON mt.faction_id = df.id
          WHERE mt.faction_id = ${input.factionId} AND mt.meta_for_id = ${frameId} AND mt.granularity_id = 1
        `)
        const r = (statRows as any[])[0]
        if (r) {
          stat = {
            faction: r.faction, winRate: r.win_rate, drawRate: r.draw_rate,
            overRep: r.over_rep, games: r.games, players: r.players,
            eventWins: r.event_wins, eventTop4: r.event_top4, eventTop8: r.event_top8,
            playerPopPct: r.player_pop_pct, wins: r.wins, losses: r.losses, draws: r.draws,
          }
        }
      }

      // Detachments
      const detRows = await ctx.db.all(sql`
        SELECT dd.name AS detachment, dd.id AS detachment_id,
               COUNT(*) AS games,
               SUM(CASE WHEN f.result = 1.0 THEN 1 ELSE 0 END) AS wins,
               SUM(CASE WHEN f.result = 0.0 THEN 1 ELSE 0 END) AS losses,
               SUM(CASE WHEN f.result = 0.5 THEN 1 ELSE 0 END) AS draws,
               AVG(f.result) AS win_rate,
               COUNT(DISTINCT f.player_id) AS players
        FROM fact_game_results f
        JOIN dim_detachment dd ON f.detachment_id = dd.id
        WHERE f.faction_id = ${input.factionId} AND f.detachment_id IS NOT NULL
        GROUP BY dd.id HAVING games >= 5 ORDER BY win_rate DESC
      `)
      const detachments = (detRows as any[]).map(r => ({
        detachment: r.detachment, detachmentId: r.detachment_id, winRate: r.win_rate,
        games: r.games, wins: r.wins, losses: r.losses, draws: r.draws, players: r.players,
      }))

      // Timeline (weekly)
      const tlRows = await ctx.db.all(sql`
        SELECT mf.date, mt.win_rate, mt.games, mt.wins, mt.losses, mt.draws
        FROM meta_top mt JOIN meta_for mf ON mt.meta_for_id = mf.id
        WHERE mt.faction_id = ${input.factionId} AND mt.granularity_id = 1 AND mf.type_id = 2
        ORDER BY mf.date
      `)
      const timeline = (tlRows as any[]).map(r => ({
        date: r.date, week: new Date(r.date).toISOString().slice(0, 10),
        winRate: r.win_rate, games: r.games, wins: r.wins, losses: r.losses, draws: r.draws,
      }))

      // Top lists
      const listRows = await ctx.db.all(sql`
        SELECT ep.player_name, ep.placement, ep.list_text, ep.wins, ep.losses, ep.draws,
               dd.name AS detachment, me.name AS event_name, me.date AS event_date, me.format
        FROM meta_event_players ep
        JOIN meta_events me ON ep.event_id = me.id
        LEFT JOIN dim_detachment dd ON ep.detachment_id = dd.id
        WHERE ep.faction_id = ${input.factionId}
        ORDER BY ep.placement ASC LIMIT 20
      `)
      const topLists = (listRows as any[]).map(r => ({
        playerName: r.player_name, placement: r.placement, listText: r.list_text,
        detachment: r.detachment, eventName: r.event_name, eventDate: r.event_date,
        format: r.format, wins: r.wins, losses: r.losses, draws: r.draws,
      }))

      return { stat, detachments, timeline, topLists }
    }),

  matchups: publicProcedure
    .input(z.object({ frame: FrameSchema, minGames: z.number().int().min(1).default(3) }).optional())
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.all(sql`
        SELECT df1.name AS faction_a, df2.name AS faction_b,
               SUM(CASE WHEN f.result = 1.0 THEN 1 ELSE 0 END) AS a_wins,
               SUM(CASE WHEN f.result = 0.0 THEN 1 ELSE 0 END) AS b_wins,
               SUM(CASE WHEN f.result = 0.5 THEN 1 ELSE 0 END) AS draws,
               COUNT(*) AS total_games,
               AVG(f.result) AS a_win_rate
        FROM fact_game_results f
        JOIN dim_faction df1 ON f.faction_id = df1.id
        JOIN dim_faction df2 ON f.opponent_faction_id = df2.id
        WHERE f.faction_id < f.opponent_faction_id AND f.opponent_faction_id IS NOT NULL
        GROUP BY f.faction_id, f.opponent_faction_id
        HAVING total_games >= ${input?.minGames ?? 3}
      `)
      return (rows as any[]).map(r => ({
        factionA: r.faction_a, factionB: r.faction_b,
        aWins: r.a_wins, bWins: r.b_wins, draws: r.draws,
        totalGames: r.total_games, aWinRate: r.a_win_rate,
      }))
    }),

  frames: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.all(sql`
      SELECT mf.id, mf.type_id, dft.name AS type_name, mf.date, mf.end_date, mf.month, mf.quarter, mf.year
      FROM meta_for mf JOIN dim_for_type dft ON mf.type_id = dft.id
      WHERE mf.type_id IN (1, 3, 4, 5, 6) ORDER BY mf.date DESC
    `)
    return (rows as any[]).map(r => ({
      id: r.id, typeId: r.type_id, typeName: r.type_name,
      date: r.date, endDate: r.end_date, month: r.month, quarter: r.quarter, year: r.year,
      label: r.type_id === 4 ? `${r.year} Q${r.quarter}` :
             r.type_id === 3 ? `${r.year}-${String(r.month).padStart(2, '0')}` :
             r.type_id === 5 ? `${r.year}` :
             r.type_id === 6 ? r.id.replace('dataslate:', 'Dataslate: ') :
             r.id.replace('event:', ''),
    }))
  }),

  windows: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.all(sql`SELECT DISTINCT id FROM meta_for WHERE type_id = 4 ORDER BY date DESC`)
    return (rows as any[]).map(r => r.id as string)
  }),
})

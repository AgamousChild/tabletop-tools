import { sql } from 'drizzle-orm'
import { z } from 'zod'

import { publicProcedure, router } from '../trpc.js'

export const sourceRouter = router({
  tournaments: publicProcedure
    .input(
      z
        .object({
          format: z.string().optional(),
          limit: z.number().int().min(1).max(200).default(50),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const rows = input?.format
        ? await ctx.db.all(sql`
            SELECT me.id, me.name, me.date, me.format, me.location, me.player_count, me.rounds,
                   df.name AS winner_faction
            FROM meta_events me LEFT JOIN dim_faction df ON me.win_faction_id = df.id
            WHERE me.format = ${input.format}
            ORDER BY me.date DESC LIMIT ${input.limit ?? 50}
          `)
        : await ctx.db.all(sql`
            SELECT me.id, me.name, me.date, me.format, me.location, me.player_count, me.rounds,
                   df.name AS winner_faction
            FROM meta_events me LEFT JOIN dim_faction df ON me.win_faction_id = df.id
            ORDER BY me.date DESC LIMIT ${input?.limit ?? 50}
          `)

      return (rows as any[]).map((r) => ({
        eventId: r.id,
        eventName: r.name,
        eventDate: r.date,
        format: r.format,
        location: r.location,
        playerCount: r.player_count,
        rounds: r.rounds,
        winnerFaction: r.winner_faction,
      }))
    }),

  tournament: publicProcedure
    .input(z.object({ eventId: z.string() }))
    .query(async ({ ctx, input }) => {
      const eventRows = await ctx.db.all(sql`
        SELECT me.*, df.name AS winner_faction
        FROM meta_events me LEFT JOIN dim_faction df ON me.win_faction_id = df.id
        WHERE me.id = ${input.eventId}
      `)
      const event = (eventRows as any[])[0]
      if (!event) return null

      // Every detachment the army brought, in written order. ep.detachment_id
      // holds only the first, so a two-detachment 11e army would be shown as
      // something it is not.
      const playerRows = await ctx.db.all(sql`
        SELECT ep.player_name, ep.placement, ep.list_text, ep.wins, ep.losses, ep.draws,
               df.name AS faction,
               COALESCE(
                 (SELECT GROUP_CONCAT(dd2.name, ' + ')
                    FROM (SELECT pd.detachment_id FROM meta_event_player_detachment pd
                           WHERE pd.player_id = ep.id ORDER BY pd.position) ordered
                    JOIN dim_detachment dd2 ON ordered.detachment_id = dd2.id),
                 dd.name
               ) AS detachment
        FROM meta_event_players ep
        JOIN dim_faction df ON ep.faction_id = df.id
        LEFT JOIN dim_detachment dd ON ep.detachment_id = dd.id
        WHERE ep.event_id = ${input.eventId}
        ORDER BY ep.placement ASC
      `)

      const distRows = await ctx.db.all(sql`
        SELECT wins, player_count, player_pct
        FROM meta_event_win_distribution WHERE event_id = ${input.eventId}
        ORDER BY wins ASC
      `)

      return {
        eventId: event.id,
        eventName: event.name,
        eventDate: event.date,
        format: event.format,
        location: event.location,
        rounds: event.rounds,
        playerCount: event.player_count,
        winnerFaction: event.winner_faction,
        players: (playerRows as any[]).map((r) => ({
          playerName: r.player_name,
          placement: r.placement,
          faction: r.faction,
          detachment: r.detachment,
          wins: r.wins,
          losses: r.losses,
          draws: r.draws,
          listText: r.list_text,
        })),
        winDistribution: (distRows as any[]).map((r) => ({
          wins: r.wins,
          playerCount: r.player_count,
          playerPct: r.player_pct,
        })),
      }
    }),
})

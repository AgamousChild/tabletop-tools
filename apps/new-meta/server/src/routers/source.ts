import { z } from 'zod'
import { eq, desc, and, gte, lte } from 'drizzle-orm'
import { router, publicProcedure } from '../trpc.js'
import { importedTournamentResults } from '@tabletop-tools/db'
import type { TournamentRecord } from '@tabletop-tools/game-content'

export const sourceRouter = router({
  /** List imported tournaments with summary stats. */
  tournaments: publicProcedure
    .input(
      z.object({
        format: z.string().optional(),
        after: z.number().optional(),   // event_date timestamp
        before: z.number().optional(),  // event_date timestamp
        limit: z.number().int().min(1).max(100).default(20),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(importedTournamentResults)
        .orderBy(desc(importedTournamentResults.eventDate))

      return rows
        .filter((r: any) => {
          if (input?.format && r.format !== input.format) return false
          if (input?.after && r.eventDate < input.after) return false
          if (input?.before && r.eventDate > input.before) return false
          return true
        })
        .slice(0, input?.limit ?? 20)
        .map((r: any) => {
          let playerCount = 0
          try {
            const parsed: TournamentRecord[] = JSON.parse(r.parsedData)
            playerCount = parsed.reduce((sum, rec) => sum + rec.players.length, 0)
          } catch {}
          return {
            importId: r.id,
            eventName: r.eventName,
            eventDate: r.eventDate,
            format: r.format,
            metaWindow: r.metaWindow,
            playerCount,
            importedAt: r.importedAt,
          }
        })
    }),

  /** Single tournament detail — all players, results, lists. */
  tournament: publicProcedure
    .input(z.object({ importId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select()
        .from(importedTournamentResults)
        .where(eq(importedTournamentResults.id, input.importId))
        .limit(1)

      if (!row) return null

      let records: TournamentRecord[] = []
      try {
        records = JSON.parse(row.parsedData)
      } catch {}

      const players = records.flatMap((rec) =>
        rec.players.map((p) => ({
          ...p,
          eventName: rec.eventName,
          eventDate: rec.eventDate,
        })),
      )

      return {
        importId: row.id,
        eventName: row.eventName,
        eventDate: row.eventDate,
        format: row.format,
        metaWindow: row.metaWindow,
        importedAt: row.importedAt,
        players,
      }
    }),

  /** Download raw source data for a tournament. */
  download: publicProcedure
    .input(
      z.object({
        importId: z.string(),
        format: z.enum(['json', 'csv']),
      }),
    )
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select()
        .from(importedTournamentResults)
        .where(eq(importedTournamentResults.id, input.importId))
        .limit(1)

      if (!row) return null

      if (input.format === 'csv') {
        return row.rawData
      }

      // json — return the parsed + reformatted JSON
      try {
        const parsed = JSON.parse(row.parsedData)
        return JSON.stringify(parsed, null, 2)
      } catch {
        return row.parsedData
      }
    }),
})

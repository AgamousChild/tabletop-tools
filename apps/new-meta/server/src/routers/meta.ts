import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { router, publicProcedure } from '../trpc.js'
import { importedTournamentResults } from '@tabletop-tools/db'
import type { TournamentRecord } from '@tabletop-tools/game-content'
import type { Db } from '@tabletop-tools/db'
import {
  computeFactionStats,
  computeDetachmentStats,
  computeMatchups,
  computeTimeline,
  getTopLists,
} from '../lib/aggregate.js'

const MetaWindowSchema = z.string().optional()
const FormatSchema = z.string().optional()
const MinGamesSchema = z.number().int().min(1).default(5)

/** Load TournamentRecord[] from the DB, filtered by metaWindow and format in SQL. */
async function loadRecords(
  db: Db,
  opts: { metaWindow?: string; format?: string },
): Promise<TournamentRecord[]> {
  const conditions = []
  if (opts.metaWindow) {
    conditions.push(eq(importedTournamentResults.metaWindow, opts.metaWindow))
  }
  if (opts.format) {
    conditions.push(eq(importedTournamentResults.format, opts.format))
  }

  const query = conditions.length > 0
    ? db.select().from(importedTournamentResults).where(and(...conditions))
    : db.select().from(importedTournamentResults)

  const rows = await query

  const records: TournamentRecord[] = []
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.parsedData)
      if (Array.isArray(parsed)) records.push(...parsed)
    } catch {
      // skip malformed rows
    }
  }
  return records
}

export const metaRouter = router({
  /** Faction win rates, representation, sorted by win rate. */
  factions: publicProcedure
    .input(
      z.object({
        metaWindow: MetaWindowSchema,
        format: FormatSchema,
        minGames: MinGamesSchema,
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      const records = await loadRecords(ctx.db, {
        metaWindow: input?.metaWindow,
        format: input?.format,
      })
      const stats = computeFactionStats(records)
      const minGames = input?.minGames ?? 5
      return stats.filter((s) => s.games >= minGames)
    }),

  /** Detail for one faction: stats + timeline + top lists. */
  faction: publicProcedure
    .input(
      z.object({
        faction: z.string(),
        metaWindow: MetaWindowSchema,
        format: FormatSchema,
      }),
    )
    .query(async ({ ctx, input }) => {
      const records = await loadRecords(ctx.db, {
        metaWindow: input.metaWindow,
        format: input.format,
      })
      const allStats = computeFactionStats(records)
      const stat = allStats.find((s) => s.faction === input.faction) ?? null
      const detachments = computeDetachmentStats(records).filter(
        (d) => d.faction === input.faction,
      )
      const timeline = computeTimeline(records, input.faction)
      const topLists = getTopLists(records, { faction: input.faction, limit: 20 })

      return { stat, detachments, timeline, topLists }
    }),

  /** Detachment stats, optionally filtered by faction. */
  detachments: publicProcedure
    .input(
      z.object({
        faction: z.string().optional(),
        metaWindow: MetaWindowSchema,
        format: FormatSchema,
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      const records = await loadRecords(ctx.db, {
        metaWindow: input?.metaWindow,
        format: input?.format,
      })
      const stats = computeDetachmentStats(records)
      if (input?.faction) {
        return stats.filter((s) => s.faction === input.faction)
      }
      return stats
    }),

  /** Faction matchup matrix. */
  matchups: publicProcedure
    .input(
      z.object({
        metaWindow: MetaWindowSchema,
        format: FormatSchema,
        minGames: MinGamesSchema,
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      const records = await loadRecords(ctx.db, {
        metaWindow: input?.metaWindow,
        format: input?.format,
      })
      const cells = computeMatchups(records)
      const minGames = input?.minGames ?? 5
      return cells.filter((c) => c.totalGames >= minGames)
    }),

  /** Top competitive lists (includes list text). */
  lists: publicProcedure
    .input(
      z.object({
        faction: z.string().optional(),
        detachment: z.string().optional(),
        metaWindow: MetaWindowSchema,
        limit: z.number().int().min(1).max(100).default(20),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      const records = await loadRecords(ctx.db, {
        metaWindow: input?.metaWindow,
      })
      return getTopLists(records, {
        faction: input?.faction,
        detachment: input?.detachment,
        limit: input?.limit ?? 20,
      })
    }),

  /** Win rate over time. */
  timeline: publicProcedure
    .input(
      z.object({
        faction: z.string().optional(),
        metaWindow: MetaWindowSchema,
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      const records = await loadRecords(ctx.db, { metaWindow: input?.metaWindow })
      return computeTimeline(records, input?.faction)
    }),

  /** Available meta windows (distinct values from imported data). */
  windows: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(importedTournamentResults)
    const windows = [...new Set(rows.map((r: any) => r.metaWindow as string))]
    return windows.sort()
  }),
})

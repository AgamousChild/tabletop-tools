import {
  rankingMetric,
  tournamentPairingMetric,
  tournamentPlacingMetric,
  tournaments,
} from '@tabletop-tools/db'
import { TRPCError } from '@trpc/server'
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'

import { protectedProcedure, publicProcedure, router } from '../trpc'

const stackTypeSchema = z.enum(['pairing', 'placing'])

export const metricRouter = router({
  /** List all available ranking metric definitions from the catalog. */
  listMetrics: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(rankingMetric).all()
  }),

  /**
   * Upsert a ranking metric definition (TO-only, for custom metrics).
   * Standard metrics are seeded via migration seed data.
   */
  upsertMetric: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        key: z.string().min(1),
        label: z.string().min(1),
        description: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .insert(rankingMetric)
        .values({
          id: input.id,
          key: input.key,
          label: input.label,
          description: input.description ?? null,
        })
        .onConflictDoUpdate({
          target: rankingMetric.id,
          set: {
            key: input.key,
            label: input.label,
            description: input.description ?? null,
          },
        })

      return ctx.db.select().from(rankingMetric).where(eq(rankingMetric.id, input.id)).get()
    }),

  /**
   * Get the ordered metric stack for a tournament.
   * Returns pairing or placing metrics sorted by sort_order ascending.
   */
  getStack: publicProcedure
    .input(z.object({ tournamentId: z.string(), stackType: stackTypeSchema }))
    .query(async ({ ctx, input }) => {
      const table =
        input.stackType === 'pairing' ? tournamentPairingMetric : tournamentPlacingMetric

      const rows = await ctx.db
        .select({
          id: table.id,
          tournamentId: table.tournamentId,
          rankingMetricId: table.rankingMetricId,
          sortOrder: table.sortOrder,
          enabled: table.enabled,
          key: rankingMetric.key,
          label: rankingMetric.label,
          description: rankingMetric.description,
        })
        .from(table)
        .innerJoin(rankingMetric, eq(table.rankingMetricId, rankingMetric.id))
        .where(eq(table.tournamentId, input.tournamentId))
        .orderBy(asc(table.sortOrder))
        .all()

      return rows
    }),

  /**
   * Replace the entire metric stack for a tournament (pairing or placing).
   * Deletes existing rows then inserts the new ordered set.
   * TO-only operation.
   */
  setStack: protectedProcedure
    .input(
      z.object({
        tournamentId: z.string(),
        stackType: stackTypeSchema,
        metrics: z.array(
          z.object({
            rankingMetricId: z.string(),
            sortOrder: z.number().int().min(0),
            enabled: z.boolean().default(true),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tournament = await ctx.db
        .select()
        .from(tournaments)
        .where(eq(tournaments.id, input.tournamentId))
        .get()
      if (!tournament) throw new TRPCError({ code: 'NOT_FOUND', message: 'Tournament not found' })
      if (tournament.toUserId !== ctx.user.id)
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' })

      const table =
        input.stackType === 'pairing' ? tournamentPairingMetric : tournamentPlacingMetric

      await ctx.db.delete(table).where(eq(table.tournamentId, input.tournamentId))

      if (input.metrics.length > 0) {
        await ctx.db.insert(table).values(
          input.metrics.map((m) => ({
            id: crypto.randomUUID(),
            tournamentId: input.tournamentId,
            rankingMetricId: m.rankingMetricId,
            sortOrder: m.sortOrder,
            enabled: m.enabled,
          })),
        )
      }

      // Return the new stack with metric details
      const rows = await ctx.db
        .select({
          id: table.id,
          tournamentId: table.tournamentId,
          rankingMetricId: table.rankingMetricId,
          sortOrder: table.sortOrder,
          enabled: table.enabled,
          key: rankingMetric.key,
          label: rankingMetric.label,
          description: rankingMetric.description,
        })
        .from(table)
        .innerJoin(rankingMetric, eq(table.rankingMetricId, rankingMetric.id))
        .where(eq(table.tournamentId, input.tournamentId))
        .orderBy(asc(table.sortOrder))
        .all()

      return rows
    }),
})

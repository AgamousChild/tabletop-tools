import { eq, desc, and } from 'drizzle-orm'
import { z } from 'zod'
import { unitRatings } from '@tabletop-tools/db'

import { protectedProcedure, router } from '../trpc'

export const ratingRouter = router({
  get: protectedProcedure
    .input(z.object({ unitId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [rating] = await ctx.db
        .select()
        .from(unitRatings)
        .where(eq(unitRatings.unitContentId, input.unitId))
        .orderBy(desc(unitRatings.computedAt))
        .limit(1)
      return rating ?? null
    }),

  alternatives: protectedProcedure
    .input(
      z.object({
        ptsMin: z.number().optional(),
        ptsMax: z.number().optional(),
        metaWindow: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Filter by metaWindow in SQL to reduce result set
      const conditions = []
      if (input.metaWindow) conditions.push(eq(unitRatings.metaWindow, input.metaWindow))

      const allRatings = await ctx.db
        .select()
        .from(unitRatings)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(unitRatings.winContrib))

      if (allRatings.length === 0) return []

      // For each rated unit, fetch its profile to check points cost
      // (getUnit is an in-memory lookup via GameContentAdapter, not a DB query)
      const results: Array<typeof unitRatings.$inferSelect & { points: number }> = []

      for (const r of allRatings) {
        const unit = await ctx.gameContent.getUnit(r.unitContentId)
        if (!unit) continue
        if (input.ptsMin != null && unit.points < input.ptsMin) continue
        if (input.ptsMax != null && unit.points > input.ptsMax) continue
        results.push({ ...r, points: unit.points })
      }

      return results
    }),
})

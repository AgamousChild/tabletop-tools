import { eq, desc } from 'drizzle-orm'
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
      // Get all rated units, then filter by points range via the content adapter
      const allRatings = await ctx.db
        .select()
        .from(unitRatings)
        .orderBy(desc(unitRatings.winContrib))

      if (allRatings.length === 0) return []

      // For each rated unit, fetch its profile to check points cost
      const results: Array<typeof unitRatings.$inferSelect & { points: number }> = []

      for (const r of allRatings) {
        const unit = await ctx.gameContent.getUnit(r.unitContentId)
        if (!unit) continue
        if (input.ptsMin != null && unit.points < input.ptsMin) continue
        if (input.ptsMax != null && unit.points > input.ptsMax) continue
        if (input.metaWindow && r.metaWindow !== input.metaWindow) continue
        results.push({ ...r, points: unit.points })
      }

      return results
    }),
})

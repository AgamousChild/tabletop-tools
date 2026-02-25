import { eq, desc, and } from 'drizzle-orm'
import { z } from 'zod'
import { unitRatings } from '@tabletop-tools/db'

import { protectedProcedure, router } from '@tabletop-tools/server-core'

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
        metaWindow: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = []
      if (input.metaWindow) conditions.push(eq(unitRatings.metaWindow, input.metaWindow))

      return ctx.db
        .select()
        .from(unitRatings)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(unitRatings.winContrib))
    }),
})

import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { protectedProcedure, router } from '../trpc'

export const unitRouter = router({
  listFactions: protectedProcedure.query(async ({ ctx }) => {
    return ctx.gameContent.listFactions()
  }),

  search: protectedProcedure
    .input(
      z.object({
        faction: z.string().optional(),
        query: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.gameContent.searchUnits({
        faction: input.faction,
        name: input.query,
      })
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const unit = await ctx.gameContent.getUnit(input.id)
      if (!unit) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Unit not found' })
      }
      return unit
    }),
})

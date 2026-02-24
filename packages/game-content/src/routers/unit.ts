import { initTRPC, TRPCError } from '@trpc/server'
import { z } from 'zod'
import type { GameContentAdapter } from '../types'

/**
 * Minimal context shape the unit router requires.
 * Apps must include at least these fields in their tRPC context.
 */
type UnitRouterContext = {
  user: { id: string; email: string; name: string } | null
  gameContent: GameContentAdapter
}

const t = initTRPC.context<UnitRouterContext>().create()

const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return next({ ctx: { ...ctx, user: ctx.user } })
})

/**
 * Shared unit router for apps that use GameContentAdapter.
 * Uses its own tRPC instance so return types are fully preserved.
 * The router can be nested in any app's main router — tRPC handles
 * cross-instance router composition at runtime.
 */
export function createUnitRouter() {
  return t.router({
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
}

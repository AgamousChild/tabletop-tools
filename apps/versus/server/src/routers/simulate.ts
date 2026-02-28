import { TRPCError } from '@trpc/server'
import { simulations } from '@tabletop-tools/db'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'

import { protectedProcedure, router } from '@tabletop-tools/server-core'

const simResultSchema = z.object({
  expectedWounds: z.number(),
  expectedModelsRemoved: z.number(),
  survivors: z.number(),
  worstCase: z.object({ wounds: z.number(), modelsRemoved: z.number() }),
  bestCase: z.object({ wounds: z.number(), modelsRemoved: z.number() }),
})

export const simulateRouter = router({
  save: protectedProcedure
    .input(
      z.object({
        attackerId: z.string(),
        attackerName: z.string(),
        defenderId: z.string(),
        defenderName: z.string(),
        result: simResultSchema,
        weaponConfig: z.string().optional(),
        configHash: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const id = crypto.randomUUID()
      await ctx.db.insert(simulations).values({
        id,
        userId: ctx.user.id,
        attackerContentId: input.attackerId,
        attackerName: input.attackerName,
        defenderContentId: input.defenderId,
        defenderName: input.defenderName,
        result: JSON.stringify(input.result),
        weaponConfig: input.weaponConfig ?? null,
        configHash: input.configHash ?? null,
        createdAt: Date.now(),
      })
      return { id }
    }),

  history: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(simulations)
      .where(eq(simulations.userId, ctx.user.id))
      .orderBy(desc(simulations.createdAt))
  }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [sim] = await ctx.db
        .select()
        .from(simulations)
        .where(and(eq(simulations.id, input.id), eq(simulations.userId, ctx.user.id)))
      if (!sim) throw new TRPCError({ code: 'NOT_FOUND', message: 'Simulation not found' })
      await ctx.db.delete(simulations).where(eq(simulations.id, input.id))
      return { success: true }
    }),

  lookup: protectedProcedure
    .input(z.object({ configHash: z.string() }))
    .query(async ({ ctx, input }) => {
      const cached = await ctx.db
        .select()
        .from(simulations)
        .where(eq(simulations.configHash, input.configHash))
        .limit(1)
        .get()
      if (!cached) return null
      return {
        id: cached.id,
        result: JSON.parse(cached.result) as z.infer<typeof simResultSchema>,
        weaponConfig: cached.weaponConfig,
        createdAt: cached.createdAt,
      }
    }),
})

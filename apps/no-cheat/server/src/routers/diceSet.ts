import { TRPCError } from '@trpc/server'
import { diceSets } from '@tabletop-tools/db'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'

import { protectedProcedure, router } from '../trpc'

export const diceSetRouter = router({
  create: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const id = crypto.randomUUID()
      const now = Date.now()

      await ctx.db.insert(diceSets).values({
        id,
        userId: ctx.user.id,
        name: input.name,
        createdAt: now,
      })

      const [created] = await ctx.db.select().from(diceSets).where(eq(diceSets.id, id))

      return created!
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(diceSets)
      .where(eq(diceSets.userId, ctx.user.id))
      .orderBy(desc(diceSets.createdAt))
  }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [ds] = await ctx.db
        .select()
        .from(diceSets)
        .where(and(eq(diceSets.id, input.id), eq(diceSets.userId, ctx.user.id)))
      if (!ds) throw new TRPCError({ code: 'NOT_FOUND', message: 'Dice set not found' })
      await ctx.db.delete(diceSets).where(eq(diceSets.id, input.id))
      return { success: true }
    }),
})

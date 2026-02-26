import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { tournaments, tournamentAwards } from '@tabletop-tools/db'
import { router, protectedProcedure } from '../trpc'

export const awardRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        tournamentId: z.string(),
        name: z.string().min(1),
        description: z.string().optional(),
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

      const id = crypto.randomUUID()
      await ctx.db.insert(tournamentAwards).values({
        id,
        tournamentId: input.tournamentId,
        name: input.name,
        description: input.description ?? null,
        recipientId: null,
        createdAt: Date.now(),
      })

      return ctx.db.select().from(tournamentAwards).where(eq(tournamentAwards.id, id)).get()
    }),

  assign: protectedProcedure
    .input(
      z.object({
        awardId: z.string(),
        recipientId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const award = await ctx.db
        .select()
        .from(tournamentAwards)
        .where(eq(tournamentAwards.id, input.awardId))
        .get()
      if (!award) throw new TRPCError({ code: 'NOT_FOUND', message: 'Award not found' })

      const tournament = await ctx.db
        .select()
        .from(tournaments)
        .where(eq(tournaments.id, award.tournamentId))
        .get()
      if (!tournament || tournament.toUserId !== ctx.user.id)
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' })

      await ctx.db
        .update(tournamentAwards)
        .set({ recipientId: input.recipientId })
        .where(eq(tournamentAwards.id, input.awardId))

      return ctx.db.select().from(tournamentAwards).where(eq(tournamentAwards.id, input.awardId)).get()
    }),

  list: protectedProcedure
    .input(z.object({ tournamentId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(tournamentAwards)
        .where(eq(tournamentAwards.tournamentId, input.tournamentId))
        .all()
    }),
})

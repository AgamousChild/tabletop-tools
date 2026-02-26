import { TRPCError } from '@trpc/server'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { matches, matchSecondaries } from '@tabletop-tools/db'

import { protectedProcedure, router } from '../trpc'

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export const secondaryRouter = router({
  set: protectedProcedure
    .input(
      z.object({
        matchId: z.string(),
        player: z.enum(['YOUR', 'THEIRS']),
        secondaryName: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [match] = await ctx.db
        .select()
        .from(matches)
        .where(and(eq(matches.id, input.matchId), eq(matches.userId, ctx.user.id)))
      if (!match) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Match not found' })
      }

      const id = generateId()
      await ctx.db.insert(matchSecondaries).values({
        id,
        matchId: input.matchId,
        player: input.player,
        secondaryName: input.secondaryName,
        vpPerRound: '[]',
      })

      const [row] = await ctx.db
        .select()
        .from(matchSecondaries)
        .where(eq(matchSecondaries.id, id))
      return row!
    }),

  score: protectedProcedure
    .input(
      z.object({
        secondaryId: z.string(),
        roundNumber: z.number().int().min(1).max(5),
        vp: z.number().int().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [secondary] = await ctx.db
        .select()
        .from(matchSecondaries)
        .where(eq(matchSecondaries.id, input.secondaryId))
      if (!secondary) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Secondary not found' })
      }

      // Verify match ownership
      const [match] = await ctx.db
        .select()
        .from(matches)
        .where(and(eq(matches.id, secondary.matchId), eq(matches.userId, ctx.user.id)))
      if (!match) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Match not found' })
      }

      const vpArr: number[] = JSON.parse(secondary.vpPerRound)
      // Extend array to 5 elements
      while (vpArr.length < 5) vpArr.push(0)
      vpArr[input.roundNumber - 1] = input.vp

      await ctx.db
        .update(matchSecondaries)
        .set({ vpPerRound: JSON.stringify(vpArr) })
        .where(eq(matchSecondaries.id, input.secondaryId))

      const [updated] = await ctx.db
        .select()
        .from(matchSecondaries)
        .where(eq(matchSecondaries.id, input.secondaryId))
      return updated!
    }),

  list: protectedProcedure
    .input(z.object({ matchId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [match] = await ctx.db
        .select()
        .from(matches)
        .where(and(eq(matches.id, input.matchId), eq(matches.userId, ctx.user.id)))
      if (!match) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Match not found' })
      }

      return ctx.db
        .select()
        .from(matchSecondaries)
        .where(eq(matchSecondaries.matchId, input.matchId))
    }),

  remove: protectedProcedure
    .input(z.object({ secondaryId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [secondary] = await ctx.db
        .select()
        .from(matchSecondaries)
        .where(eq(matchSecondaries.id, input.secondaryId))
      if (!secondary) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Secondary not found' })
      }

      // Verify match ownership
      const [match] = await ctx.db
        .select()
        .from(matches)
        .where(and(eq(matches.id, secondary.matchId), eq(matches.userId, ctx.user.id)))
      if (!match) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Match not found' })
      }

      await ctx.db
        .delete(matchSecondaries)
        .where(eq(matchSecondaries.id, input.secondaryId))
    }),
})

import { TRPCError } from '@trpc/server'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { matches, turns } from '@tabletop-tools/db'

import { protectedProcedure, router } from '../trpc'
import { deriveResult } from '../lib/scoring/result'

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export const matchRouter = router({
  start: protectedProcedure
    .input(
      z.object({
        opponentFaction: z.string(),
        mission: z.string(),
        listId: z.string().optional(),
        isTournament: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const id = generateId()
      const now = Date.now()
      await ctx.db.insert(matches).values({
        id,
        userId: ctx.user.id,
        listId: input.listId ?? null,
        opponentFaction: input.opponentFaction,
        mission: input.mission,
        result: null,
        yourFinalScore: null,
        theirFinalScore: null,
        isTournament: input.isTournament ? 1 : 0,
        createdAt: now,
        closedAt: null,
      })
      const [match] = await ctx.db
        .select()
        .from(matches)
        .where(eq(matches.id, id))
      return match!
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(matches)
      .where(eq(matches.userId, ctx.user.id))
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const [match] = await ctx.db
        .select()
        .from(matches)
        .where(and(eq(matches.id, input.id), eq(matches.userId, ctx.user.id)))
      if (!match) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Match not found' })
      }
      const matchTurns = await ctx.db
        .select()
        .from(turns)
        .where(eq(turns.matchId, input.id))
      return { ...match, turns: matchTurns }
    }),

  close: protectedProcedure
    .input(
      z.object({
        matchId: z.string(),
        yourScore: z.number().int().min(0),
        theirScore: z.number().int().min(0),
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

      const result = deriveResult(input.yourScore, input.theirScore)
      await ctx.db
        .update(matches)
        .set({
          result,
          yourFinalScore: input.yourScore,
          theirFinalScore: input.theirScore,
          closedAt: Date.now(),
        })
        .where(eq(matches.id, input.matchId))

      return { result, yourScore: input.yourScore, theirScore: input.theirScore }
    }),
})

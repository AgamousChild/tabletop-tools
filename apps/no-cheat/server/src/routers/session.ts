import { diceRollingSessions, diceSets, rolls } from '@tabletop-tools/db'
import { TRPCError } from '@trpc/server'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'

import { analyze } from '../lib/stats/analyze'
import type { R2Storage } from '../lib/storage/r2'
import { protectedProcedure, router } from '../trpc'

export const sessionRouter = router({
  start: protectedProcedure
    .input(
      z.object({
        diceSetId: z.string(),
        opponentName: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify the dice set belongs to the current user
      const [diceSet] = await ctx.db
        .select()
        .from(diceSets)
        .where(and(eq(diceSets.id, input.diceSetId), eq(diceSets.userId, ctx.user.id)))

      if (!diceSet) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Dice set not found' })
      }

      const id = crypto.randomUUID()
      const now = Date.now()

      await ctx.db.insert(diceRollingSessions).values({
        id,
        userId: ctx.user.id,
        diceSetId: input.diceSetId,
        opponentName: input.opponentName ?? null,
        createdAt: now,
      })

      const [session] = await ctx.db
        .select()
        .from(diceRollingSessions)
        .where(eq(diceRollingSessions.id, id))

      return session!
    }),

  addRoll: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        pipValues: z.array(z.number().int().min(1).max(6)).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify the session belongs to the current user
      const [session] = await ctx.db
        .select()
        .from(diceRollingSessions)
        .where(
          and(
            eq(diceRollingSessions.id, input.sessionId),
            eq(diceRollingSessions.userId, ctx.user.id),
          ),
        )

      if (!session) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Session not found' })
      }

      if (session.closedAt !== null) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Session is already closed' })
      }

      const rollId = crypto.randomUUID()
      await ctx.db.insert(rolls).values({
        id: rollId,
        sessionId: input.sessionId,
        pipValues: JSON.stringify(input.pipValues),
        createdAt: Date.now(),
      })

      // Fetch all rolls so far to compute running z-score
      const allRolls = await ctx.db.select().from(rolls).where(eq(rolls.sessionId, input.sessionId))

      const rollData = allRolls.map((r) => JSON.parse(r.pipValues) as number[])
      const { zScore } = analyze(rollData)

      return { rollCount: allRolls.length, zScore }
    }),

  close: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [session] = await ctx.db
        .select()
        .from(diceRollingSessions)
        .where(
          and(
            eq(diceRollingSessions.id, input.sessionId),
            eq(diceRollingSessions.userId, ctx.user.id),
          ),
        )

      if (!session) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Session not found' })
      }

      // Fetch all rolls and run full analysis
      const allRolls = await ctx.db.select().from(rolls).where(eq(rolls.sessionId, input.sessionId))

      const rollData = allRolls.map((r) => JSON.parse(r.pipValues) as number[])
      const { zScore, isLoaded, outlierFace, observedRate } = analyze(rollData)

      const closedAt = Date.now()

      await ctx.db
        .update(diceRollingSessions)
        .set({ zScore, isLoaded: isLoaded ? 1 : 0, closedAt })
        .where(eq(diceRollingSessions.id, input.sessionId))

      return { zScore, isLoaded, outlierFace, observedRate, rollCount: allRolls.length }
    }),

  list: protectedProcedure
    .input(z.object({ diceSetId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const conditions = [eq(diceRollingSessions.userId, ctx.user.id)]
      if (input.diceSetId) {
        conditions.push(eq(diceRollingSessions.diceSetId, input.diceSetId))
      }

      return ctx.db
        .select()
        .from(diceRollingSessions)
        .where(and(...conditions))
        .orderBy(desc(diceRollingSessions.createdAt))
    }),

  get: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [session] = await ctx.db
        .select()
        .from(diceRollingSessions)
        .where(
          and(
            eq(diceRollingSessions.id, input.sessionId),
            eq(diceRollingSessions.userId, ctx.user.id),
          ),
        )

      if (!session) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Session not found' })
      }

      const sessionRolls = await ctx.db
        .select()
        .from(rolls)
        .where(eq(rolls.sessionId, input.sessionId))
        .orderBy(rolls.createdAt)

      return { session, rolls: sessionRolls }
    }),

  savePhoto: protectedProcedure
    .input(z.object({ sessionId: z.string(), imageData: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [session] = await ctx.db
        .select()
        .from(diceRollingSessions)
        .where(
          and(
            eq(diceRollingSessions.id, input.sessionId),
            eq(diceRollingSessions.userId, ctx.user.id),
          ),
        )

      if (!session) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Session not found' })
      }
      if (!session.closedAt) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Session must be closed before saving a photo',
        })
      }
      if (!session.isLoaded) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Evidence photos are only saved for loaded dice',
        })
      }

      const buf = Buffer.from(input.imageData, 'base64')
      const key = `evidence/${input.sessionId}-${Date.now()}.jpg`
      const photoUrl = await ctx.storage.upload(key, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), 'image/jpeg')

      await ctx.db
        .update(diceRollingSessions)
        .set({ photoUrl })
        .where(eq(diceRollingSessions.id, input.sessionId))

      return { photoUrl }
    }),
})

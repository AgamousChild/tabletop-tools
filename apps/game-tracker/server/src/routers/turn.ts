import { TRPCError } from '@trpc/server'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { matches, turns } from '@tabletop-tools/db'

import { protectedProcedure, router } from '../trpc'

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

const unitLostSchema = z.object({
  contentId: z.string(),
  name: z.string(),
})

export const turnRouter = router({
  add: protectedProcedure
    .input(
      z.object({
        matchId: z.string(),
        turnNumber: z.number().int().positive(),
        yourUnitsLost: z.array(unitLostSchema),
        theirUnitsLost: z.array(unitLostSchema),
        primaryScored: z.number().int().min(0),
        secondaryScored: z.number().int().min(0),
        cpSpent: z.number().int().min(0),
        notes: z.string().optional(),
        photoDataUrl: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify match belongs to user
      const [match] = await ctx.db
        .select()
        .from(matches)
        .where(and(eq(matches.id, input.matchId), eq(matches.userId, ctx.user.id)))
      if (!match) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Match not found' })
      }

      // Upload photo if provided (NullR2Storage returns null if R2 not configured)
      let photoUrl: string | null = null
      if (input.photoDataUrl) {
        const key = `${input.matchId}/turn-${input.turnNumber}-${Date.now()}.jpg`
        photoUrl = await ctx.storage.upload(key, input.photoDataUrl)
      }

      const id = generateId()
      await ctx.db.insert(turns).values({
        id,
        matchId: input.matchId,
        turnNumber: input.turnNumber,
        photoUrl,
        yourUnitsLost: JSON.stringify(input.yourUnitsLost),
        theirUnitsLost: JSON.stringify(input.theirUnitsLost),
        primaryScored: input.primaryScored,
        secondaryScored: input.secondaryScored,
        cpSpent: input.cpSpent,
        notes: input.notes ?? null,
        createdAt: Date.now(),
      })

      const [turn] = await ctx.db
        .select()
        .from(turns)
        .where(eq(turns.id, id))
      return turn!
    }),

  update: protectedProcedure
    .input(
      z.object({
        turnId: z.string(),
        notes: z.string().optional(),
        primaryScored: z.number().int().min(0).optional(),
        secondaryScored: z.number().int().min(0).optional(),
        cpSpent: z.number().int().min(0).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify the turn's match belongs to user
      const [turn] = await ctx.db
        .select()
        .from(turns)
        .where(eq(turns.id, input.turnId))
      if (!turn) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Turn not found' })
      }

      const [match] = await ctx.db
        .select()
        .from(matches)
        .where(and(eq(matches.id, turn.matchId), eq(matches.userId, ctx.user.id)))
      if (!match) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Match not found' })
      }

      const updates: Partial<typeof turns.$inferInsert> = {}
      if (input.notes !== undefined) updates.notes = input.notes
      if (input.primaryScored !== undefined) updates.primaryScored = input.primaryScored
      if (input.secondaryScored !== undefined) updates.secondaryScored = input.secondaryScored
      if (input.cpSpent !== undefined) updates.cpSpent = input.cpSpent

      if (Object.keys(updates).length > 0) {
        await ctx.db.update(turns).set(updates).where(eq(turns.id, input.turnId))
      }

      const [updated] = await ctx.db
        .select()
        .from(turns)
        .where(eq(turns.id, input.turnId))
      return updated!
    }),
})

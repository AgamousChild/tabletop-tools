import { TRPCError } from '@trpc/server'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { matches, turns, stratagemLog } from '@tabletop-tools/db'

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
        // V3 per-player fields
        yourCpStart: z.number().int().min(0).optional(),
        yourCpGained: z.number().int().min(0).optional(),
        yourCpSpent: z.number().int().min(0).optional(),
        theirCpStart: z.number().int().min(0).optional(),
        theirCpGained: z.number().int().min(0).optional(),
        theirCpSpent: z.number().int().min(0).optional(),
        yourPrimary: z.number().int().min(0).optional(),
        theirPrimary: z.number().int().min(0).optional(),
        yourSecondary: z.number().int().min(0).optional(),
        theirSecondary: z.number().int().min(0).optional(),
        yourPhotoDataUrl: z.string().optional(),
        theirPhotoDataUrl: z.string().optional(),
        yourUnitsDestroyed: z.string().optional(),
        theirUnitsDestroyed: z.string().optional(),
        stratagems: z.array(z.object({
          player: z.enum(['YOUR', 'THEIRS']),
          stratagemName: z.string(),
          cpCost: z.number().int().min(0).default(1),
        })).optional(),
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

      // Upload photos if provided (NullR2Storage returns null if R2 not configured)
      let photoUrl: string | null = null
      if (input.photoDataUrl) {
        const key = `${input.matchId}/turn-${input.turnNumber}-${Date.now()}.jpg`
        photoUrl = await ctx.storage.upload(key, input.photoDataUrl)
      }
      let yourPhotoUrl: string | null = null
      if (input.yourPhotoDataUrl) {
        const key = `${input.matchId}/turn-${input.turnNumber}-your-${Date.now()}.jpg`
        yourPhotoUrl = await ctx.storage.upload(key, input.yourPhotoDataUrl)
      }
      let theirPhotoUrl: string | null = null
      if (input.theirPhotoDataUrl) {
        const key = `${input.matchId}/turn-${input.turnNumber}-their-${Date.now()}.jpg`
        theirPhotoUrl = await ctx.storage.upload(key, input.theirPhotoDataUrl)
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
        // V3 per-player fields
        yourCpStart: input.yourCpStart ?? 0,
        yourCpGained: input.yourCpGained ?? 1,
        yourCpSpent: input.yourCpSpent ?? 0,
        theirCpStart: input.theirCpStart ?? 0,
        theirCpGained: input.theirCpGained ?? 1,
        theirCpSpent: input.theirCpSpent ?? 0,
        yourPrimary: input.yourPrimary ?? 0,
        theirPrimary: input.theirPrimary ?? 0,
        yourSecondary: input.yourSecondary ?? 0,
        theirSecondary: input.theirSecondary ?? 0,
        yourPhotoUrl,
        theirPhotoUrl,
        yourUnitsDestroyed: input.yourUnitsDestroyed ?? '[]',
        theirUnitsDestroyed: input.theirUnitsDestroyed ?? '[]',
        createdAt: Date.now(),
      })

      // Write stratagem log entries
      if (input.stratagems?.length) {
        for (const s of input.stratagems) {
          await ctx.db.insert(stratagemLog).values({
            id: generateId(),
            turnId: id,
            player: s.player,
            stratagemName: s.stratagemName,
            cpCost: s.cpCost,
          })
        }
      }

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
        // V3 per-player fields
        yourCpStart: z.number().int().min(0).optional(),
        yourCpGained: z.number().int().min(0).optional(),
        yourCpSpent: z.number().int().min(0).optional(),
        theirCpStart: z.number().int().min(0).optional(),
        theirCpGained: z.number().int().min(0).optional(),
        theirCpSpent: z.number().int().min(0).optional(),
        yourPrimary: z.number().int().min(0).optional(),
        theirPrimary: z.number().int().min(0).optional(),
        yourSecondary: z.number().int().min(0).optional(),
        theirSecondary: z.number().int().min(0).optional(),
        yourUnitsDestroyed: z.string().optional(),
        theirUnitsDestroyed: z.string().optional(),
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
      // V3 per-player fields
      if (input.yourCpStart !== undefined) updates.yourCpStart = input.yourCpStart
      if (input.yourCpGained !== undefined) updates.yourCpGained = input.yourCpGained
      if (input.yourCpSpent !== undefined) updates.yourCpSpent = input.yourCpSpent
      if (input.theirCpStart !== undefined) updates.theirCpStart = input.theirCpStart
      if (input.theirCpGained !== undefined) updates.theirCpGained = input.theirCpGained
      if (input.theirCpSpent !== undefined) updates.theirCpSpent = input.theirCpSpent
      if (input.yourPrimary !== undefined) updates.yourPrimary = input.yourPrimary
      if (input.theirPrimary !== undefined) updates.theirPrimary = input.theirPrimary
      if (input.yourSecondary !== undefined) updates.yourSecondary = input.yourSecondary
      if (input.theirSecondary !== undefined) updates.theirSecondary = input.theirSecondary
      if (input.yourUnitsDestroyed !== undefined) updates.yourUnitsDestroyed = input.yourUnitsDestroyed
      if (input.theirUnitsDestroyed !== undefined) updates.theirUnitsDestroyed = input.theirUnitsDestroyed

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

import { diceSets, trainingExamples } from '@tabletop-tools/db'
import { TRPCError } from '@trpc/server'
import { and, count, desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'

import { protectedProcedure, router } from '../trpc'

const exampleInput = z.object({
  label: z.number().int().min(0).max(6),
  guess: z.number().int().min(0).max(6).nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  features: z.array(z.number()),
  imageBase64: z.string(), // base64-encoded grayscale ROI image
})

export const trainingRouter = router({
  saveExamples: protectedProcedure
    .input(z.object({
      diceSetId: z.string(),
      examples: z.array(exampleInput).min(1).max(20),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify dice set belongs to user
      const [diceSet] = await ctx.db
        .select()
        .from(diceSets)
        .where(and(eq(diceSets.id, input.diceSetId), eq(diceSets.userId, ctx.user.id)))

      if (!diceSet) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Dice set not found' })
      }

      const now = Date.now()
      let saved = 0

      for (const ex of input.examples) {
        const id = crypto.randomUUID()

        // Upload image to R2
        const imageData = Uint8Array.from(atob(ex.imageBase64), (c) => c.charCodeAt(0))
        const imageKey = `training/${input.diceSetId}/${id}.png`
        const imageUrl = await ctx.storage.upload(imageKey, imageData.buffer, 'image/png')

        const isCorrect = ex.guess != null ? (ex.label === ex.guess ? 1 : 0) : null

        await ctx.db.insert(trainingExamples).values({
          id,
          userId: ctx.user.id,
          diceSetId: input.diceSetId,
          label: ex.label,
          guess: ex.guess ?? null,
          confidence: ex.confidence ?? null,
          features: JSON.stringify(ex.features),
          imageUrl,
          isCorrect,
          createdAt: now,
        })
        saved++
      }

      return { saved }
    }),

  list: protectedProcedure
    .input(z.object({
      diceSetId: z.string().optional(),
      myOnly: z.boolean().optional(),
      label: z.number().int().min(0).max(6).optional(),
      limit: z.number().int().min(1).max(100).optional().default(50),
      offset: z.number().int().min(0).optional().default(0),
    }))
    .query(async ({ ctx, input }) => {
      const conditions = []

      if (input.diceSetId) {
        conditions.push(eq(trainingExamples.diceSetId, input.diceSetId))
      }
      if (input.myOnly) {
        conditions.push(eq(trainingExamples.userId, ctx.user.id))
      }
      if (input.label !== undefined) {
        conditions.push(eq(trainingExamples.label, input.label))
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined

      const examples = await ctx.db
        .select()
        .from(trainingExamples)
        .where(where)
        .orderBy(desc(trainingExamples.createdAt))
        .limit(input.limit)
        .offset(input.offset)

      return { examples }
    }),

  getStats: protectedProcedure
    .input(z.object({
      diceSetId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const allExamples = await ctx.db
        .select({
          label: trainingExamples.label,
          isCorrect: trainingExamples.isCorrect,
        })
        .from(trainingExamples)
        .where(eq(trainingExamples.diceSetId, input.diceSetId))

      const total = allExamples.length
      const correct = allExamples.filter((e) => e.isCorrect === 1).length
      const accuracy = total > 0 ? correct / total : 0

      const perLabel: Record<number, number> = {}
      for (const e of allExamples) {
        perLabel[e.label] = (perLabel[e.label] ?? 0) + 1
      }

      return { total, correct, accuracy, perLabel }
    }),

  delete: protectedProcedure
    .input(z.object({
      id: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify the example belongs to the user
      const [example] = await ctx.db
        .select()
        .from(trainingExamples)
        .where(eq(trainingExamples.id, input.id))

      if (!example) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Example not found' })
      }
      if (example.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your example' })
      }

      await ctx.db.delete(trainingExamples).where(eq(trainingExamples.id, input.id))
      return { success: true }
    }),
})

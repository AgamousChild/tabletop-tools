import { simulations } from '@tabletop-tools/db'
import { TRPCError } from '@trpc/server'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'

import { simulateWeapon } from '../lib/rules/pipeline'
import type { SimResult } from '../lib/rules/pipeline'
import { protectedProcedure, router } from '../trpc'

const simResultSchema = z.object({
  expectedWounds: z.number(),
  expectedModelsRemoved: z.number(),
  survivors: z.number(),
  worstCase: z.object({ wounds: z.number(), modelsRemoved: z.number() }),
  bestCase: z.object({ wounds: z.number(), modelsRemoved: z.number() }),
})

export const simulateRouter = router({
  run: protectedProcedure
    .input(
      z.object({
        attackerId: z.string(),
        defenderId: z.string(),
        defenderModelCount: z.number().int().min(1).default(1),
        defenderInvulnSave: z.number().int().min(2).max(6).optional(),
        defenderFnp: z.number().int().min(2).max(6).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const [attacker, defender] = await Promise.all([
        ctx.gameContent.getUnit(input.attackerId),
        ctx.gameContent.getUnit(input.defenderId),
      ])

      if (!attacker) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Attacker unit not found' })
      }
      if (!defender) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Defender unit not found' })
      }

      if (attacker.weapons.length === 0) {
        return {
          expectedWounds: 0,
          expectedModelsRemoved: 0,
          survivors: input.defenderModelCount,
          worstCase: { wounds: 0, modelsRemoved: 0 },
          bestCase: { wounds: 0, modelsRemoved: 0 },
        } satisfies SimResult
      }

      // Simulate each attacker weapon and sum the results
      let totalExpectedWounds = 0
      let totalExpectedModelsRemoved = 0
      let worstCaseWounds = 0
      let bestCaseWounds = 0

      for (const weapon of attacker.weapons) {
        const r = simulateWeapon(
          weapon,
          defender.toughness,
          defender.save,
          defender.wounds,
          input.defenderModelCount,
          input.defenderInvulnSave,
          input.defenderFnp,
        )
        totalExpectedWounds += r.expectedWounds
        totalExpectedModelsRemoved += r.expectedModelsRemoved
        bestCaseWounds += r.bestCase.wounds
      }

      totalExpectedModelsRemoved = Math.min(
        input.defenderModelCount,
        totalExpectedModelsRemoved,
      )
      const survivors = Math.max(0, input.defenderModelCount - totalExpectedModelsRemoved)

      return {
        expectedWounds: parseFloat(totalExpectedWounds.toFixed(4)),
        expectedModelsRemoved: parseFloat(totalExpectedModelsRemoved.toFixed(4)),
        survivors: parseFloat(survivors.toFixed(4)),
        worstCase: { wounds: worstCaseWounds, modelsRemoved: 0 },
        bestCase: {
          wounds: bestCaseWounds,
          modelsRemoved: Math.floor(bestCaseWounds / defender.wounds),
        },
      } satisfies SimResult
    }),

  save: protectedProcedure
    .input(
      z.object({
        attackerId: z.string(),
        attackerName: z.string(),
        defenderId: z.string(),
        defenderName: z.string(),
        result: simResultSchema,
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
})

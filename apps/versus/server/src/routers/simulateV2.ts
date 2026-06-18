/**
 * simulateV2 router — normalized simulation storage.
 * Replaces the old JSON-blob `simulations` table with three properly structured tables.
 *
 * save: writes simulation + simulation_weapon + simulation_modifier in a batch.
 *   Attack-count factors are RECOMPUTED server-side from the provided notation so
 *   the client cannot pass incorrect totalAttacks values.
 * history: returns simulations for the current user with their weapon rows.
 * get: returns a single simulation with weapons + modifiers.
 * delete: removes simulation (cascade deletes weapon + modifier rows).
 */
import { simulation, simulationModifier, simulationWeapon } from '@tabletop-tools/db'
import { protectedProcedure, router } from '@tabletop-tools/server-core'
import { TRPCError } from '@trpc/server'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'

import { assertAttackCountInvariant, computeTotalAttacks } from '../lib/attackCount'

// ---- Zod schemas ----

const profileKindSchema = z.enum(['ranged', 'melee'])
const sideSchema = z.enum(['ATTACK', 'DEFENSE'])

const weaponInputSchema = z.object({
  profileKind: profileKindSchema,
  profileId: z.string().nullish(),
  weaponName: z.string(),
  modelCount: z.number().int().positive(),
  weaponsPerModel: z.number().int().positive(),
  /** Dice notation string: "2", "D6", "2D3+1", etc. */
  attacksNotation: z.string(),
  expectedWounds: z.number(),
  expectedModelsRemoved: z.number(),
})

const modifierInputSchema = z.object({
  side: sideSchema,
  source: z.string(),
  key: z.string(),
  value: z.string().nullish(),
})

const saveInputSchema = z.object({
  label: z.string().optional(),
  attackerUnitId: z.string().optional(),
  defenderUnitId: z.string().optional(),
  attackerName: z.string(),
  defenderName: z.string(),
  dataslateId: z.string().optional(),
  // Headline results
  expectedWounds: z.number(),
  expectedModelsRemoved: z.number(),
  survivors: z.number(),
  worstWounds: z.number(),
  worstModels: z.number(),
  bestWounds: z.number(),
  bestModels: z.number(),
  // Per-weapon breakdown
  weapons: z.array(weaponInputSchema).min(1),
  // Active modifiers
  modifiers: z.array(modifierInputSchema).default([]),
})

// ---- Router ----

export const simulateV2Router = router({
  save: protectedProcedure.input(saveInputSchema).mutation(async ({ ctx, input }) => {
    const simId = crypto.randomUUID()
    const now = Date.now()

    // Recompute attack-count factors server-side and assert the invariant
    // before writing anything to the database.
    const weaponRows = input.weapons.map((w) => {
      const factors = computeTotalAttacks(w.modelCount, w.weaponsPerModel, w.attacksNotation)
      assertAttackCountInvariant(factors)
      return {
        id: crypto.randomUUID(),
        simulationId: simId,
        profileKind: w.profileKind,
        profileId: w.profileId ?? null,
        weaponName: w.weaponName,
        modelCount: factors.modelCount,
        weaponsPerModel: factors.weaponsPerModel,
        attacksPerWeapon: factors.attacksPerWeapon,
        totalAttacks: factors.totalAttacks,
        expectedWounds: w.expectedWounds,
        expectedModelsRemoved: w.expectedModelsRemoved,
      }
    })

    const modifierRows = input.modifiers.map((m) => ({
      id: crypto.randomUUID(),
      simulationId: simId,
      side: m.side,
      source: m.source,
      key: m.key,
      value: m.value ?? null,
    }))

    // Write all three tables atomically via db.batch
    await ctx.db.batch([
      ctx.db.insert(simulation).values({
        id: simId,
        userId: ctx.user.id,
        label: input.label ?? null,
        attackerUnitId: input.attackerUnitId ?? null,
        defenderUnitId: input.defenderUnitId ?? null,
        attackerName: input.attackerName,
        defenderName: input.defenderName,
        dataslateId: input.dataslateId ?? null,
        expectedWounds: input.expectedWounds,
        expectedModelsRemoved: input.expectedModelsRemoved,
        survivors: input.survivors,
        worstWounds: input.worstWounds,
        worstModels: input.worstModels,
        bestWounds: input.bestWounds,
        bestModels: input.bestModels,
        createdAt: now,
      }),
      ...weaponRows.map((row) => ctx.db.insert(simulationWeapon).values(row)),
      ...modifierRows.map((row) => ctx.db.insert(simulationModifier).values(row)),
    ])

    return { id: simId }
  }),

  history: protectedProcedure.query(async ({ ctx }) => {
    const sims = await ctx.db
      .select()
      .from(simulation)
      .where(eq(simulation.userId, ctx.user.id))
      .orderBy(desc(simulation.createdAt))

    // Fetch weapon rows for each simulation
    const withWeapons = await Promise.all(
      sims.map(async (sim) => {
        const weapons = await ctx.db
          .select()
          .from(simulationWeapon)
          .where(eq(simulationWeapon.simulationId, sim.id))
        return { ...sim, weapons }
      }),
    )

    return withWeapons
  }),

  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const sim = await ctx.db
      .select()
      .from(simulation)
      .where(and(eq(simulation.id, input.id), eq(simulation.userId, ctx.user.id)))
      .get()

    if (!sim) throw new TRPCError({ code: 'NOT_FOUND', message: 'Simulation not found' })

    const [weapons, modifiers] = await Promise.all([
      ctx.db.select().from(simulationWeapon).where(eq(simulationWeapon.simulationId, sim.id)),
      ctx.db.select().from(simulationModifier).where(eq(simulationModifier.simulationId, sim.id)),
    ])

    return { ...sim, weapons, modifiers }
  }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const sim = await ctx.db
        .select()
        .from(simulation)
        .where(and(eq(simulation.id, input.id), eq(simulation.userId, ctx.user.id)))
        .get()

      if (!sim) throw new TRPCError({ code: 'NOT_FOUND', message: 'Simulation not found' })

      await ctx.db.delete(simulation).where(eq(simulation.id, input.id))
      return { success: true }
    }),
})

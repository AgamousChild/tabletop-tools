import { TRPCError } from '@trpc/server'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { lists, listUnits, unitRatings } from '@tabletop-tools/db'

import { protectedProcedure, router } from '../trpc'

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export const listRouter = router({
  create: protectedProcedure
    .input(z.object({ faction: z.string(), name: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const now = Date.now()
      const id = generateId()
      await ctx.db.insert(lists).values({
        id,
        userId: ctx.user.id,
        faction: input.faction,
        name: input.name,
        totalPts: 0,
        createdAt: now,
        updatedAt: now,
      })
      const [list] = await ctx.db
        .select()
        .from(lists)
        .where(eq(lists.id, id))
      return list!
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(lists)
      .where(eq(lists.userId, ctx.user.id))
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const [list] = await ctx.db
        .select()
        .from(lists)
        .where(and(eq(lists.id, input.id), eq(lists.userId, ctx.user.id)))
      if (!list) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'List not found' })
      }
      const units = await ctx.db
        .select()
        .from(listUnits)
        .where(eq(listUnits.listId, input.id))

      // Fetch ratings for all units in the list
      const ratingMap = new Map<string, typeof unitRatings.$inferSelect>()
      for (const unit of units) {
        const [rating] = await ctx.db
          .select()
          .from(unitRatings)
          .where(eq(unitRatings.unitContentId, unit.unitContentId))
          .orderBy(unitRatings.computedAt)
          .limit(1)
        if (rating) {
          ratingMap.set(unit.unitContentId, rating)
        }
      }

      return {
        ...list,
        units: units.map((u) => ({
          ...u,
          rating: ratingMap.get(u.unitContentId) ?? null,
        })),
      }
    }),

  addUnit: protectedProcedure
    .input(
      z.object({
        listId: z.string(),
        unitId: z.string(),
        count: z.number().int().positive().default(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify list belongs to user
      const [list] = await ctx.db
        .select()
        .from(lists)
        .where(and(eq(lists.id, input.listId), eq(lists.userId, ctx.user.id)))
      if (!list) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'List not found' })
      }

      // Load unit from content adapter (denormalize name + points)
      const unit = await ctx.gameContent.getUnit(input.unitId)
      if (!unit) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Unit not found' })
      }

      const id = generateId()
      await ctx.db.insert(listUnits).values({
        id,
        listId: input.listId,
        unitContentId: input.unitId,
        unitName: unit.name,
        unitPoints: unit.points,
        count: input.count,
      })

      // Update total_pts
      const addedPts = unit.points * input.count
      await ctx.db
        .update(lists)
        .set({
          totalPts: list.totalPts + addedPts,
          updatedAt: Date.now(),
        })
        .where(eq(lists.id, input.listId))
    }),

  removeUnit: protectedProcedure
    .input(z.object({ listId: z.string(), listUnitId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Verify list belongs to user
      const [list] = await ctx.db
        .select()
        .from(lists)
        .where(and(eq(lists.id, input.listId), eq(lists.userId, ctx.user.id)))
      if (!list) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'List not found' })
      }

      // Get the unit row so we can subtract its points
      const [unitRow] = await ctx.db
        .select()
        .from(listUnits)
        .where(and(eq(listUnits.id, input.listUnitId), eq(listUnits.listId, input.listId)))
      if (!unitRow) return  // already removed, idempotent

      await ctx.db.delete(listUnits).where(eq(listUnits.id, input.listUnitId))

      const removedPts = unitRow.unitPoints * unitRow.count
      await ctx.db
        .update(lists)
        .set({
          totalPts: Math.max(0, list.totalPts - removedPts),
          updatedAt: Date.now(),
        })
        .where(eq(lists.id, input.listId))
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Delete units first (FK), then the list
      await ctx.db.delete(listUnits).where(eq(listUnits.listId, input.id))
      await ctx.db
        .delete(lists)
        .where(and(eq(lists.id, input.id), eq(lists.userId, ctx.user.id)))
    }),
})

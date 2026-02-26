import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { lists, listUnits } from '@tabletop-tools/db'
import { protectedProcedure, router, generateId } from '@tabletop-tools/server-core'

const unitSchema = z.object({
  id: z.string(),
  unitContentId: z.string(),
  unitName: z.string(),
  unitPoints: z.number(),
  modelCount: z.number().optional(),
  count: z.number(),
})

const listSyncSchema = z.object({
  id: z.string(),
  faction: z.string(),
  name: z.string(),
  description: z.string().optional(),
  detachment: z.string().optional(),
  battleSize: z.number().optional(),
  totalPts: z.number(),
  units: z.array(unitSchema),
})

export const listRouter = router({
  sync: protectedProcedure
    .input(listSyncSchema)
    .mutation(async ({ ctx, input }) => {
      const now = Date.now()

      // Upsert the list
      await ctx.db
        .insert(lists)
        .values({
          id: input.id,
          userId: ctx.user.id,
          faction: input.faction,
          name: input.name,
          description: input.description ?? null,
          detachment: input.detachment ?? null,
          battleSize: input.battleSize ?? null,
          totalPts: input.totalPts,
          syncedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: lists.id,
          set: {
            faction: input.faction,
            name: input.name,
            description: input.description ?? null,
            detachment: input.detachment ?? null,
            battleSize: input.battleSize ?? null,
            totalPts: input.totalPts,
            syncedAt: now,
            updatedAt: now,
          },
        })

      // Delete existing units for this list, then insert fresh
      await ctx.db.delete(listUnits).where(eq(listUnits.listId, input.id))

      if (input.units.length > 0) {
        await ctx.db.insert(listUnits).values(
          input.units.map((u) => ({
            id: u.id || generateId(),
            listId: input.id,
            unitContentId: u.unitContentId,
            unitName: u.unitName,
            unitPoints: u.unitPoints,
            modelCount: u.modelCount ?? null,
            count: u.count,
          })),
        )
      }

      return { success: true }
    }),

  syncAll: protectedProcedure
    .input(z.object({ lists: z.array(listSyncSchema) }))
    .mutation(async ({ ctx, input }) => {
      const now = Date.now()

      for (const list of input.lists) {
        await ctx.db
          .insert(lists)
          .values({
            id: list.id,
            userId: ctx.user.id,
            faction: list.faction,
            name: list.name,
            description: list.description ?? null,
            detachment: list.detachment ?? null,
            battleSize: list.battleSize ?? null,
            totalPts: list.totalPts,
            syncedAt: now,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: lists.id,
            set: {
              faction: list.faction,
              name: list.name,
              description: list.description ?? null,
              detachment: list.detachment ?? null,
              battleSize: list.battleSize ?? null,
              totalPts: list.totalPts,
              syncedAt: now,
              updatedAt: now,
            },
          })

        await ctx.db.delete(listUnits).where(eq(listUnits.listId, list.id))

        if (list.units.length > 0) {
          await ctx.db.insert(listUnits).values(
            list.units.map((u) => ({
              id: u.id || generateId(),
              listId: list.id,
              unitContentId: u.unitContentId,
              unitName: u.unitName,
              unitPoints: u.unitPoints,
              modelCount: u.modelCount ?? null,
              count: u.count,
            })),
          )
        }
      }

      return { success: true }
    }),

  getAll: protectedProcedure
    .query(async ({ ctx }) => {
      const userLists = await ctx.db
        .select()
        .from(lists)
        .where(eq(lists.userId, ctx.user.id))

      const result = []
      for (const list of userLists) {
        const units = await ctx.db
          .select()
          .from(listUnits)
          .where(eq(listUnits.listId, list.id))

        result.push({
          ...list,
          units: units.map((u) => ({
            id: u.id,
            unitContentId: u.unitContentId,
            unitName: u.unitName,
            unitPoints: u.unitPoints,
            modelCount: u.modelCount,
            count: u.count,
          })),
        })
      }

      return result
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Only delete if owned by the authenticated user
      await ctx.db
        .delete(lists)
        .where(and(eq(lists.id, input.id), eq(lists.userId, ctx.user.id)))

      return { success: true }
    }),
})

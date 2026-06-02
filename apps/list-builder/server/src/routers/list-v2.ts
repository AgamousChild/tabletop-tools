import {
  contentCanLead,
  contentEntity,
  list,
  listUnit,
  listUnitLoadout,
  listUnitLoadoutWeapon,
} from '@tabletop-tools/db'
import { generateId, protectedProcedure, router } from '@tabletop-tools/server-core'
import { TRPCError } from '@trpc/server'
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'

const battleSizeEnum = z.enum([
  'Combat Patrol',
  'Incursion',
  'Strike Force',
  'Onslaught',
  'unknown',
])

const loadoutWeaponSchema = z.object({
  weaponId: z.string().optional(),
  count: z.number().int().min(1).default(1),
})

const loadoutSchema = z.object({
  modelCount: z.number().int().min(1),
  weapons: z.array(loadoutWeaponSchema).default([]),
})

export const listV2Router = router({
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        edition: z.enum(['10th', '11th']).default('11th'),
        battleSize: battleSizeEnum.default('unknown'),
        author: z.string().optional(),
        factionId: z.string().optional(),
        subfactionId: z.string().optional(),
        detachmentId: z.string().optional(),
        dataslateId: z.string().optional(),
        source: z.string().default('list-builder'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const id = generateId()
      const now = Date.now()
      await ctx.db.insert(list).values({
        id,
        userId: ctx.user.id,
        name: input.name,
        description: input.description ?? null,
        edition: input.edition,
        battleSize: input.battleSize,
        totalPoints: 0,
        source: input.source,
        author: input.author ?? null,
        factionId: input.factionId ?? null,
        subfactionId: input.subfactionId ?? null,
        detachmentId: input.detachmentId ?? null,
        dataslateId: input.dataslateId ?? null,
        createdAt: now,
        updatedAt: now,
      })
      return { id }
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        edition: z.enum(['10th', '11th']).optional(),
        battleSize: battleSizeEnum.optional(),
        author: z.string().optional(),
        factionId: z.string().nullable().optional(),
        subfactionId: z.string().nullable().optional(),
        detachmentId: z.string().nullable().optional(),
        dataslateId: z.string().nullable().optional(),
        totalPoints: z.number().int().min(0).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db
        .select()
        .from(list)
        .where(and(eq(list.id, input.id), eq(list.userId, ctx.user.id)))
      if (!existing.length) throw new TRPCError({ code: 'NOT_FOUND' })
      const { id, ...fields } = input
      await ctx.db
        .update(list)
        .set({ ...fields, updatedAt: Date.now() })
        .where(eq(list.id, id))
      return { success: true }
    }),

  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const rows = await ctx.db
      .select()
      .from(list)
      .where(and(eq(list.id, input.id), eq(list.userId, ctx.user.id)))
    if (!rows.length) throw new TRPCError({ code: 'NOT_FOUND' })

    const units = await ctx.db.select().from(listUnit).where(eq(listUnit.listId, input.id))
    const unitIds = units.map((u) => u.id)

    const loadouts = unitIds.length
      ? await ctx.db
          .select()
          .from(listUnitLoadout)
          .where(inArray(listUnitLoadout.listUnitId, unitIds))
      : []

    const loadoutIds = loadouts.map((l) => l.id)
    const weapons = loadoutIds.length
      ? await ctx.db
          .select()
          .from(listUnitLoadoutWeapon)
          .where(inArray(listUnitLoadoutWeapon.loadoutId, loadoutIds))
      : []

    return {
      ...rows[0]!,
      units: units.map((u) => ({
        ...u,
        loadouts: loadouts
          .filter((lo) => lo.listUnitId === u.id)
          .map((lo) => ({
            ...lo,
            weapons: weapons.filter((w) => w.loadoutId === lo.id),
          })),
      })),
    }
  }),

  getAll: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(list).where(eq(list.userId, ctx.user.id))
  }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(list).where(and(eq(list.id, input.id), eq(list.userId, ctx.user.id)))
      return { success: true }
    }),

  addUnit: protectedProcedure
    .input(
      z.object({
        listId: z.string(),
        datasheetId: z.string().optional(),
        enhancementId: z.string().optional(),
        isWarlord: z.boolean().default(false),
        points: z.number().int().min(0).default(0),
        attachedToUnitId: z.string().optional(),
        attachRole: z.enum(['leader', 'support']).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify list ownership
      const parentList = await ctx.db
        .select()
        .from(list)
        .where(and(eq(list.id, input.listId), eq(list.userId, ctx.user.id)))
      if (!parentList.length) throw new TRPCError({ code: 'FORBIDDEN' })

      const id = generateId()
      await ctx.db.insert(listUnit).values({
        id,
        listId: input.listId,
        datasheetId: input.datasheetId ?? null,
        enhancementId: input.enhancementId ?? null,
        isWarlord: input.isWarlord,
        points: input.points,
        attachedToUnitId: input.attachedToUnitId ?? null,
        attachRole: input.attachRole ?? null,
      })
      return { id }
    }),

  updateUnit: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        datasheetId: z.string().nullable().optional(),
        enhancementId: z.string().nullable().optional(),
        isWarlord: z.boolean().optional(),
        points: z.number().int().min(0).optional(),
        attachedToUnitId: z.string().nullable().optional(),
        attachRole: z.enum(['leader', 'support']).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify ownership via list
      const unit = await ctx.db.select().from(listUnit).where(eq(listUnit.id, input.id))
      if (!unit.length) throw new TRPCError({ code: 'NOT_FOUND' })
      const parentList = await ctx.db
        .select()
        .from(list)
        .where(and(eq(list.id, unit[0]!.listId), eq(list.userId, ctx.user.id)))
      if (!parentList.length) throw new TRPCError({ code: 'FORBIDDEN' })

      // can_deploy_solo enforcement: a unit marked can_deploy_solo=false must remain
      // attached. Fires only when the caller is explicitly clearing the attachment
      // (not on addUnit which starts unattached with no can_deploy_solo check).
      if (input.attachedToUnitId === null && unit[0]!.datasheetId) {
        const dsRow = await ctx.db
          .select({ canDeploySolo: contentEntity.canDeploySolo })
          .from(contentEntity)
          .where(eq(contentEntity.id, unit[0]!.datasheetId))
          .limit(1)
        if (dsRow.length > 0 && dsRow[0]!.canDeploySolo === false) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `${unit[0]!.datasheetId} cannot deploy solo (can_deploy_solo=false)`,
          })
        }
      }

      // Attachment constraints:
      // 1. ≤1 leader and ≤1 support per bodyguard (slot constraint)
      // 2. can_lead content ref — the attaching unit's datasheet must have a
      //    content_can_lead row for (leader_ds, bodyguard_ds, role). Role must
      //    match — a support-only character cannot attach as leader and vice-versa.
      if (input.attachedToUnitId && input.attachRole) {
        const siblings = await ctx.db
          .select()
          .from(listUnit)
          .where(eq(listUnit.attachedToUnitId, input.attachedToUnitId))
        const slotTaken = siblings.some(
          (s) => s.id !== input.id && s.attachRole === input.attachRole,
        )
        if (slotTaken) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `${input.attachRole} slot already filled for this unit`,
          })
        }

        // Look up the leader and bodyguard datasheet ids
        const leaderDsId = input.datasheetId ?? unit[0]!.datasheetId
        const bodyguardUnit = (
          await ctx.db
            .select()
            .from(listUnit)
            .where(eq(listUnit.id, input.attachedToUnitId))
            .limit(1)
        )[0]
        if (!bodyguardUnit) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'bodyguard unit not found' })
        }
        const bodyguardDsId = bodyguardUnit.datasheetId
        // Both endpoints must have datasheet ids to check the content ref. If
        // either is null (a stub unit pre-datasheet), skip the can_lead check
        // — the slot constraint still applies.
        if (leaderDsId && bodyguardDsId) {
          const can = await ctx.db
            .select()
            .from(contentCanLead)
            .where(
              and(
                eq(contentCanLead.leaderDatasheetId, leaderDsId),
                eq(contentCanLead.bodyguardDatasheetId, bodyguardDsId),
                eq(contentCanLead.role, input.attachRole),
              ),
            )
            .limit(1)
          if (can.length === 0) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `datasheet ${leaderDsId} cannot ${input.attachRole} ${bodyguardDsId} (no can_lead entry for role=${input.attachRole})`,
            })
          }
        }
      }

      const { id, isWarlord, ...rest } = input
      await ctx.db
        .update(listUnit)
        .set({
          ...rest,
          ...(isWarlord !== undefined ? { isWarlord } : {}),
        })
        .where(eq(listUnit.id, id))
      return { success: true }
    }),

  removeUnit: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const unit = await ctx.db.select().from(listUnit).where(eq(listUnit.id, input.id))
      if (!unit.length) return { success: true }
      const parentList = await ctx.db
        .select()
        .from(list)
        .where(and(eq(list.id, unit[0]!.listId), eq(list.userId, ctx.user.id)))
      if (!parentList.length) throw new TRPCError({ code: 'FORBIDDEN' })
      await ctx.db.delete(listUnit).where(eq(listUnit.id, input.id))
      return { success: true }
    }),

  setLoadout: protectedProcedure
    .input(
      z.object({
        unitId: z.string(),
        loadouts: z.array(loadoutSchema),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const unit = await ctx.db.select().from(listUnit).where(eq(listUnit.id, input.unitId))
      if (!unit.length) throw new TRPCError({ code: 'NOT_FOUND' })
      const parentList = await ctx.db
        .select()
        .from(list)
        .where(and(eq(list.id, unit[0]!.listId), eq(list.userId, ctx.user.id)))
      if (!parentList.length) throw new TRPCError({ code: 'FORBIDDEN' })

      // Replace all loadouts for this unit (cascade deletes weapons)
      await ctx.db.delete(listUnitLoadout).where(eq(listUnitLoadout.listUnitId, input.unitId))

      for (const loadout of input.loadouts) {
        const loadoutId = generateId()
        await ctx.db.insert(listUnitLoadout).values({
          id: loadoutId,
          listUnitId: input.unitId,
          modelCount: loadout.modelCount,
        })
        for (const weapon of loadout.weapons) {
          await ctx.db.insert(listUnitLoadoutWeapon).values({
            id: generateId(),
            loadoutId,
            weaponId: weapon.weaponId ?? null,
            count: weapon.count,
          })
        }
      }
      return { success: true }
    }),

  computePoints: protectedProcedure
    .input(z.object({ listId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      const parentList = await ctx.db
        .select()
        .from(list)
        .where(and(eq(list.id, input.listId), eq(list.userId, ctx.user.id)))
      if (!parentList.length) throw new TRPCError({ code: 'NOT_FOUND' })

      // NOTE: full cost derivation against the content_entity cost layer is a Phase 1.4 concern.
      // This procedure sums the already-stored .points snapshots on each unit.
      const units = await ctx.db.select().from(listUnit).where(eq(listUnit.listId, input.listId))
      const totalPoints = units.reduce((sum, u) => sum + u.points, 0)
      await ctx.db
        .update(list)
        .set({ totalPoints, updatedAt: Date.now() })
        .where(eq(list.id, input.listId))
      return { totalPoints }
    }),

  /**
   * Returns list units eligible as bodyguards for a given character datasheet + role.
   * Queries content_can_lead filtered by role — data-driven, no hardcoded character lists.
   * Returns only units actually present in the list whose datasheet appears in content_can_lead.
   */
  eligibleBodyguards: protectedProcedure
    .input(
      z.object({
        listId: z.string(),
        datasheetId: z.string(),
        role: z.enum(['leader', 'support']),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Verify list ownership
      const parentList = await ctx.db
        .select()
        .from(list)
        .where(and(eq(list.id, input.listId), eq(list.userId, ctx.user.id)))
      if (!parentList.length) throw new TRPCError({ code: 'NOT_FOUND' })

      // Get all bodyguard datasheet IDs this character can attach to (for this role)
      const allowedBodyguardRows = await ctx.db
        .select({ bodyguardDatasheetId: contentCanLead.bodyguardDatasheetId })
        .from(contentCanLead)
        .where(
          and(
            eq(contentCanLead.leaderDatasheetId, input.datasheetId),
            eq(contentCanLead.role, input.role),
          ),
        )
      const allowedDsIds = new Set(allowedBodyguardRows.map((r) => r.bodyguardDatasheetId))
      if (allowedDsIds.size === 0) return []

      // Return list units whose datasheet is in the allowed set
      const units = await ctx.db.select().from(listUnit).where(eq(listUnit.listId, input.listId))

      return units.filter((u) => u.datasheetId !== null && allowedDsIds.has(u.datasheetId))
    }),

  /**
   * Returns whether the given datasheet can deploy solo (not attached).
   * Defaults to true (solo allowed) when the datasheet has no content_entity row.
   * Used by AttachmentPicker to conditionally show the "Deploy solo" option.
   */
  canDeploySolo: protectedProcedure
    .input(z.object({ datasheetId: z.string() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({ canDeploySolo: contentEntity.canDeploySolo })
        .from(contentEntity)
        .where(eq(contentEntity.id, input.datasheetId))
        .limit(1)
      // If no content_entity row exists for this datasheet, default to true
      // (unknown units are not flagged as must-attach).
      return { canDeploySolo: rows[0]?.canDeploySolo ?? true }
    }),
})

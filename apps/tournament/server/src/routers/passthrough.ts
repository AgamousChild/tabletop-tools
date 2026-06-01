import { passthroughEvent } from '@tabletop-tools/db'
import { TRPCError } from '@trpc/server'
import { desc, eq, like } from 'drizzle-orm'
import { z } from 'zod'

import { protectedProcedure, publicProcedure, router } from '../trpc'

export const passthroughRouter = router({
  /**
   * List upcoming/recent passthrough events (publicly visible directory).
   * Ordered by event_date descending (most recent first).
   */
  list: publicProcedure
    .input(
      z.object({
        search: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(25),
      }),
    )
    .query(async ({ ctx, input }) => {
      const query = ctx.db
        .select()
        .from(passthroughEvent)
        .orderBy(desc(passthroughEvent.eventDate))
        .limit(input.limit)

      if (input.search) {
        return query.where(like(passthroughEvent.name, `%${input.search}%`)).all()
      }
      return query.all()
    }),

  /** Get a single passthrough event by internal id. */
  get: publicProcedure.input(z.string()).query(async ({ ctx, input }) => {
    const event = await ctx.db
      .select()
      .from(passthroughEvent)
      .where(eq(passthroughEvent.id, input))
      .get()
    if (!event) throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' })
    return event
  }),

  /**
   * Upsert a passthrough event by bcp_event_id.
   * Used by the sync job to keep the directory current.
   * Requires auth (protected — only admin/TO workflows call this).
   */
  upsert: protectedProcedure
    .input(
      z.object({
        bcpEventId: z.string(),
        name: z.string().min(1),
        eventDate: z.number().int().optional(),
        location: z.string().optional(),
        gameSystem: z.string().optional(),
        playerCount: z.number().int().optional(),
        registrationUrl: z.string().url().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const id = crypto.randomUUID()
      const now = Date.now()

      await ctx.db
        .insert(passthroughEvent)
        .values({
          id,
          bcpEventId: input.bcpEventId,
          name: input.name,
          eventDate: input.eventDate ?? null,
          location: input.location ?? null,
          gameSystem: input.gameSystem ?? null,
          playerCount: input.playerCount ?? null,
          registrationUrl: input.registrationUrl ?? null,
          lastSyncedAt: now,
        })
        .onConflictDoUpdate({
          target: passthroughEvent.bcpEventId,
          set: {
            name: input.name,
            eventDate: input.eventDate ?? null,
            location: input.location ?? null,
            gameSystem: input.gameSystem ?? null,
            playerCount: input.playerCount ?? null,
            registrationUrl: input.registrationUrl ?? null,
            lastSyncedAt: now,
          },
        })

      return ctx.db
        .select()
        .from(passthroughEvent)
        .where(eq(passthroughEvent.bcpEventId, input.bcpEventId))
        .get()
    }),
})

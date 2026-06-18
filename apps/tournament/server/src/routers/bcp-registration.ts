import { bcpRegistration } from '@tabletop-tools/db'
import { TRPCError } from '@trpc/server'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'

import { protectedProcedure, router } from '../trpc'

export const bcpRegistrationRouter = router({
  /**
   * Record a BCP registration with explicit consent.
   * consentAt MUST be provided by the caller with the timestamp of the user's
   * explicit acknowledgement in the UI — it is not generated server-side.
   * This ensures the consent record is tied to the actual UI event.
   */
  record: protectedProcedure
    .input(
      z.object({
        bcpEventId: z.string().min(1),
        listId: z.string().optional(),
        method: z.enum(['server', 'agent']),
        status: z.enum(['submitted', 'failed']),
        /** Timestamp (ms) from the client when the user clicked "I agree" */
        consentAt: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Validate that consent was given before or at submission time
      const now = Date.now()
      if (input.consentAt > now + 5000) {
        // allow 5s clock skew
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'consentAt cannot be in the future',
        })
      }

      const id = crypto.randomUUID()
      await ctx.db.insert(bcpRegistration).values({
        id,
        userId: ctx.user.id,
        bcpEventId: input.bcpEventId,
        listId: input.listId ?? null,
        method: input.method,
        status: input.status,
        consentAt: input.consentAt,
        submittedAt: now,
      })

      return ctx.db.select().from(bcpRegistration).where(eq(bcpRegistration.id, id)).get()
    }),

  /**
   * Update the status of an existing registration (e.g. submitted → failed).
   * Caller must own the registration.
   */
  updateStatus: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.enum(['submitted', 'failed']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const reg = await ctx.db
        .select()
        .from(bcpRegistration)
        .where(eq(bcpRegistration.id, input.id))
        .get()
      if (!reg) throw new TRPCError({ code: 'NOT_FOUND', message: 'Registration not found' })
      if (reg.userId !== ctx.user.id)
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' })

      await ctx.db
        .update(bcpRegistration)
        .set({ status: input.status })
        .where(eq(bcpRegistration.id, input.id))

      return ctx.db.select().from(bcpRegistration).where(eq(bcpRegistration.id, input.id)).get()
    }),

  /** List the current user's BCP registrations, most recent first. */
  listMine: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(bcpRegistration)
      .where(eq(bcpRegistration.userId, ctx.user.id))
      .orderBy(desc(bcpRegistration.submittedAt))
      .all()
  }),

  /** Get registrations for a specific BCP event + current user. */
  getForEvent: protectedProcedure
    .input(z.object({ bcpEventId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(bcpRegistration)
        .where(
          and(
            eq(bcpRegistration.userId, ctx.user.id),
            eq(bcpRegistration.bcpEventId, input.bcpEventId),
          ),
        )
        .orderBy(desc(bcpRegistration.submittedAt))
        .all()
    }),
})

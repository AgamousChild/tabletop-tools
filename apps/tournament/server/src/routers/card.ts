import { TRPCError } from '@trpc/server'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'

import { tournaments, tournamentPlayers, tournamentCards } from '@tabletop-tools/db'
import { router, protectedProcedure } from '../trpc'

export const cardRouter = router({
  issue: protectedProcedure
    .input(
      z.object({
        tournamentId: z.string(),
        playerId: z.string(),
        cardType: z.enum(['YELLOW', 'RED']),
        reason: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tournament = await ctx.db
        .select()
        .from(tournaments)
        .where(eq(tournaments.id, input.tournamentId))
        .get()
      if (!tournament) throw new TRPCError({ code: 'NOT_FOUND', message: 'Tournament not found' })
      if (tournament.toUserId !== ctx.user.id)
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' })

      const player = await ctx.db
        .select()
        .from(tournamentPlayers)
        .where(
          and(
            eq(tournamentPlayers.id, input.playerId),
            eq(tournamentPlayers.tournamentId, input.tournamentId),
          ),
        )
        .get()
      if (!player) throw new TRPCError({ code: 'NOT_FOUND', message: 'Player not found' })

      const id = crypto.randomUUID()
      await ctx.db.insert(tournamentCards).values({
        id,
        tournamentId: input.tournamentId,
        playerId: input.playerId,
        issuedBy: ctx.user.id,
        cardType: input.cardType,
        reason: input.reason,
        issuedAt: Date.now(),
      })

      return ctx.db.select().from(tournamentCards).where(eq(tournamentCards.id, id)).get()
    }),

  listForTournament: protectedProcedure
    .input(z.object({ tournamentId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(tournamentCards)
        .where(eq(tournamentCards.tournamentId, input.tournamentId))
        .all()
    }),

  playerHistory: protectedProcedure
    .input(z.object({ playerId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Find the user behind this tournament player registration
      const player = await ctx.db
        .select()
        .from(tournamentPlayers)
        .where(eq(tournamentPlayers.id, input.playerId))
        .get()
      if (!player) {
        return ctx.db
          .select()
          .from(tournamentCards)
          .where(eq(tournamentCards.playerId, input.playerId))
          .all()
      }
      // Find all tournament registrations for this user, then all their cards
      const allRegs = await ctx.db
        .select({ id: tournamentPlayers.id })
        .from(tournamentPlayers)
        .where(eq(tournamentPlayers.userId, player.userId))
        .all()
      const regIds = allRegs.map((r) => r.id)
      if (regIds.length === 0) return []
      const allCards = await ctx.db
        .select()
        .from(tournamentCards)
        .all()
      return allCards.filter((c) => regIds.includes(c.playerId))
    }),
})

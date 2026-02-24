import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { pairings, tournamentPlayers, rounds, tournaments } from '@tabletop-tools/db'
import { deriveResult } from '../lib/result/derive'
import { router, protectedProcedure } from '../trpc'

export const resultRouter = router({
  report: protectedProcedure
    .input(
      z.object({
        pairingId: z.string(),
        player1VP: z.number().int().min(0),
        player2VP: z.number().int().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const pairing = await ctx.db
        .select()
        .from(pairings)
        .where(eq(pairings.id, input.pairingId))
        .get()
      if (!pairing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Pairing not found' })
      if (pairing.result === 'BYE') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot report BYE result' })

      // Check user is one of the players in this pairing
      const player1 = await ctx.db
        .select()
        .from(tournamentPlayers)
        .where(eq(tournamentPlayers.id, pairing.player1Id))
        .get()
      const player2 = pairing.player2Id
        ? await ctx.db
            .select()
            .from(tournamentPlayers)
            .where(eq(tournamentPlayers.id, pairing.player2Id))
            .get()
        : null

      const isPlayer =
        player1?.userId === ctx.user.id || player2?.userId === ctx.user.id
      if (!isPlayer) throw new TRPCError({ code: 'FORBIDDEN', message: 'Not a player in this pairing' })

      const result = deriveResult(input.player1VP, input.player2VP)

      await ctx.db
        .update(pairings)
        .set({
          player1Vp: input.player1VP,
          player2Vp: input.player2VP,
          result,
          reportedBy: ctx.user.id,
          confirmed: 0,
        })
        .where(eq(pairings.id, input.pairingId))

      return ctx.db.select().from(pairings).where(eq(pairings.id, input.pairingId)).get()
    }),

  confirm: protectedProcedure
    .input(z.string())
    .mutation(async ({ ctx, input }) => {
      const pairing = await ctx.db
        .select()
        .from(pairings)
        .where(eq(pairings.id, input))
        .get()
      if (!pairing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Pairing not found' })
      if (!pairing.result) throw new TRPCError({ code: 'BAD_REQUEST', message: 'No result to confirm' })

      const player2 = pairing.player2Id
        ? await ctx.db
            .select()
            .from(tournamentPlayers)
            .where(eq(tournamentPlayers.id, pairing.player2Id))
            .get()
        : null

      // The confirming player must be the other player (not the reporter)
      const isOtherPlayer = player2?.userId === ctx.user.id
      if (!isOtherPlayer && pairing.reportedBy !== ctx.user.id) {
        // Also allow confirmer to be the one who didn't report
        const player1 = await ctx.db
          .select()
          .from(tournamentPlayers)
          .where(eq(tournamentPlayers.id, pairing.player1Id))
          .get()
        if (player1?.userId !== ctx.user.id && player2?.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Not a player in this pairing' })
        }
      }

      await ctx.db
        .update(pairings)
        .set({ confirmed: 1 })
        .where(eq(pairings.id, input))

      return { confirmed: true }
    }),

  dispute: protectedProcedure
    .input(z.string())
    .mutation(async ({ ctx, input }) => {
      const pairing = await ctx.db
        .select()
        .from(pairings)
        .where(eq(pairings.id, input))
        .get()
      if (!pairing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Pairing not found' })

      // Authorization: must be a participant or the TO
      const player1 = await ctx.db
        .select()
        .from(tournamentPlayers)
        .where(eq(tournamentPlayers.id, pairing.player1Id))
        .get()
      const player2 = pairing.player2Id
        ? await ctx.db
            .select()
            .from(tournamentPlayers)
            .where(eq(tournamentPlayers.id, pairing.player2Id))
            .get()
        : null
      const isParticipant =
        player1?.userId === ctx.user.id || player2?.userId === ctx.user.id

      if (!isParticipant) {
        // Check if user is the TO
        const round = await ctx.db
          .select()
          .from(rounds)
          .where(eq(rounds.id, pairing.roundId))
          .get()
        const tournament = round
          ? await ctx.db
              .select()
              .from(tournaments)
              .where(eq(tournaments.id, round.tournamentId))
              .get()
          : null
        if (!tournament || tournament.toUserId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Only participants or the TO can dispute' })
        }
      }

      // Flag for TO by clearing confirmation
      await ctx.db
        .update(pairings)
        .set({ confirmed: 0, result: null, player1Vp: null, player2Vp: null })
        .where(eq(pairings.id, input))
      return { disputed: true }
    }),

  override: protectedProcedure
    .input(
      z.object({
        pairingId: z.string(),
        player1VP: z.number().int().min(0),
        player2VP: z.number().int().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const pairing = await ctx.db
        .select()
        .from(pairings)
        .where(eq(pairings.id, input.pairingId))
        .get()
      if (!pairing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Pairing not found' })

      // Check user is the TO for this tournament
      const round = await ctx.db
        .select()
        .from(rounds)
        .where(eq(rounds.id, pairing.roundId))
        .get()
      const tournament = round
        ? await ctx.db
            .select()
            .from(tournaments)
            .where(eq(tournaments.id, round.tournamentId))
            .get()
        : null
      if (!tournament || tournament.toUserId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' })
      }

      const result = deriveResult(input.player1VP, input.player2VP)
      await ctx.db
        .update(pairings)
        .set({
          player1Vp: input.player1VP,
          player2Vp: input.player2VP,
          result,
          confirmed: 1,
          toOverride: 1,
        })
        .where(eq(pairings.id, input.pairingId))

      return ctx.db.select().from(pairings).where(eq(pairings.id, input.pairingId)).get()
    }),
})

import { eq, asc } from 'drizzle-orm'
import { z } from 'zod'

import { tournaments, tournamentPlayers, rounds, pairings } from '@tabletop-tools/db'
import { computeStandings } from '../lib/standings/compute'
import { router, protectedProcedure } from '../trpc'

const LIFECYCLE: Record<string, string> = {
  DRAFT: 'REGISTRATION',
  REGISTRATION: 'CHECK_IN',
  CHECK_IN: 'IN_PROGRESS',
  IN_PROGRESS: 'COMPLETE',
}

export const tournamentRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        eventDate: z.number().int(),
        location: z.string().optional(),
        format: z.string().min(1),
        totalRounds: z.number().int().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const id = crypto.randomUUID()
      const now = Date.now()
      await ctx.db
        .insert(tournaments)
        .values({
          id,
          toUserId: ctx.user.id,
          name: input.name,
          eventDate: input.eventDate,
          location: input.location ?? null,
          format: input.format,
          totalRounds: input.totalRounds,
          status: 'DRAFT',
          createdAt: now,
        })
      return ctx.db.select().from(tournaments).where(eq(tournaments.id, id)).get()
    }),

  get: protectedProcedure.input(z.string()).query(async ({ ctx, input }) => {
    const tournament = await ctx.db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, input))
      .get()
    if (!tournament) return null
    const players = await ctx.db
      .select()
      .from(tournamentPlayers)
      .where(eq(tournamentPlayers.tournamentId, input))
      .all()
    return { ...tournament, playerCount: players.length }
  }),

  listOpen: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(tournaments)
      .where(
        // REGISTRATION or CHECK_IN
        eq(tournaments.status, 'REGISTRATION'),
      )
      .all()
  }),

  listMine: protectedProcedure.query(async ({ ctx }) => {
    // Tournaments the user is a TO for
    const asTO = await ctx.db
      .select()
      .from(tournaments)
      .where(eq(tournaments.toUserId, ctx.user.id))
      .all()

    // Tournaments the user is registered in
    const registrations = await ctx.db
      .select({ tournamentId: tournamentPlayers.tournamentId })
      .from(tournamentPlayers)
      .where(eq(tournamentPlayers.userId, ctx.user.id))
      .all()

    const registeredIds = new Set(registrations.map((r) => r.tournamentId))
    const ids = new Set([...asTO.map((t) => t.id), ...registeredIds])

    if (ids.size === 0) return asTO

    // Fetch all tournaments the user is involved in
    const all = await ctx.db.select().from(tournaments).all()
    return all.filter((t) => ids.has(t.id))
  }),

  advanceStatus: protectedProcedure.input(z.string()).mutation(async ({ ctx, input }) => {
    const tournament = await ctx.db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, input))
      .get()
    if (!tournament) throw new Error('Tournament not found')
    if (tournament.toUserId !== ctx.user.id) throw new Error('Not authorized')
    const next = LIFECYCLE[tournament.status]
    if (!next) throw new Error('Tournament is already complete')
    await ctx.db.update(tournaments).set({ status: next }).where(eq(tournaments.id, input))
    return ctx.db.select().from(tournaments).where(eq(tournaments.id, input)).get()
  }),

  delete: protectedProcedure.input(z.string()).mutation(async ({ ctx, input }) => {
    const tournament = await ctx.db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, input))
      .get()
    if (!tournament) throw new Error('Tournament not found')
    if (tournament.toUserId !== ctx.user.id) throw new Error('Not authorized')
    if (tournament.status !== 'DRAFT') throw new Error('Can only delete DRAFT tournaments')
    await ctx.db.delete(tournaments).where(eq(tournaments.id, input))
    return { deleted: true }
  }),

  standings: protectedProcedure.input(z.string()).query(async ({ ctx, input }) => {
    const players = await ctx.db
      .select()
      .from(tournamentPlayers)
      .where(eq(tournamentPlayers.tournamentId, input))
      .all()

    // Get all confirmed results for this tournament
    const allRounds = await ctx.db
      .select()
      .from(rounds)
      .where(eq(rounds.tournamentId, input))
      .all()

    const roundIds = allRounds.map((r) => r.id)
    if (roundIds.length === 0) {
      return {
        round: 0,
        players: computeStandings(
          players.map((p) => ({ id: p.id, displayName: p.displayName, faction: p.faction, registeredAt: p.registeredAt })),
          [],
        ),
      }
    }

    // Get all pairings with confirmed results
    const allPairings = await ctx.db.select().from(pairings).all()
    const tournamentPairings = allPairings.filter((p) => roundIds.includes(p.roundId) && p.result !== null)

    const results = tournamentPairings.map((p) => ({
      player1Id: p.player1Id,
      player2Id: p.player2Id,
      player1Vp: p.player1Vp ?? 0,
      player2Vp: p.player2Vp ?? 0,
      result: p.result as 'P1_WIN' | 'P2_WIN' | 'DRAW' | 'BYE',
    }))

    const currentRound = allRounds.length
    const playerInputs = players.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      faction: p.faction,
      registeredAt: p.registeredAt,
    }))

    return {
      round: currentRound,
      players: computeStandings(playerInputs, results),
    }
  }),
})

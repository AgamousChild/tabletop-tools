import { TRPCError } from '@trpc/server'
import { eq, and, inArray } from 'drizzle-orm'
import { z } from 'zod'

import { tournaments, tournamentPlayers, rounds, pairings } from '@tabletop-tools/db'
import { computeStandings } from '../lib/standings/compute'
import { generatePairings } from '../lib/swiss/pairings'
import { router, protectedProcedure } from '../trpc'

const MISSIONS = [
  'Sweeping Engagement',
  'Priority Targets',
  'Scorched Earth',
  'Search and Destroy',
  'Take and Hold',
  'Vital Ground',
]

function randomMission(): string {
  return MISSIONS[Math.floor(Math.random() * MISSIONS.length)]
}

export const roundRouter = router({
  create: protectedProcedure
    .input(z.object({ tournamentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const tournament = await ctx.db
        .select()
        .from(tournaments)
        .where(eq(tournaments.id, input.tournamentId))
        .get()
      if (!tournament) throw new TRPCError({ code: 'NOT_FOUND', message: 'Tournament not found' })
      if (tournament.toUserId !== ctx.user.id) throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' })
      if (tournament.status !== 'IN_PROGRESS') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Tournament is not in progress' })

      const existingRounds = await ctx.db
        .select()
        .from(rounds)
        .where(eq(rounds.tournamentId, input.tournamentId))
        .all()
      const roundNumber = existingRounds.length + 1

      const id = crypto.randomUUID()
      await ctx.db.insert(rounds).values({
        id,
        tournamentId: input.tournamentId,
        roundNumber,
        status: 'PENDING',
        createdAt: Date.now(),
      })
      return ctx.db.select().from(rounds).where(eq(rounds.id, id)).get()
    }),

  generatePairings: protectedProcedure
    .input(z.object({ roundId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const round = await ctx.db
        .select()
        .from(rounds)
        .where(eq(rounds.id, input.roundId))
        .get()
      if (!round) throw new TRPCError({ code: 'NOT_FOUND', message: 'Round not found' })

      const tournament = await ctx.db
        .select()
        .from(tournaments)
        .where(eq(tournaments.id, round.tournamentId))
        .get()
      if (!tournament || tournament.toUserId !== ctx.user.id) throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' })

      // Get active (non-dropped, checked-in) players
      const allPlayers = await ctx.db
        .select()
        .from(tournamentPlayers)
        .where(
          and(
            eq(tournamentPlayers.tournamentId, round.tournamentId),
            eq(tournamentPlayers.dropped, 0),
          ),
        )
        .all()

      // Get all previous pairings in this tournament
      const allRounds = await ctx.db
        .select()
        .from(rounds)
        .where(eq(rounds.tournamentId, round.tournamentId))
        .all()
      const prevRoundIds = allRounds.filter((r) => r.id !== input.roundId).map((r) => r.id)

      const prevPairings = prevRoundIds.length > 0
        ? await ctx.db.select().from(pairings).where(inArray(pairings.roundId, prevRoundIds)).all()
        : []

      // Compute current standings to get player records
      const confirmedResults = prevPairings
        .filter((p) => p.result !== null)
        .map((p) => ({
          player1Id: p.player1Id,
          player2Id: p.player2Id,
          player1Vp: p.player1Vp ?? 0,
          player2Vp: p.player2Vp ?? 0,
          result: p.result as 'P1_WIN' | 'P2_WIN' | 'DRAW' | 'BYE',
        }))

      const playerInputs = allPlayers.map((p) => ({
        id: p.id,
        displayName: p.displayName,
        faction: p.faction,
        registeredAt: p.registeredAt,
      }))

      const standings = computeStandings(playerInputs, confirmedResults)
      const swissPlayers = standings.map((s) => ({
        id: s.id,
        displayName: s.displayName,
        wins: s.wins,
        losses: s.losses,
        draws: s.draws,
        margin: s.margin,
        strengthOfSchedule: s.strengthOfSchedule,
        registeredAt: allPlayers.find((p) => p.id === s.id)?.registeredAt ?? 0,
      }))

      const prevSwissPairings = prevPairings.map((p) => ({
        player1Id: p.player1Id,
        player2Id: p.player2Id,
      }))

      const result = generatePairings(swissPlayers, prevSwissPairings)

      // Insert pairings into DB
      const mission = randomMission()
      const insertedPairings: typeof pairings.$inferSelect[] = []

      for (const p of result.pairings) {
        const id = crypto.randomUUID()
        await ctx.db.insert(pairings).values({
          id,
          roundId: input.roundId,
          tableNumber: p.tableNumber,
          player1Id: p.player1Id,
          player2Id: p.player2Id,
          mission,
          player1Vp: null,
          player2Vp: null,
          result: null,
          reportedBy: null,
          confirmed: 0,
          toOverride: 0,
          createdAt: Date.now(),
        })
        const inserted = await ctx.db.select().from(pairings).where(eq(pairings.id, id)).get()
        if (inserted) insertedPairings.push(inserted)
      }

      // Insert bye pairing if needed
      if (result.bye) {
        const id = crypto.randomUUID()
        await ctx.db.insert(pairings).values({
          id,
          roundId: input.roundId,
          tableNumber: 0,
          player1Id: result.bye,
          player2Id: null,
          mission: 'BYE',
          player1Vp: 0,
          player2Vp: 0,
          result: 'BYE',
          reportedBy: null,
          confirmed: 1,
          toOverride: 0,
          createdAt: Date.now(),
        })
      }

      // Activate the round
      await ctx.db.update(rounds).set({ status: 'ACTIVE' }).where(eq(rounds.id, input.roundId))

      return insertedPairings
    }),

  get: protectedProcedure.input(z.string()).query(async ({ ctx, input }) => {
    const round = await ctx.db.select().from(rounds).where(eq(rounds.id, input)).get()
    if (!round) return null
    const roundPairings = await ctx.db
      .select()
      .from(pairings)
      .where(eq(pairings.roundId, input))
      .all()
    return { ...round, pairings: roundPairings }
  }),

  close: protectedProcedure
    .input(z.string())
    .mutation(async ({ ctx, input }) => {
      const round = await ctx.db.select().from(rounds).where(eq(rounds.id, input)).get()
      if (!round) throw new TRPCError({ code: 'NOT_FOUND', message: 'Round not found' })

      const tournament = await ctx.db
        .select()
        .from(tournaments)
        .where(eq(tournaments.id, round.tournamentId))
        .get()
      if (!tournament || tournament.toUserId !== ctx.user.id) throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' })

      // All non-bye pairings must be confirmed
      const roundPairings = await ctx.db
        .select()
        .from(pairings)
        .where(eq(pairings.roundId, input))
        .all()

      const unconfirmed = roundPairings.filter((p) => p.result !== 'BYE' && !p.confirmed)
      if (unconfirmed.length > 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `${unconfirmed.length} result(s) still pending confirmation` })
      }

      await ctx.db.update(rounds).set({ status: 'COMPLETE' }).where(eq(rounds.id, input))
      return { closed: true }
    }),
})

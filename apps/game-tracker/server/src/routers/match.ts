import { TRPCError } from '@trpc/server'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { matches, turns, matchSecondaries, tournaments, tournamentPlayers, pairings, rounds } from '@tabletop-tools/db'

import { protectedProcedure, router } from '../trpc'
import { deriveResult } from '../lib/scoring/result'

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export const matchRouter = router({
  start: protectedProcedure
    .input(
      z.object({
        opponentFaction: z.string(),
        mission: z.string(),
        listId: z.string().optional(),
        isTournament: z.boolean().default(false),
        opponentName: z.string().optional(),
        opponentDetachment: z.string().optional(),
        yourFaction: z.string().optional(),
        yourDetachment: z.string().optional(),
        terrainLayout: z.string().optional(),
        deploymentZone: z.string().optional(),
        twistCards: z.string().optional(),
        challengerCards: z.string().optional(),
        requirePhotos: z.boolean().default(false),
        attackerDefender: z.string().optional(),
        whoGoesFirst: z.string().optional(),
        date: z.number().int().optional(),
        location: z.string().optional(),
        tournamentName: z.string().optional(),
        tournamentId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const id = generateId()
      const now = Date.now()
      await ctx.db.insert(matches).values({
        id,
        userId: ctx.user.id,
        listId: input.listId ?? null,
        opponentFaction: input.opponentFaction,
        mission: input.mission,
        result: null,
        yourFinalScore: null,
        theirFinalScore: null,
        isTournament: input.isTournament ? 1 : 0,
        createdAt: now,
        closedAt: null,
        opponentName: input.opponentName ?? null,
        opponentDetachment: input.opponentDetachment ?? null,
        yourFaction: input.yourFaction ?? null,
        yourDetachment: input.yourDetachment ?? null,
        terrainLayout: input.terrainLayout ?? null,
        deploymentZone: input.deploymentZone ?? null,
        twistCards: input.twistCards ?? null,
        challengerCards: input.challengerCards ?? null,
        requirePhotos: input.requirePhotos ? 1 : 0,
        attackerDefender: input.attackerDefender ?? null,
        whoGoesFirst: input.whoGoesFirst ?? null,
        date: input.date ?? null,
        location: input.location ?? null,
        tournamentName: input.tournamentName ?? null,
        tournamentId: input.tournamentId ?? null,
      })
      const [match] = await ctx.db
        .select()
        .from(matches)
        .where(eq(matches.id, id))
      return match!
    }),

  startFromPairing: protectedProcedure
    .input(z.object({ pairingId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [pairing] = await ctx.db
        .select()
        .from(pairings)
        .where(eq(pairings.id, input.pairingId))
      if (!pairing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Pairing not found' })

      // Determine which player the caller is
      const players = await ctx.db
        .select()
        .from(tournamentPlayers)
        .where(
          eq(tournamentPlayers.id, pairing.player1Id),
        )
      const player1 = players[0]

      const players2 = pairing.player2Id
        ? await ctx.db.select().from(tournamentPlayers).where(eq(tournamentPlayers.id, pairing.player2Id))
        : []
      const player2 = players2[0] ?? null

      // Find which side the caller is on
      const isPlayer1 = player1?.userId === ctx.user.id
      const isPlayer2 = player2?.userId === ctx.user.id
      if (!isPlayer1 && !isPlayer2)
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You are not in this pairing' })

      const me = isPlayer1 ? player1! : player2!
      const opponent = isPlayer1 ? player2 : player1!

      // Get tournament info via round
      const roundRow = await ctx.db
        .select()
        .from(rounds)
        .where(eq(rounds.id, pairing.roundId))
        .get()
      const tournament = roundRow
        ? await ctx.db.select().from(tournaments).where(eq(tournaments.id, roundRow.tournamentId)).get()
        : null

      const id = generateId()
      const now = Date.now()
      await ctx.db.insert(matches).values({
        id,
        userId: ctx.user.id,
        listId: me.listId ?? null,
        opponentFaction: opponent?.faction ?? 'Unknown',
        mission: pairing.mission,
        result: null,
        yourFinalScore: null,
        theirFinalScore: null,
        isTournament: 1,
        createdAt: now,
        closedAt: null,
        opponentName: opponent?.displayName ?? null,
        opponentDetachment: opponent?.detachment ?? null,
        yourFaction: me.faction,
        yourDetachment: me.detachment ?? null,
        terrainLayout: null,
        deploymentZone: null,
        attackerDefender: null,
        whoGoesFirst: null,
        date: tournament?.eventDate ?? now,
        location: tournament?.location ?? null,
        tournamentName: tournament?.name ?? null,
        tournamentId: tournament?.id ?? null,
      })
      const [match] = await ctx.db.select().from(matches).where(eq(matches.id, id))
      return match!
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(matches)
      .where(eq(matches.userId, ctx.user.id))
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const [match] = await ctx.db
        .select()
        .from(matches)
        .where(and(eq(matches.id, input.id), eq(matches.userId, ctx.user.id)))
      if (!match) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Match not found' })
      }
      const matchTurns = await ctx.db
        .select()
        .from(turns)
        .where(eq(turns.matchId, input.id))
      const secondaries = await ctx.db
        .select()
        .from(matchSecondaries)
        .where(eq(matchSecondaries.matchId, input.id))
      return { ...match, turns: matchTurns, secondaries }
    }),

  close: protectedProcedure
    .input(
      z.object({
        matchId: z.string(),
        yourScore: z.number().int().min(0),
        theirScore: z.number().int().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [match] = await ctx.db
        .select()
        .from(matches)
        .where(and(eq(matches.id, input.matchId), eq(matches.userId, ctx.user.id)))
      if (!match) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Match not found' })
      }

      const result = deriveResult(input.yourScore, input.theirScore)
      await ctx.db
        .update(matches)
        .set({
          result,
          yourFinalScore: input.yourScore,
          theirFinalScore: input.theirScore,
          closedAt: Date.now(),
        })
        .where(eq(matches.id, input.matchId))

      return { result, yourScore: input.yourScore, theirScore: input.theirScore }
    }),
})

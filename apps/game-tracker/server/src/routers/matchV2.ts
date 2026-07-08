import { battleRound, matchPlayer, matchV2, roundPlayer, scoreEvent } from '@tabletop-tools/db'
import { generateId as id } from '@tabletop-tools/server-core'
import { TRPCError } from '@trpc/server'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { protectedProcedure, router } from '../trpc'

export const matchV2Router = router({
  start: protectedProcedure
    .input(
      z.object({
        opponentFaction: z.string().optional(),
        yourFaction: z.string().optional(),
        yourDetachment: z.string().optional(),
        opponentDetachment: z.string().optional(),
        listId: z.string().optional(),
        date: z.number().int().optional(),
        location: z.string().optional(),
        tournamentId: z.string().optional(),
        pairingId: z.string().optional(),
        requirePhotos: z.boolean().default(false),
        paintScoring: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const matchId = id()
      const now = Date.now()
      await ctx.db.insert(matchV2).values({
        id: matchId,
        userId: ctx.user.id,
        status: 'setup',
        requirePhotos: input.requirePhotos,
        paintScoring: input.paintScoring,
        date: input.date ?? null,
        location: input.location ?? null,
        tournamentId: input.tournamentId ?? null,
        pairingId: input.pairingId ?? null,
        createdAt: now,
      })

      const yourPlayerId = id()
      const opponentPlayerId = id()

      await ctx.db.insert(matchPlayer).values([
        {
          id: yourPlayerId,
          matchId,
          seat: 'P1',
          isYou: true,
          listId: input.listId ?? null,
          faction: input.yourFaction ?? null,
          detachment: input.yourDetachment ?? null,
        },
        {
          id: opponentPlayerId,
          matchId,
          seat: 'P2',
          isYou: false,
          faction: input.opponentFaction ?? null,
          detachment: input.opponentDetachment ?? null,
        },
      ])

      return { matchId, yourPlayerId, opponentPlayerId }
    }),

  get: protectedProcedure.input(z.object({ matchId: z.string() })).query(async ({ ctx, input }) => {
    const [match] = await ctx.db
      .select()
      .from(matchV2)
      .where(and(eq(matchV2.id, input.matchId), eq(matchV2.userId, ctx.user.id)))
    if (!match) throw new TRPCError({ code: 'NOT_FOUND', message: 'Match not found' })

    const players = await ctx.db
      .select()
      .from(matchPlayer)
      .where(eq(matchPlayer.matchId, input.matchId))

    const rounds = await ctx.db
      .select()
      .from(battleRound)
      .where(eq(battleRound.matchId, input.matchId))

    // Collect all round_player rows for these rounds
    const roundPlayerRows =
      rounds.length > 0
        ? await Promise.all(
            rounds.map((r) =>
              ctx.db.select().from(roundPlayer).where(eq(roundPlayer.roundId, r.id)),
            ),
          ).then((arrays) => arrays.flat())
        : []

    // Collect all score_event rows for these round_players
    const scoreEvents =
      roundPlayerRows.length > 0
        ? await Promise.all(
            roundPlayerRows.map((rp) =>
              ctx.db.select().from(scoreEvent).where(eq(scoreEvent.roundPlayerId, rp.id)),
            ),
          ).then((arrays) => arrays.flat())
        : []

    return { match, players, rounds, roundPlayers: roundPlayerRows, scoreEvents }
  }),

  addRound: protectedProcedure
    .input(z.object({ matchId: z.string(), roundNumber: z.number().int().min(1).max(5) }))
    .mutation(async ({ ctx, input }) => {
      const [match] = await ctx.db
        .select()
        .from(matchV2)
        .where(and(eq(matchV2.id, input.matchId), eq(matchV2.userId, ctx.user.id)))
      if (!match) throw new TRPCError({ code: 'NOT_FOUND', message: 'Match not found' })

      const roundId = id()
      await ctx.db.insert(battleRound).values({
        id: roundId,
        matchId: input.matchId,
        roundNumber: input.roundNumber,
      })

      const players = await ctx.db
        .select()
        .from(matchPlayer)
        .where(eq(matchPlayer.matchId, input.matchId))

      const p1 = players.find((p) => p.seat === 'P1')!
      const p2 = players.find((p) => p.seat === 'P2')!
      const p1RoundPlayerId = id()
      const p2RoundPlayerId = id()

      await ctx.db.insert(roundPlayer).values([
        { id: p1RoundPlayerId, roundId, matchPlayerId: p1.id },
        { id: p2RoundPlayerId, roundId, matchPlayerId: p2.id },
      ])

      return { roundId, p1RoundPlayerId, p2RoundPlayerId }
    }),

  scoreRound: protectedProcedure
    .input(
      z.object({
        roundPlayerId: z.string(),
        scoringMissionId: z.string(),
        vp: z.number().int().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [rp] = await ctx.db
        .select()
        .from(roundPlayer)
        .where(eq(roundPlayer.id, input.roundPlayerId))
      if (!rp) throw new TRPCError({ code: 'NOT_FOUND', message: 'Round player not found' })

      const eventId = id()
      await ctx.db.insert(scoreEvent).values({
        id: eventId,
        roundPlayerId: input.roundPlayerId,
        scoringMissionId: input.scoringMissionId,
        vp: input.vp,
      })

      const [event] = await ctx.db.select().from(scoreEvent).where(eq(scoreEvent.id, eventId))
      return event!
    }),

  close: protectedProcedure
    .input(
      z.object({
        matchId: z.string(),
        result: z.enum(['P1_WIN', 'P2_WIN', 'DRAW']),
        conclusion: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [match] = await ctx.db
        .select()
        .from(matchV2)
        .where(and(eq(matchV2.id, input.matchId), eq(matchV2.userId, ctx.user.id)))
      if (!match) throw new TRPCError({ code: 'NOT_FOUND', message: 'Match not found' })

      await ctx.db
        .update(matchV2)
        .set({
          status: 'complete',
          result: input.result,
          conclusion: input.conclusion ?? null,
          closedAt: Date.now(),
        })
        .where(eq(matchV2.id, input.matchId))

      const [updated] = await ctx.db.select().from(matchV2).where(eq(matchV2.id, input.matchId))
      return updated!
    }),
})

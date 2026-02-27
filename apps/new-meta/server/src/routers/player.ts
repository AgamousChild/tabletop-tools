import { z } from 'zod'
import { eq, desc, gte, like } from 'drizzle-orm'
import { router, publicProcedure } from '../trpc.js'
import { playerGlicko, glickoHistory, importedTournamentResults } from '@tabletop-tools/db'

export const playerRouter = router({
  /** Glicko-2 leaderboard sorted by rating descending. */
  leaderboard: publicProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(200).default(50),
        minGames: z.number().int().min(0).default(10),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 50
      const minGames = input?.minGames ?? 10

      const rows = await ctx.db
        .select()
        .from(playerGlicko)
        .where(gte(playerGlicko.gamesPlayed, minGames))
        .orderBy(desc(playerGlicko.rating))
        .limit(limit)

      return rows.map((r) => ({
          id: r.id,
          userId: r.userId,
          playerName: r.playerName,
          rating: r.rating,
          ratingDeviation: r.ratingDeviation,
          volatility: r.volatility,
          gamesPlayed: r.gamesPlayed,
          displayRating: Math.round(r.rating),
          displayBand: Math.round(2 * r.ratingDeviation),
        }))
    }),

  /** Full profile for one player including rating history and recent results. */
  profile: publicProcedure
    .input(z.object({ playerId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [player] = await ctx.db
        .select()
        .from(playerGlicko)
        .where(eq(playerGlicko.id, input.playerId))
        .limit(1)

      if (!player) return null

      const historyRows = await ctx.db
        .select({
          id: glickoHistory.id,
          playerId: glickoHistory.playerId,
          ratingPeriod: glickoHistory.ratingPeriod,
          ratingBefore: glickoHistory.ratingBefore,
          rdBefore: glickoHistory.rdBefore,
          ratingAfter: glickoHistory.ratingAfter,
          rdAfter: glickoHistory.rdAfter,
          volatilityAfter: glickoHistory.volatilityAfter,
          delta: glickoHistory.delta,
          gamesInPeriod: glickoHistory.gamesInPeriod,
          recordedAt: glickoHistory.recordedAt,
          eventName: importedTournamentResults.eventName,
        })
        .from(glickoHistory)
        .leftJoin(importedTournamentResults, eq(glickoHistory.ratingPeriod, importedTournamentResults.id))
        .where(eq(glickoHistory.playerId, input.playerId))
        .orderBy(desc(glickoHistory.recordedAt))

      return {
        player: {
          ...player,
          displayRating: Math.round(player.rating),
          displayBand: Math.round(2 * player.ratingDeviation),
        },
        history: historyRows,
      }
    }),

  /** Search players by name (case-insensitive substring). */
  search: publicProcedure
    .input(z.object({ name: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(playerGlicko)
        .where(like(playerGlicko.playerName, `%${input.name}%`))

      return rows.map((r) => ({
          id: r.id,
          userId: r.userId,
          playerName: r.playerName,
          rating: r.rating,
          ratingDeviation: r.ratingDeviation,
          gamesPlayed: r.gamesPlayed,
          displayRating: Math.round(r.rating),
          displayBand: Math.round(2 * r.ratingDeviation),
        }))
    }),
})

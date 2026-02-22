import { z } from 'zod'
import { eq, desc, gte } from 'drizzle-orm'
import { router, publicProcedure } from '../trpc.js'
import { playerGlicko, glickoHistory } from '@tabletop-tools/db'

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
        .orderBy(desc(playerGlicko.rating))

      return rows
        .filter((r: any) => r.gamesPlayed >= minGames)
        .slice(0, limit)
        .map((r: any) => ({
          id: r.id,
          userId: r.userId,
          playerName: r.playerName,
          rating: r.rating,
          ratingDeviation: r.ratingDeviation,
          volatility: r.volatility,
          gamesPlayed: r.gamesPlayed,
          // Display as "1687 ± 94" where ±94 = 2×RD
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

      const history = await ctx.db
        .select()
        .from(glickoHistory)
        .where(eq(glickoHistory.playerId, input.playerId))
        .orderBy(desc(glickoHistory.recordedAt))

      return {
        player: {
          ...player,
          displayRating: Math.round(player.rating),
          displayBand: Math.round(2 * player.ratingDeviation),
        },
        history,
      }
    }),

  /** Search players by name (case-insensitive substring). */
  search: publicProcedure
    .input(z.object({ name: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.select().from(playerGlicko)
      const needle = input.name.toLowerCase()
      return rows
        .filter((r: any) => r.playerName.toLowerCase().includes(needle))
        .map((r: any) => ({
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

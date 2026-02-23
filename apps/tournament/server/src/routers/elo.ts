import { eq, desc } from 'drizzle-orm'
import { z } from 'zod'

import { playerElo, eloHistory, authUsers } from '@tabletop-tools/db'
import { router, protectedProcedure } from '../trpc'

export const eloRouter = router({
  get: protectedProcedure.input(z.string()).query(async ({ ctx, input }) => {
    const record = await ctx.db
      .select()
      .from(playerElo)
      .where(eq(playerElo.userId, input))
      .get()
    if (!record) return { rating: 1200, gamesPlayed: 0 }
    return { rating: record.rating, gamesPlayed: record.gamesPlayed }
  }),

  history: protectedProcedure.input(z.string()).query(async ({ ctx, input }) => {
    return ctx.db
      .select()
      .from(eloHistory)
      .where(eq(eloHistory.userId, input))
      .orderBy(desc(eloHistory.recordedAt))
      .all()
  }),

  leaderboard: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        userId: playerElo.userId,
        rating: playerElo.rating,
        gamesPlayed: playerElo.gamesPlayed,
        name: authUsers.name,
      })
      .from(playerElo)
      .leftJoin(authUsers, eq(playerElo.userId, authUsers.id))
      .orderBy(desc(playerElo.rating))
      .all()

    return rows.map((r) => ({
      userId: r.userId,
      displayName: r.name ?? r.userId,
      rating: r.rating,
      gamesPlayed: r.gamesPlayed,
    }))
  }),
})

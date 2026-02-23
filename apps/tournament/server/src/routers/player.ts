import { eq, and } from 'drizzle-orm'
import { z } from 'zod'

import { tournaments, tournamentPlayers } from '@tabletop-tools/db'
import { router, protectedProcedure } from '../trpc'

export const playerRouter = router({
  register: protectedProcedure
    .input(
      z.object({
        tournamentId: z.string(),
        displayName: z.string().min(1),
        faction: z.string().min(1),
        listText: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tournament = await ctx.db
        .select()
        .from(tournaments)
        .where(eq(tournaments.id, input.tournamentId))
        .get()
      if (!tournament) throw new Error('Tournament not found')
      if (tournament.status !== 'REGISTRATION') throw new Error('Registration is not open')

      const id = crypto.randomUUID()
      const now = Date.now()
      await ctx.db.insert(tournamentPlayers).values({
        id,
        tournamentId: input.tournamentId,
        userId: ctx.user.id,
        displayName: input.displayName,
        faction: input.faction,
        detachment: null,
        listText: input.listText ?? null,
        listLocked: 0,
        checkedIn: 0,
        dropped: 0,
        registeredAt: now,
      })
      return ctx.db.select().from(tournamentPlayers).where(eq(tournamentPlayers.id, id)).get()
    }),

  updateList: protectedProcedure
    .input(z.object({ tournamentId: z.string(), listText: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const player = await ctx.db
        .select()
        .from(tournamentPlayers)
        .where(
          and(
            eq(tournamentPlayers.tournamentId, input.tournamentId),
            eq(tournamentPlayers.userId, ctx.user.id),
          ),
        )
        .get()
      if (!player) throw new Error('Not registered')
      if (player.listLocked) throw new Error('Lists are locked')
      await ctx.db
        .update(tournamentPlayers)
        .set({ listText: input.listText })
        .where(eq(tournamentPlayers.id, player.id))
      return ctx.db.select().from(tournamentPlayers).where(eq(tournamentPlayers.id, player.id)).get()
    }),

  checkIn: protectedProcedure
    .input(z.object({ tournamentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const player = await ctx.db
        .select()
        .from(tournamentPlayers)
        .where(
          and(
            eq(tournamentPlayers.tournamentId, input.tournamentId),
            eq(tournamentPlayers.userId, ctx.user.id),
          ),
        )
        .get()
      if (!player) throw new Error('Not registered')
      await ctx.db
        .update(tournamentPlayers)
        .set({ checkedIn: 1 })
        .where(eq(tournamentPlayers.id, player.id))
      return { checkedIn: true }
    }),

  drop: protectedProcedure
    .input(z.object({ tournamentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const player = await ctx.db
        .select()
        .from(tournamentPlayers)
        .where(
          and(
            eq(tournamentPlayers.tournamentId, input.tournamentId),
            eq(tournamentPlayers.userId, ctx.user.id),
          ),
        )
        .get()
      if (!player) throw new Error('Not registered')
      await ctx.db
        .update(tournamentPlayers)
        .set({ dropped: 1 })
        .where(eq(tournamentPlayers.id, player.id))
      return { dropped: true }
    }),

  // TO actions
  list: protectedProcedure
    .input(z.object({ tournamentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const tournament = await ctx.db
        .select()
        .from(tournaments)
        .where(eq(tournaments.id, input.tournamentId))
        .get()
      if (!tournament) throw new Error('Tournament not found')
      if (tournament.toUserId !== ctx.user.id) throw new Error('Not authorized')
      return ctx.db
        .select()
        .from(tournamentPlayers)
        .where(eq(tournamentPlayers.tournamentId, input.tournamentId))
        .all()
    }),

  lockLists: protectedProcedure
    .input(z.object({ tournamentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const tournament = await ctx.db
        .select()
        .from(tournaments)
        .where(eq(tournaments.id, input.tournamentId))
        .get()
      if (!tournament) throw new Error('Tournament not found')
      if (tournament.toUserId !== ctx.user.id) throw new Error('Not authorized')
      await ctx.db
        .update(tournamentPlayers)
        .set({ listLocked: 1 })
        .where(eq(tournamentPlayers.tournamentId, input.tournamentId))
      return { locked: true }
    }),

  removePlayer: protectedProcedure
    .input(z.object({ playerId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const player = await ctx.db
        .select()
        .from(tournamentPlayers)
        .where(eq(tournamentPlayers.id, input.playerId))
        .get()
      if (!player) throw new Error('Player not found')
      const tournament = await ctx.db
        .select()
        .from(tournaments)
        .where(eq(tournaments.id, player.tournamentId))
        .get()
      if (!tournament || tournament.toUserId !== ctx.user.id) throw new Error('Not authorized')
      await ctx.db
        .update(tournamentPlayers)
        .set({ dropped: 1 })
        .where(eq(tournamentPlayers.id, input.playerId))
      return { dropped: true }
    }),
})

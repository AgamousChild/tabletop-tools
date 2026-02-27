import { TRPCError } from '@trpc/server'
import { eq, and, like, inArray } from 'drizzle-orm'
import { z } from 'zod'

import { tournaments, tournamentPlayers, pairings, rounds, tournamentCards, userBans, authUsers } from '@tabletop-tools/db'
import { router, protectedProcedure } from '../trpc'

export const playerRouter = router({
  register: protectedProcedure
    .input(
      z.object({
        tournamentId: z.string(),
        displayName: z.string().min(1),
        faction: z.string().min(1),
        detachment: z.string().optional(),
        listText: z.string().optional(),
        listId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tournament = await ctx.db
        .select()
        .from(tournaments)
        .where(eq(tournaments.id, input.tournamentId))
        .get()
      if (!tournament) throw new TRPCError({ code: 'NOT_FOUND', message: 'Tournament not found' })
      if (tournament.status !== 'REGISTRATION') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Registration is not open' })

      const id = crypto.randomUUID()
      const now = Date.now()
      await ctx.db.insert(tournamentPlayers).values({
        id,
        tournamentId: input.tournamentId,
        userId: ctx.user.id,
        displayName: input.displayName,
        faction: input.faction,
        detachment: input.detachment ?? null,
        listText: input.listText ?? null,
        listId: input.listId ?? null,
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
      if (!player) throw new TRPCError({ code: 'NOT_FOUND', message: 'Not registered' })
      if (player.listLocked) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Lists are locked' })
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
      if (!player) throw new TRPCError({ code: 'NOT_FOUND', message: 'Not registered' })
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
      if (!player) throw new TRPCError({ code: 'NOT_FOUND', message: 'Not registered' })
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
      if (!tournament) throw new TRPCError({ code: 'NOT_FOUND', message: 'Tournament not found' })
      if (tournament.toUserId !== ctx.user.id) throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' })
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
      if (!tournament) throw new TRPCError({ code: 'NOT_FOUND', message: 'Tournament not found' })
      if (tournament.toUserId !== ctx.user.id) throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' })
      await ctx.db
        .update(tournamentPlayers)
        .set({ listLocked: 1 })
        .where(eq(tournamentPlayers.tournamentId, input.tournamentId))
      return { locked: true }
    }),

  reinstate: protectedProcedure
    .input(z.object({ playerId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const player = await ctx.db
        .select()
        .from(tournamentPlayers)
        .where(eq(tournamentPlayers.id, input.playerId))
        .get()
      if (!player) throw new TRPCError({ code: 'NOT_FOUND', message: 'Player not found' })
      const tournament = await ctx.db
        .select()
        .from(tournaments)
        .where(eq(tournaments.id, player.tournamentId))
        .get()
      if (!tournament || tournament.toUserId !== ctx.user.id)
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' })
      if (!player.dropped)
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Player is not dropped' })
      await ctx.db
        .update(tournamentPlayers)
        .set({ dropped: 0 })
        .where(eq(tournamentPlayers.id, input.playerId))
      return { reinstated: true }
    }),

  removePlayer: protectedProcedure
    .input(z.object({ playerId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const player = await ctx.db
        .select()
        .from(tournamentPlayers)
        .where(eq(tournamentPlayers.id, input.playerId))
        .get()
      if (!player) throw new TRPCError({ code: 'NOT_FOUND', message: 'Player not found' })
      const tournament = await ctx.db
        .select()
        .from(tournaments)
        .where(eq(tournaments.id, player.tournamentId))
        .get()
      if (!tournament || tournament.toUserId !== ctx.user.id) throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' })
      await ctx.db
        .update(tournamentPlayers)
        .set({ dropped: 1 })
        .where(eq(tournamentPlayers.id, input.playerId))
      return { dropped: true }
    }),

  // Seed test players — dev/testing only. TO inserts fake players for local testing.
  seedTestPlayers: protectedProcedure
    .input(z.object({ tournamentId: z.string(), count: z.number().min(1).max(32).optional() }))
    .mutation(async ({ ctx, input }) => {
      const tournament = await ctx.db
        .select()
        .from(tournaments)
        .where(eq(tournaments.id, input.tournamentId))
        .get()
      if (!tournament) throw new TRPCError({ code: 'NOT_FOUND', message: 'Tournament not found' })
      if (tournament.toUserId !== ctx.user.id) throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' })

      const count = input.count ?? 8
      const testPlayers = [
        { name: 'Alex Ironforge', faction: 'Space Marines', detachment: 'Gladius Task Force' },
        { name: 'Sam Greenskin', faction: 'Orks', detachment: 'Waaagh! Tribe' },
        { name: 'Jordan Cryptek', faction: 'Necrons', detachment: 'Awakened Dynasty' },
        { name: 'Morgan Shas', faction: 'T\'au Empire', detachment: 'Kauyon' },
        { name: 'Riley Warpsmith', faction: 'Chaos Space Marines', detachment: 'Pactbound Zealots' },
        { name: 'Casey Farstrider', faction: 'Aeldari', detachment: 'Battle Host' },
        { name: 'Taylor Canticles', faction: 'Adeptus Mechanicus', detachment: 'Rad-Zone Corps' },
        { name: 'Jamie Terminator', faction: 'Grey Knights', detachment: 'Teleport Strike Force' },
        { name: 'Pat Shadowkeeper', faction: 'Adeptus Custodes', detachment: 'Shield Host' },
        { name: 'Drew Lictor', faction: 'Tyranids', detachment: 'Invasion Fleet' },
        { name: 'Charlie Bloodletter', faction: 'Chaos Daemons', detachment: 'Daemonic Incursion' },
        { name: 'Avery Commissar', faction: 'Astra Militarum', detachment: 'Combined Regiment' },
        { name: 'Quinn Plague', faction: 'Death Guard', detachment: 'Plague Company' },
        { name: 'Robin Hexfire', faction: 'Thousand Sons', detachment: 'Cult of Magic' },
        { name: 'Blair Skitarii', faction: 'Adeptus Mechanicus', detachment: 'Skitarii Hunter Cohort' },
        { name: 'Kai Wychking', faction: 'Drukhari', detachment: 'Realspace Raiders' },
      ]

      const now = Date.now()
      const inserted: string[] = []
      for (let i = 0; i < Math.min(count, testPlayers.length); i++) {
        const p = testPlayers[i]!
        const id = crypto.randomUUID()
        await ctx.db.insert(tournamentPlayers).values({
          id,
          tournamentId: input.tournamentId,
          userId: `test-${crypto.randomUUID()}`,
          displayName: p.name,
          faction: p.faction,
          detachment: p.detachment,
          listText: null,
          listId: null,
          listLocked: 0,
          checkedIn: 0,
          dropped: 0,
          registeredAt: now - (count - i) * 60000, // stagger registration times
        })
        inserted.push(p.name)
      }
      return { inserted: inserted.length, players: inserted }
    }),

  // My profile: aggregate W-L-D, tournaments played, ELO, card history, bans
  myProfile: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id

    // All registrations for this user
    const registrations = await ctx.db
      .select()
      .from(tournamentPlayers)
      .where(eq(tournamentPlayers.userId, userId))
      .all()

    const regIds = registrations.map((r) => r.id)

    // Get all tournaments the user participated in
    const tournamentIds = [...new Set(registrations.map((r) => r.tournamentId))]
    const userTournaments = tournamentIds.length > 0
      ? await ctx.db
          .select()
          .from(tournaments)
          .where(inArray(tournaments.id, tournamentIds))
          .all()
      : []

    // Compute W-L-D from pairings
    let wins = 0
    let losses = 0
    let draws = 0
    let totalVP = 0
    let gamesPlayed = 0

    if (regIds.length > 0) {
      // Get all pairings involving this player
      const allPairings = await ctx.db.select().from(pairings).all()
      const myPairings = allPairings.filter(
        (p) => p.result && (regIds.includes(p.player1Id) || (p.player2Id && regIds.includes(p.player2Id))),
      )

      for (const pair of myPairings) {
        const isP1 = regIds.includes(pair.player1Id)
        gamesPlayed++
        if (pair.result === 'BYE') {
          wins++
        } else if (pair.result === 'DRAW') {
          draws++
          totalVP += isP1 ? (pair.player1Vp ?? 0) : (pair.player2Vp ?? 0)
        } else if (pair.result === 'P1_WIN') {
          if (isP1) wins++
          else losses++
          totalVP += isP1 ? (pair.player1Vp ?? 0) : (pair.player2Vp ?? 0)
        } else if (pair.result === 'P2_WIN') {
          if (isP1) losses++
          else wins++
          totalVP += isP1 ? (pair.player1Vp ?? 0) : (pair.player2Vp ?? 0)
        }
      }
    }

    // Card history
    const allCards = regIds.length > 0
      ? (await ctx.db.select().from(tournamentCards).all()).filter((c) => regIds.includes(c.playerId))
      : []

    // Ban status
    const bans = await ctx.db
      .select()
      .from(userBans)
      .where(eq(userBans.userId, userId))
      .all()

    return {
      userId,
      tournamentsPlayed: registrations.length,
      tournaments: userTournaments.map((t) => ({
        id: t.id,
        name: t.name,
        status: t.status,
        eventDate: t.eventDate,
        format: t.format,
        faction: registrations.find((r) => r.tournamentId === t.id)?.faction ?? '',
      })),
      wins,
      losses,
      draws,
      gamesPlayed,
      totalVP,
      cards: allCards.map((c) => ({
        id: c.id,
        cardType: c.cardType,
        reason: c.reason,
        issuedAt: c.issuedAt,
        tournamentId: c.tournamentId,
      })),
      bans: bans.map((b) => ({
        id: b.id,
        reason: b.reason,
        bannedAt: b.bannedAt,
        liftedAt: b.liftedAt,
      })),
    }
  }),

  // Search army lists across tournaments by faction
  searchLists: protectedProcedure
    .input(z.object({ faction: z.string().optional(), query: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      let results = await ctx.db.select().from(tournamentPlayers).all()

      // Only return entries with actual list text
      results = results.filter((r) => r.listText && r.listText.trim().length > 0)

      if (input.faction) {
        const factionLower = input.faction.toLowerCase()
        results = results.filter((r) => r.faction.toLowerCase().includes(factionLower))
      }
      if (input.query) {
        const queryLower = input.query.toLowerCase()
        results = results.filter(
          (r) =>
            r.displayName.toLowerCase().includes(queryLower) ||
            r.faction.toLowerCase().includes(queryLower) ||
            (r.listText && r.listText.toLowerCase().includes(queryLower)),
        )
      }

      // Get tournament names for display
      const tIds = [...new Set(results.map((r) => r.tournamentId))]
      const tourns = tIds.length > 0
        ? await ctx.db.select().from(tournaments).where(inArray(tournaments.id, tIds)).all()
        : []
      const tournMap = new Map(tourns.map((t) => [t.id, t]))

      return results.slice(0, 50).map((r) => ({
        playerName: r.displayName,
        faction: r.faction,
        detachment: r.detachment,
        listText: r.listText,
        tournamentName: tournMap.get(r.tournamentId)?.name ?? '',
        tournamentId: r.tournamentId,
        eventDate: tournMap.get(r.tournamentId)?.eventDate ?? 0,
      }))
    }),

  // Search players by name with tournament history
  searchPlayers: protectedProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const queryLower = input.query.toLowerCase()

      // Search by display name across tournament registrations
      const allRegs = await ctx.db.select().from(tournamentPlayers).all()
      const matchingRegs = allRegs.filter((r) => r.displayName.toLowerCase().includes(queryLower))

      // Group by userId to get unique players
      const playerMap = new Map<string, { userId: string; displayName: string; registrations: typeof matchingRegs }>()
      for (const reg of matchingRegs) {
        const existing = playerMap.get(reg.userId)
        if (existing) {
          existing.registrations.push(reg)
        } else {
          playerMap.set(reg.userId, {
            userId: reg.userId,
            displayName: reg.displayName,
            registrations: [reg],
          })
        }
      }

      // Get card counts for matched players
      const allCards = await ctx.db.select().from(tournamentCards).all()
      const regIdsByUser = new Map<string, string[]>()
      for (const reg of allRegs) {
        const ids = regIdsByUser.get(reg.userId) ?? []
        ids.push(reg.id)
        regIdsByUser.set(reg.userId, ids)
      }

      // Get tournament names
      const tIds = [...new Set(matchingRegs.map((r) => r.tournamentId))]
      const tourns = tIds.length > 0
        ? await ctx.db.select().from(tournaments).where(inArray(tournaments.id, tIds)).all()
        : []
      const tournMap = new Map(tourns.map((t) => [t.id, t]))

      const results = [...playerMap.values()].slice(0, 25).map((p) => {
        const userRegIds = regIdsByUser.get(p.userId) ?? []
        const userCards = allCards.filter((c) => userRegIds.includes(c.playerId))
        return {
          userId: p.userId,
          displayName: p.displayName,
          tournamentsPlayed: (regIdsByUser.get(p.userId) ?? []).length,
          factions: [...new Set(allRegs.filter((r) => r.userId === p.userId).map((r) => r.faction))],
          yellowCards: userCards.filter((c) => c.cardType === 'YELLOW').length,
          redCards: userCards.filter((c) => c.cardType === 'RED').length,
          recentTournaments: p.registrations.slice(0, 5).map((r) => ({
            name: tournMap.get(r.tournamentId)?.name ?? '',
            faction: r.faction,
            eventDate: tournMap.get(r.tournamentId)?.eventDate ?? 0,
          })),
        }
      })

      return results
    }),
})

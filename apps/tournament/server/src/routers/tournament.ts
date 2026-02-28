import { TRPCError } from '@trpc/server'
import { eq, and, inArray } from 'drizzle-orm'
import { z } from 'zod'

import { tournaments, tournamentPlayers, rounds, pairings, importedTournamentResults, authUsers } from '@tabletop-tools/db'
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
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        format: z.string().min(1),
        totalRounds: z.number().int().min(1),
        description: z.string().optional(),
        imageUrl: z.string().url().optional(),
        externalLink: z.string().optional(),
        startTime: z.string().optional(),
        maxPlayers: z.number().int().min(1).optional(),
        missionPool: z.string().optional(),
        requirePhotos: z.boolean().default(false),
        includeTwists: z.boolean().default(false),
        includeChallenger: z.boolean().default(false),
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
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
          format: input.format,
          totalRounds: input.totalRounds,
          status: 'DRAFT',
          description: input.description ?? null,
          imageUrl: input.imageUrl ?? null,
          externalLink: input.externalLink ?? null,
          startTime: input.startTime ?? null,
          maxPlayers: input.maxPlayers ?? null,
          missionPool: input.missionPool ?? null,
          requirePhotos: input.requirePhotos ? 1 : 0,
          includeTwists: input.includeTwists ? 1 : 0,
          includeChallenger: input.includeChallenger ? 1 : 0,
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
    // Fetch TO name
    const toUser = await ctx.db
      .select({ name: authUsers.name })
      .from(authUsers)
      .where(eq(authUsers.id, tournament.toUserId))
      .get()
    return { ...tournament, playerCount: players.length, toName: toUser?.name ?? null }
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

  search: protectedProcedure
    .input(
      z.object({
        query: z.string().optional(),
        status: z.enum(['DRAFT', 'REGISTRATION', 'CHECK_IN', 'IN_PROGRESS', 'COMPLETE']).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      let results = await ctx.db.select().from(tournaments).all()

      if (input.status) {
        results = results.filter((t) => t.status === input.status)
      } else {
        // Default: exclude DRAFT (only show publicly relevant tournaments)
        results = results.filter((t) => t.status !== 'DRAFT')
      }

      if (input.query) {
        const q = input.query.toLowerCase()
        results = results.filter(
          (t) =>
            t.name.toLowerCase().includes(q) ||
            (t.location && t.location.toLowerCase().includes(q)) ||
            t.format.toLowerCase().includes(q),
        )
      }

      // Sort by event date descending (most recent first)
      results.sort((a, b) => b.eventDate - a.eventDate)

      // Get player counts for results
      const tIds = results.map((t) => t.id)
      const players = tIds.length > 0
        ? await ctx.db.select().from(tournamentPlayers).all()
        : []
      const countMap = new Map<string, number>()
      for (const p of players) {
        if (tIds.includes(p.tournamentId)) {
          countMap.set(p.tournamentId, (countMap.get(p.tournamentId) ?? 0) + 1)
        }
      }

      return results.slice(0, 50).map((t) => ({
        ...t,
        playerCount: countMap.get(t.id) ?? 0,
      }))
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
    if (!tournament) throw new TRPCError({ code: 'NOT_FOUND', message: 'Tournament not found' })
    if (tournament.toUserId !== ctx.user.id) throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' })
    const next = LIFECYCLE[tournament.status]
    if (!next) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Tournament is already complete' })
    await ctx.db.update(tournaments).set({ status: next }).where(eq(tournaments.id, input))

    // When completing a tournament, export results to new-meta
    if (next === 'COMPLETE') {
      await exportToNewMeta(ctx.db, tournament, ctx.user.id)
    }

    return ctx.db.select().from(tournaments).where(eq(tournaments.id, input)).get()
  }),

  delete: protectedProcedure.input(z.string()).mutation(async ({ ctx, input }) => {
    const tournament = await ctx.db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, input))
      .get()
    if (!tournament) throw new TRPCError({ code: 'NOT_FOUND', message: 'Tournament not found' })
    if (tournament.toUserId !== ctx.user.id) throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' })
    if (tournament.status !== 'DRAFT') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Can only delete DRAFT tournaments' })
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

    // Get pairings for this tournament's rounds only (not all pairings in DB)
    const tournamentPairings = await ctx.db
      .select()
      .from(pairings)
      .where(inArray(pairings.roundId, roundIds))
      .all()
    const confirmedPairings = tournamentPairings.filter((p) => p.result !== null)

    const results = confirmedPairings.map((p) => ({
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

// ---- Internal helpers ----

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Export completed tournament results to imported_tournament_results (new-meta pipeline).
 * Compiles standings into TournamentRecord format and inserts as a new import.
 */
async function exportToNewMeta(
  db: any,
  tournament: { id: string; name: string; eventDate: number; format: string },
  userId: string,
) {
  // Get all players
  const players = await db
    .select()
    .from(tournamentPlayers)
    .where(eq(tournamentPlayers.tournamentId, tournament.id))
    .all()

  // Get all rounds and pairings
  const allRounds = await db
    .select()
    .from(rounds)
    .where(eq(rounds.tournamentId, tournament.id))
    .all()

  const roundIds = allRounds.map((r: any) => r.id)
  if (roundIds.length === 0) return

  const allPairings = await db
    .select()
    .from(pairings)
    .where(inArray(pairings.roundId, roundIds))
    .all()

  // Compute W/L/D and VP for each player
  const playerStats = new Map<string, { wins: number; losses: number; draws: number; vp: number }>()
  for (const p of players) {
    playerStats.set(p.id, { wins: 0, losses: 0, draws: 0, vp: 0 })
  }

  for (const pair of allPairings) {
    if (!pair.result) continue
    const s1 = playerStats.get(pair.player1Id)
    const s2 = pair.player2Id ? playerStats.get(pair.player2Id) : null

    if (pair.result === 'P1_WIN') {
      if (s1) { s1.wins++; s1.vp += pair.player1Vp ?? 0 }
      if (s2) { s2.losses++; s2.vp += pair.player2Vp ?? 0 }
    } else if (pair.result === 'P2_WIN') {
      if (s1) { s1.losses++; s1.vp += pair.player1Vp ?? 0 }
      if (s2) { s2.wins++; s2.vp += pair.player2Vp ?? 0 }
    } else if (pair.result === 'DRAW') {
      if (s1) { s1.draws++; s1.vp += pair.player1Vp ?? 0 }
      if (s2) { s2.draws++; s2.vp += pair.player2Vp ?? 0 }
    } else if (pair.result === 'BYE') {
      if (s1) { s1.wins++; s1.vp += pair.player1Vp ?? 0 }
    }
  }

  // Sort players by record (wins desc, then VP desc) for placement
  const sorted = [...players].sort((a, b) => {
    const sa = playerStats.get(a.id)!
    const sb = playerStats.get(b.id)!
    if (sb.wins !== sa.wins) return sb.wins - sa.wins
    return sb.vp - sa.vp
  })

  const eventDateIso = new Date(tournament.eventDate).toISOString().split('T')[0]!
  const year = new Date(tournament.eventDate).getFullYear()
  const quarter = Math.ceil((new Date(tournament.eventDate).getMonth() + 1) / 3)
  const metaWindow = `${year}-Q${quarter}`

  const tournamentRecord = {
    eventName: tournament.name,
    eventDate: eventDateIso,
    format: tournament.format,
    players: sorted.map((p, idx) => {
      const stats = playerStats.get(p.id)!
      return {
        placement: idx + 1,
        playerName: p.displayName,
        faction: p.faction,
        detachment: p.detachment ?? undefined,
        listText: p.listText ?? undefined,
        wins: stats.wins,
        losses: stats.losses,
        draws: stats.draws,
        points: stats.vp,
      }
    }),
  }

  const importId = generateId()
  await db.insert(importedTournamentResults).values({
    id: importId,
    importedBy: userId,
    eventName: tournament.name,
    eventDate: tournament.eventDate,
    format: tournament.format,
    metaWindow,
    rawData: JSON.stringify(tournamentRecord),
    parsedData: JSON.stringify([tournamentRecord]),
    importedAt: Date.now(),
  })
}

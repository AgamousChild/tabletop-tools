import {
  authUsers,
  glickoHistory,
  metaEventPlayers,
  metaEvents,
  metaPairings,
  pairings,
  playerGlicko,
  rankingMetric,
  rounds,
  tournamentPairingMetric,
  tournamentPlacingMetric,
  tournamentPlayers,
  tournaments,
} from '@tabletop-tools/db'
import { resolveFaction } from '@tabletop-tools/db'
import { generateId, updateGlicko2 } from '@tabletop-tools/server-core'
import { TRPCError } from '@trpc/server'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'

import { computeStandings } from '../lib/standings/compute'
import { computeMetricStandings } from '../lib/standings/metric-compute'
import { protectedProcedure, router } from '../trpc'

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
      await ctx.db.insert(tournaments).values({
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
      const players = tIds.length > 0 ? await ctx.db.select().from(tournamentPlayers).all() : []
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
    if (tournament.toUserId !== ctx.user.id)
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' })
    const next = LIFECYCLE[tournament.status]
    if (!next)
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Tournament is already complete' })
    await ctx.db.update(tournaments).set({ status: next }).where(eq(tournaments.id, input))

    // When completing a tournament, export results to meta tables
    if (next === 'COMPLETE') {
      await exportToMeta(ctx.db, tournament)
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
    if (tournament.toUserId !== ctx.user.id)
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' })
    if (tournament.status !== 'DRAFT')
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Can only delete DRAFT tournaments' })
    await ctx.db.delete(tournaments).where(eq(tournaments.id, input))
    return { deleted: true }
  }),

  standings: protectedProcedure
    .input(
      z.object({
        tournamentId: z.string(),
        stackType: z.enum(['pairing', 'placing']).default('pairing'),
      }),
    )
    .query(async ({ ctx, input }) => {
      const players = await ctx.db
        .select()
        .from(tournamentPlayers)
        .where(eq(tournamentPlayers.tournamentId, input.tournamentId))
        .all()

      // Load the metric stack for this tournament from the DB
      const stackTable =
        input.stackType === 'pairing' ? tournamentPairingMetric : tournamentPlacingMetric
      const stackRows = await ctx.db
        .select({
          key: rankingMetric.key,
          enabled: stackTable.enabled,
          sortOrder: stackTable.sortOrder,
        })
        .from(stackTable)
        .innerJoin(rankingMetric, eq(stackTable.rankingMetricId, rankingMetric.id))
        .where(eq(stackTable.tournamentId, input.tournamentId))
        .orderBy(asc(stackTable.sortOrder))
        .all()

      // Get all confirmed results for this tournament
      const allRounds = await ctx.db
        .select()
        .from(rounds)
        .where(eq(rounds.tournamentId, input.tournamentId))
        .all()

      const roundIds = allRounds.map((r) => r.id)
      const playerInputs = players.map((p) => ({
        id: p.id,
        displayName: p.displayName,
        faction: p.faction,
        factionEntityId: p.factionEntityId,
        detachmentEntityId: p.detachmentEntityId,
        registeredAt: p.registeredAt,
        placement: p.placement,
      }))

      if (roundIds.length === 0) {
        if (stackRows.length > 0) {
          return {
            round: 0,
            stackType: input.stackType,
            metricKeys: stackRows.map((r) => r.key),
            players: computeMetricStandings(playerInputs, [], stackRows),
          }
        }
        return {
          round: 0,
          stackType: 'legacy' as const,
          metricKeys: ['wins', 'vp_margin', 'sos_wins', 'battle_points', 'registered_at'],
          players: computeStandings(playerInputs, []),
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

      if (stackRows.length > 0) {
        return {
          round: currentRound,
          stackType: input.stackType,
          metricKeys: stackRows.map((r) => r.key),
          players: computeMetricStandings(playerInputs, results, stackRows),
        }
      }

      // Fallback: legacy hardcoded compute for tournaments without a configured metric stack
      return {
        round: currentRound,
        stackType: 'legacy' as const,
        metricKeys: ['wins', 'vp_margin', 'sos_wins', 'battle_points', 'registered_at'],
        players: computeStandings(playerInputs, results),
      }
    }),
})

// ---- Internal helpers ----

/**
 * Export completed tournament results directly to meta 3NF tables
 * (metaEvents, metaEventPlayers, metaPairings) and run Glicko-2.
 */
async function exportToMeta(
  db: any,
  tournament: {
    id: string
    name: string
    eventDate: number
    format: string
    location: string | null
    totalRounds: number
  },
) {
  // Get all players (non-dropped)
  const allPlayers = await db
    .select()
    .from(tournamentPlayers)
    .where(eq(tournamentPlayers.tournamentId, tournament.id))
    .all()

  const activePlayers = allPlayers.filter((p: any) => !p.dropped)

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

  // Check for existing export and delete if found (re-export)
  const existing = await db
    .select({ id: metaEvents.id })
    .from(metaEvents)
    .where(and(eq(metaEvents.source, 'native'), eq(metaEvents.sourceId, tournament.id)))
    .get()
  if (existing) {
    await db.delete(metaEvents).where(eq(metaEvents.id, existing.id))
  }

  // Compute W/L/D for each player
  const playerStats = new Map<string, { wins: number; losses: number; draws: number; vp: number }>()
  for (const p of activePlayers) {
    playerStats.set(p.id, { wins: 0, losses: 0, draws: 0, vp: 0 })
  }

  for (const pair of allPairings) {
    if (!pair.result) continue
    const s1 = playerStats.get(pair.player1Id)
    const s2 = pair.player2Id ? playerStats.get(pair.player2Id) : null

    if (pair.result === 'P1_WIN') {
      if (s1) {
        s1.wins++
        s1.vp += pair.player1Vp ?? 0
      }
      if (s2) {
        s2.losses++
        s2.vp += pair.player2Vp ?? 0
      }
    } else if (pair.result === 'P2_WIN') {
      if (s1) {
        s1.losses++
        s1.vp += pair.player1Vp ?? 0
      }
      if (s2) {
        s2.wins++
        s2.vp += pair.player2Vp ?? 0
      }
    } else if (pair.result === 'DRAW') {
      if (s1) {
        s1.draws++
        s1.vp += pair.player1Vp ?? 0
      }
      if (s2) {
        s2.draws++
        s2.vp += pair.player2Vp ?? 0
      }
    } else if (pair.result === 'BYE') {
      if (s1) {
        s1.wins++
        s1.vp += pair.player1Vp ?? 0
      }
    }
  }

  // Sort players by record (wins desc, then VP desc) for placement
  const sorted = [...activePlayers].sort((a: any, b: any) => {
    const sa = playerStats.get(a.id)!
    const sb = playerStats.get(b.id)!
    if (sb.wins !== sa.wins) return sb.wins - sa.wins
    return sb.vp - sa.vp
  })

  // INSERT metaEvent
  const eventId = generateId()
  const now = Date.now()
  await db.insert(metaEvents).values({
    id: eventId,
    name: tournament.name,
    date: tournament.eventDate,
    location: tournament.location ?? null,
    format: tournament.format,
    rounds: tournament.totalRounds,
    playerCount: activePlayers.length,
    source: 'native',
    sourceId: tournament.id,
    importedAt: now,
  })

  // INSERT metaEventPlayers — map tournament player IDs to new meta player IDs
  const tournPlayerToMetaPlayer = new Map<string, string>()

  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i] as any
    const stats = playerStats.get(p.id)!
    const metaPlayerId = generateId()
    tournPlayerToMetaPlayer.set(p.id, metaPlayerId)

    // Resolve faction
    let factionId = await resolveFaction(db, p.faction)
    if (!factionId) factionId = 'unknown'

    await db.insert(metaEventPlayers).values({
      id: metaPlayerId,
      eventId,
      playerName: p.displayName,
      sourcePlayerId: p.userId,
      factionId,
      placement: i + 1,
      listText: p.listText ?? null,
      wins: stats.wins,
      losses: stats.losses,
      draws: stats.draws,
    })
  }

  // INSERT metaPairings — skip byes (player2Id is NULL)
  // Need round numbers: build roundId -> roundNumber map
  const roundNumberMap = new Map<string, number>()
  for (const r of allRounds) {
    roundNumberMap.set(r.id, r.roundNumber)
  }

  for (const pair of allPairings) {
    if (!pair.result || !pair.player2Id) continue // skip byes and unresolved

    const metaP1 = tournPlayerToMetaPlayer.get(pair.player1Id)
    const metaP2 = tournPlayerToMetaPlayer.get(pair.player2Id)
    if (!metaP1 || !metaP2) continue // dropped players not in meta

    let metaResult: string
    if (pair.result === 'P1_WIN') metaResult = 'p1'
    else if (pair.result === 'P2_WIN') metaResult = 'p2'
    else if (pair.result === 'DRAW') metaResult = 'draw'
    else continue // skip BYE or unknown

    await db.insert(metaPairings).values({
      id: generateId(),
      eventId,
      round: roundNumberMap.get(pair.roundId) ?? 1,
      player1Id: metaP1,
      player2Id: metaP2,
      player1Score: pair.player1Vp ?? null,
      player2Score: pair.player2Vp ?? null,
      result: metaResult,
    })
  }

  // Run Glicko-2 computation using real pairing data
  await computeGlicko2ForEvent(db, eventId)
}

/**
 * Compute Glicko-2 updates for all players in a meta event.
 * Uses actual opponent ratings from metaPairings instead of synthetic average opponents.
 */
async function computeGlicko2ForEvent(db: any, eventId: string) {
  // Load all meta event players for this event
  const eventPlayers = await db
    .select()
    .from(metaEventPlayers)
    .where(eq(metaEventPlayers.eventId, eventId))
    .all()

  // Load all pairings for this event
  const eventPairings = await db
    .select()
    .from(metaPairings)
    .where(eq(metaPairings.eventId, eventId))
    .all()

  if (eventPlayers.length === 0 || eventPairings.length === 0) return

  // Load all existing Glicko entries
  const allGlicko = await db.select().from(playerGlicko).all()
  type GlickoRow = (typeof allGlicko)[number]
  const glickoByName = new Map<string, GlickoRow>()
  for (const g of allGlicko) {
    glickoByName.set(g.playerName.toLowerCase(), g)
  }

  // Map metaEventPlayer IDs to Glicko IDs, creating entries as needed
  const metaPlayerToGlicko = new Map<string, string>()
  const metaPlayerIdToGlickoData = new Map<string, GlickoRow>()

  // Load platform users for userId matching
  const users = await db
    .select({
      id: authUsers.id,
      username: authUsers.username,
      displayUsername: authUsers.displayUsername,
    })
    .from(authUsers)

  for (const ep of eventPlayers) {
    const name = ep.playerName
    let glickoEntry = glickoByName.get(name.toLowerCase())

    if (!glickoEntry) {
      // Try to match to platform user
      let userId: string | null = null
      if (ep.sourcePlayerId) {
        const user = users.find((u: any) => u.id === ep.sourcePlayerId)
        if (user) userId = user.id
      }

      const newId = generateId()
      const newEntry = {
        id: newId,
        userId,
        playerName: name,
        rating: 1500,
        ratingDeviation: 350,
        volatility: 0.06,
        gamesPlayed: 0,
        lastRatingPeriod: null,
        updatedAt: Date.now(),
      }
      await db.insert(playerGlicko).values(newEntry)
      glickoByName.set(name.toLowerCase(), newEntry as any)
      glickoEntry = newEntry as any
    }

    metaPlayerToGlicko.set(ep.id, glickoEntry!.id)
    metaPlayerIdToGlickoData.set(ep.id, glickoEntry!)
  }

  // For each meta event player, collect their games from pairings
  for (const ep of eventPlayers) {
    const glickoId = metaPlayerToGlicko.get(ep.id)
    if (!glickoId) continue

    const current = metaPlayerIdToGlickoData.get(ep.id)!
    const games: Array<{ opponentRating: number; opponentRD: number; score: number }> = []

    for (const pair of eventPairings) {
      let opponentMetaId: string | null = null
      let score: number | null = null

      if (pair.player1Id === ep.id) {
        opponentMetaId = pair.player2Id
        score = pair.result === 'p1' ? 1 : pair.result === 'p2' ? 0 : 0.5
      } else if (pair.player2Id === ep.id) {
        opponentMetaId = pair.player1Id
        score = pair.result === 'p2' ? 1 : pair.result === 'p1' ? 0 : 0.5
      }

      if (opponentMetaId && score !== null) {
        const oppGlicko = metaPlayerIdToGlickoData.get(opponentMetaId)
        if (oppGlicko) {
          games.push({
            opponentRating: oppGlicko.rating,
            opponentRD: oppGlicko.ratingDeviation,
            score,
          })
        }
      }
    }

    if (games.length === 0) continue

    const ratingBefore = current.rating
    const rdBefore = current.ratingDeviation

    const result = updateGlicko2(
      {
        rating: current.rating,
        ratingDeviation: current.ratingDeviation,
        volatility: current.volatility,
      },
      games,
    )

    const now = Date.now()
    await db
      .update(playerGlicko)
      .set({
        rating: result.rating,
        ratingDeviation: result.ratingDeviation,
        volatility: result.volatility,
        gamesPlayed: current.gamesPlayed + games.length,
        lastRatingPeriod: eventId,
        updatedAt: now,
      })
      .where(eq(playerGlicko.id, glickoId))

    await db.insert(glickoHistory).values({
      id: generateId(),
      playerId: glickoId,
      ratingPeriod: eventId,
      ratingBefore,
      rdBefore,
      ratingAfter: result.rating,
      rdAfter: result.ratingDeviation,
      volatilityAfter: result.volatility,
      delta: result.rating - ratingBefore,
      gamesInPeriod: games.length,
      recordedAt: now,
    })
  }
}

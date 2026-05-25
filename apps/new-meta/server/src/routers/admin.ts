import {
  authUsers,
  glickoHistory,
  metaEventPlayers,
  metaEvents,
  metaPairings,
  playerGlicko,
} from '@tabletop-tools/db'
import { resolveFaction } from '@tabletop-tools/db'
import type { TournamentRecord } from '@tabletop-tools/game-content'
import { parseBcpCsv, parseGenericCsv, parseTabletopAdmiralCsv } from '@tabletop-tools/game-content'
import { generateId, updateGlicko2 } from '@tabletop-tools/server-core'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { matchPlayerName } from '../lib/playerMatch.js'
import { adminProcedure, router } from '../trpc.js'

export const adminRouter = router({
  /**
   * Import a tournament CSV.
   * Writes directly to metaEvents/metaEventPlayers/metaPairings, then computes Glicko-2.
   */
  import: adminProcedure
    .input(
      z.object({
        csv: z.string().min(1),
        format: z.enum(['bcp-csv', 'tabletop-admiral-csv', 'generic-csv']),
        eventName: z.string().min(1),
        eventDate: z.string(), // ISO date string
        metaWindow: z.string().min(1),
        minRounds: z.number().int().min(1).optional(),
        minPlayers: z.number().int().min(2).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Parse the CSV
      let records: TournamentRecord[]
      const eventDateTs = new Date(input.eventDate).getTime()

      if (input.format === 'bcp-csv') {
        const rec = parseBcpCsv(input.csv, {
          eventName: input.eventName,
          eventDate: input.eventDate,
        })
        records = [rec]
      } else if (input.format === 'tabletop-admiral-csv') {
        const rec = parseTabletopAdmiralCsv(input.csv, {
          eventName: input.eventName,
          eventDate: input.eventDate,
        })
        records = [rec]
      } else {
        records = parseGenericCsv(input.csv)
      }

      const now = Date.now()
      let totalImported = 0

      for (const record of records) {
        const eventId = generateId()

        // Insert meta event
        await ctx.db.insert(metaEvents).values({
          id: eventId,
          name: input.eventName,
          date: eventDateTs,
          format: input.format,
          rounds: null,
          playerCount: record.players.length,
          source: 'csv-import',
          sourceId: null,
          importedAt: now,
        })

        // Insert meta event players
        for (let i = 0; i < record.players.length; i++) {
          const p = record.players[i]
          const playerName = p.playerName ?? `[${p.faction}@${p.placement}]`

          let factionId = await resolveFaction(ctx.db, p.faction)
          if (!factionId) factionId = 'unknown'

          await ctx.db.insert(metaEventPlayers).values({
            id: generateId(),
            eventId,
            playerName,
            factionId,
            placement: p.placement,
            listText: p.listText ?? null,
            wins: p.wins,
            losses: p.losses,
            draws: p.draws,
          })
        }

        totalImported += record.players.length

        // Run Glicko-2 for this event
        await updateGlickoForEvent(ctx.db, eventId)
      }

      return {
        importId: 'batch',
        imported: totalImported,
        skipped: 0,
        errors: [] as string[],
        playersUpdated: totalImported,
      }
    }),

  /** Recompute all Glicko-2 ratings from scratch. */
  recomputeGlicko: adminProcedure
    .input(z.object({ fromImportId: z.string().optional() }).optional())
    .mutation(async ({ ctx }) => {
      // Clear all existing Glicko data
      await ctx.db.delete(glickoHistory)
      await ctx.db.delete(playerGlicko)

      // Get all meta events ordered by date
      const events = await ctx.db.select().from(metaEvents).orderBy(metaEvents.date).all()

      let updated = 0
      for (const event of events) {
        updated += await updateGlickoForEvent(ctx.db, event.id)
      }

      return { playersUpdated: updated }
    }),

  /** Link an anonymous Glicko entry to a platform account. */
  linkPlayer: adminProcedure
    .input(
      z.object({
        glickoId: z.string(),
        userId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(playerGlicko)
        .set({ userId: input.userId, updatedAt: Date.now() })
        .where(eq(playerGlicko.id, input.glickoId))

      const [updated] = await ctx.db
        .select()
        .from(playerGlicko)
        .where(eq(playerGlicko.id, input.glickoId))
        .limit(1)

      return updated ?? null
    }),
})

// ---- Internal helper ----

async function updateGlickoForEvent(db: any, eventId: string): Promise<number> {
  // Load event players
  const eventPlayers = await db
    .select()
    .from(metaEventPlayers)
    .where(eq(metaEventPlayers.eventId, eventId))
    .all()

  // Load event pairings
  const eventPairings = await db
    .select()
    .from(metaPairings)
    .where(eq(metaPairings.eventId, eventId))
    .all()

  // Load all existing Glicko entries
  const allGlicko = await db.select().from(playerGlicko).all()
  type GlickoRow = (typeof allGlicko)[number]
  const glickoByName = new Map<string, GlickoRow>()
  for (const g of allGlicko) {
    glickoByName.set(g.playerName.toLowerCase(), g)
  }

  // Load platform users for name matching
  const users = await db
    .select({
      id: authUsers.id,
      username: authUsers.username,
      displayUsername: authUsers.displayUsername,
    })
    .from(authUsers)

  // Map metaEventPlayer IDs to Glicko entries
  const metaPlayerToGlicko = new Map<string, string>()
  const metaPlayerIdToGlickoData = new Map<string, GlickoRow>()

  for (const ep of eventPlayers) {
    const name = ep.playerName
    let glickoEntry = glickoByName.get(name.toLowerCase())

    if (!glickoEntry) {
      const userId = matchPlayerName(name, users)
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

  // If no pairings, use synthesized games (for CSV imports without pairing data)
  const hasPairings = eventPairings.length > 0
  let updated = 0

  for (const ep of eventPlayers) {
    const glickoId = metaPlayerToGlicko.get(ep.id)
    if (!glickoId) continue

    const current = metaPlayerIdToGlickoData.get(ep.id)!
    let games: Array<{ opponentRating: number; opponentRD: number; score: number }> = []

    if (hasPairings) {
      // Use real pairing data
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
    } else {
      // Synthesize games from W/L/D (for CSV imports without pairing data)
      const avgOpponentRating = 1500
      const avgOpponentRD = 200
      games = [
        ...Array(ep.wins).fill({
          opponentRating: avgOpponentRating,
          opponentRD: avgOpponentRD,
          score: 1,
        }),
        ...Array(ep.losses).fill({
          opponentRating: avgOpponentRating,
          opponentRD: avgOpponentRD,
          score: 0,
        }),
        ...Array(ep.draws).fill({
          opponentRating: avgOpponentRating,
          opponentRD: avgOpponentRD,
          score: 0.5,
        }),
      ]
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

    updated++
  }

  return updated
}

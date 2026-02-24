import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { router, adminProcedure } from '../trpc.js'
import {
  importedTournamentResults,
  playerGlicko,
  glickoHistory,
  authUsers,
} from '@tabletop-tools/db'
import {
  parseBcpCsv,
  parseTabletopAdmiralCsv,
  parseGenericCsv,
} from '@tabletop-tools/game-content'
import type { TournamentRecord } from '@tabletop-tools/game-content'
import { updateGlicko2 } from '../lib/glicko2.js'
import { matchPlayerName } from '../lib/playerMatch.js'

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export const adminRouter = router({
  /**
   * Import a tournament CSV.
   * Stores raw + parsed data, then computes Glicko-2 updates for all players.
   */
  import: adminProcedure
    .input(
      z.object({
        csv: z.string().min(1),
        format: z.enum(['bcp-csv', 'tabletop-admiral-csv', 'generic-csv']),
        eventName: z.string().min(1),
        eventDate: z.string(),  // ISO date string
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

      const importId = generateId()
      const now = Date.now()

      // Store the import
      await ctx.db.insert(importedTournamentResults).values({
        id: importId,
        importedBy: ctx.user.id,
        eventName: input.eventName,
        eventDate: eventDateTs,
        format: input.format,
        metaWindow: input.metaWindow,
        rawData: input.csv,
        parsedData: JSON.stringify(records),
        importedAt: now,
      })

      // Compute Glicko-2 updates
      const playerCount = records.reduce((s, r) => s + r.players.length, 0)
      const updated = await updateGlickoForImport(ctx.db, importId, records)

      return {
        importId,
        imported: playerCount,
        skipped: 0,
        errors: [] as string[],
        playersUpdated: updated,
      }
    }),

  /** Recompute all Glicko-2 ratings from scratch (or from a specific import). */
  recomputeGlicko: adminProcedure
    .input(z.object({ fromImportId: z.string().optional() }).optional())
    .mutation(async ({ ctx }) => {
      // Get all imports ordered by event date
      const imports = await ctx.db
        .select()
        .from(importedTournamentResults)

      let updated = 0
      for (const imp of imports) {
        let records: TournamentRecord[] = []
        try {
          records = JSON.parse(imp.parsedData)
        } catch { continue }
        updated += await updateGlickoForImport(ctx.db, imp.id, records)
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

async function updateGlickoForImport(
  db: any,
  importId: string,
  records: TournamentRecord[],
): Promise<number> {
  // Load all platform users for name matching
  const users = await db.select({
    id: authUsers.id,
    username: authUsers.username,
    displayUsername: authUsers.displayUsername,
  }).from(authUsers)

  // Collect all player names from this import
  // Use playerName if available (from BCP/TA/generic parsers), fall back to faction as identifier
  const playerNames = records.flatMap((r) =>
    r.players.map((p) => p.playerName ?? `[${p.faction}@${p.placement}]`),
  )
  const uniqueNames = [...new Set(playerNames)]

  // Load all existing Glicko entries once (not per-name)
  const allGlicko = await db.select().from(playerGlicko).all()
  type GlickoRow = (typeof allGlicko)[number]
  const glickoByName = new Map<string, GlickoRow>()
  for (const g of allGlicko) {
    glickoByName.set(g.playerName.toLowerCase(), g)
  }

  // Resolve or create Glicko entries
  const nameToGlickoId = new Map<string, string>()
  for (const name of uniqueNames) {
    if (!name) continue

    const match = glickoByName.get(name.toLowerCase())

    if (match) {
      nameToGlickoId.set(name, match.id)
    } else {
      // Create new entry
      const userId = matchPlayerName(name, users)
      const newId = generateId()
      await db.insert(playerGlicko).values({
        id: newId,
        userId,
        playerName: name,
        updatedAt: Date.now(),
      })
      nameToGlickoId.set(name, newId)
      // Add to map so subsequent lookups in the same import see it
      glickoByName.set(name.toLowerCase(), { id: newId, playerName: name, userId, rating: 1500, ratingDeviation: 350, volatility: 0.06, gamesPlayed: 0, lastRatingPeriod: null, updatedAt: Date.now() })
    }
  }

  // For each player, compute Glicko-2 update from their results in this import
  // Since TournamentRecord only has standings (not individual game results),
  // we synthesize games: each win = 1 game won vs "average" opponent in the pool.
  // This is a simplified model; full pairing-level data would be more accurate.
  let updated = 0

  for (const record of records) {
    for (const player of record.players) {
      const name = player.playerName ?? `[${player.faction}@${player.placement}]`
      if (!name) continue

      const glickoId = nameToGlickoId.get(name)
      if (!glickoId) continue

      const current = glickoByName.get(name.toLowerCase()) as any
      if (!current) continue

      // Synthesize game results: wins + losses + draws
      const avgOpponentRating = 1500
      const avgOpponentRD = 200
      const games = [
        ...Array(player.wins).fill({ opponentRating: avgOpponentRating, opponentRD: avgOpponentRD, score: 1 }),
        ...Array(player.losses).fill({ opponentRating: avgOpponentRating, opponentRD: avgOpponentRD, score: 0 }),
        ...Array(player.draws).fill({ opponentRating: avgOpponentRating, opponentRD: avgOpponentRD, score: 0.5 }),
      ]

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
          lastRatingPeriod: importId,
          updatedAt: now,
        })
        .where(eq(playerGlicko.id, glickoId))

      await db.insert(glickoHistory).values({
        id: generateId(),
        playerId: glickoId,
        ratingPeriod: importId,
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
  }

  return updated
}

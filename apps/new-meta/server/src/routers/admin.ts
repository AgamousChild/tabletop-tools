import { authUsers, glickoHistory, metaEvents, playerGlicko } from '@tabletop-tools/db'
import type { TournamentRecord } from '@tabletop-tools/game-content'
import { parseBcpCsv, parseGenericCsv, parseTabletopAdmiralCsv } from '@tabletop-tools/game-content'
import {
  type MetaIngestPlayer,
  runGlickoForEvent,
  upsertMetaEvent,
} from '@tabletop-tools/server-core'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { matchPlayerName } from '../lib/playerMatch.js'
import { adminProcedure, router } from '../trpc.js'

/**
 * SHA-256 digest of a UTF-8 string, as a hex string. Same pattern as
 * content-ingestor's worker.ts webhook-token hashing.
 */
async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Deterministic (source, sourceId) key for a CSV-imported event — D2-01's
 * fix for the `sourceId: null` gap that let every re-upload duplicate the
 * whole event instead of replacing it.
 *
 * Keyed on the record's own eventName + eventDate (not the raw CSV bytes):
 * generic-csv can yield several records from one upload, each already
 * uniquely keyed by exactly this pair (see parseGenericCsv's `eventKey`),
 * so it's sufficient for uniqueness within and across uploads. Deliberately
 * excludes CSV content so that re-uploading a *corrected* file for the same
 * event replaces it via upsertMetaEvent's delete-then-reinsert instead of
 * creating a duplicate "corrected" ghost event — the behavior an admin
 * fixing a typo'd result actually wants.
 */
async function csvEventSourceId(record: Pick<TournamentRecord, 'eventName' | 'eventDate'>) {
  return sha256Hex(`${record.eventName}|${record.eventDate}`)
}

export const adminRouter = router({
  /**
   * Import a tournament CSV. Each parsed record is handed to the shared
   * upsertMetaEvent() writer (D2-01), which owns the (source, sourceId)
   * upsert, Glicko-2, and the analytics-cube rebuild — this router only
   * parses the CSV and resolves player-name-to-account matches first.
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

      // Loaded once and reused for every record/player below — matches
      // updateGlickoForEvent's former per-player query, just hoisted out of
      // the loop since it doesn't change across records in one import call.
      const users = await ctx.db
        .select({
          id: authUsers.id,
          username: authUsers.username,
          displayUsername: authUsers.displayUsername,
        })
        .from(authUsers)
        .all()

      let totalImported = 0

      for (const record of records) {
        const players: MetaIngestPlayer[] = record.players.map((p) => ({
          playerName: p.playerName ?? `[${p.faction}@${p.placement}]`,
          // Case-insensitive exact username/displayUsername match — same
          // matchPlayerName this router always used; upsertMetaEvent's
          // shared Glicko path (runGlickoForEvent) links to the resolved
          // account via sourcePlayerId instead of re-matching by name.
          sourcePlayerId: matchPlayerName(p.playerName ?? '', users) ?? undefined,
          faction: p.faction,
          placement: p.placement,
          listText: p.listText ?? null,
          wins: p.wins,
          losses: p.losses,
          draws: p.draws,
        }))

        await upsertMetaEvent(ctx.db, {
          source: 'csv-import',
          sourceId: await csvEventSourceId(record),
          name: record.eventName || input.eventName,
          date: record.eventDate ? new Date(record.eventDate).getTime() : eventDateTs,
          format: input.format,
          rounds: null,
          playerCount: record.players.length,
          players,
          // CSV imports carry no round-by-round pairing data — matches the
          // pre-D2-01 behavior, which never wrote metaPairings rows for
          // this path either. runGlickoForEvent's synthesized-games
          // fallback (built from each player's W/L/D) is exactly the path
          // this exercises, preserved unchanged from admin.ts's original
          // updateGlickoForEvent.
          pairings: [],
        })

        totalImported += record.players.length
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
        updated += await runGlickoForEvent(ctx.db, event.id)
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

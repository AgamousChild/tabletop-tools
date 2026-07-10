/**
 * @see docs/etl-data-pipelines.md — ETL diagram and function reference
 * @see docs/schema-turso.md — Turso database schema (meta_events, meta_event_players, meta_pairings)
 * @see packages/server-core/src/meta-ingest.ts — shared upsertMetaEvent() writer (D2-01)
 */
import type { Db } from '@tabletop-tools/db'
import { bcpScrapeJobs, metaEvents } from '@tabletop-tools/db'
import {
  generateId,
  type MetaIngestPairing,
  type MetaIngestPlayer,
  upsertMetaEvent,
} from '@tabletop-tools/server-core'
import { eq } from 'drizzle-orm'

import type { BcpEvent, BcpPairing } from './bcp-api'
import { BcpApiClient } from './bcp-api'
import { authenticateBcp } from './cognito'
import { loadFactionMap, normalizeFaction } from './faction-map'

interface ScrapeConfig {
  bcpEmail: string
  bcpPassword: string
  db: Db
  fetch?: typeof globalThis.fetch
}

function buildLocation(event: BcpEvent): string | null {
  const parts = [event.city, event.state, event.country].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : null
}

function mapResult(p1Result: number, p2Result: number): 'p1' | 'p2' | 'draw' {
  if (p1Result === 2) return 'p1'
  if (p2Result === 2) return 'p2'
  return 'draw'
}

interface PlayerAccumulator {
  name: string
  faction: string
  userId?: string
  wins: number
  losses: number
  draws: number
}

export async function runScrape(
  config: ScrapeConfig,
  triggeredBy?: string,
): Promise<{ jobId: string }> {
  const { bcpEmail, bcpPassword, db } = config
  const jobId = generateId()

  // Create job record
  await db.insert(bcpScrapeJobs).values({
    id: jobId,
    startedAt: new Date(),
    status: 'running',
    triggeredBy: triggeredBy ?? 'cron',
  })

  try {
    // Load faction lookup from DB
    await loadFactionMap(db)

    // Authenticate
    const token = await authenticateBcp({
      email: bcpEmail,
      password: bcpPassword,
      fetch: config.fetch,
    })

    const api = new BcpApiClient(token, config.fetch)

    // Search for recent events (last 7 days)
    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const events = await api.searchEvents({
      startDate: sevenDaysAgo.toISOString().slice(0, 10),
      endDate: now.toISOString().slice(0, 10),
      minPlayers: 20,
      minRounds: 5,
    })

    // Check which events are already scraped
    const existingEvents = await db
      .select({ sourceId: metaEvents.sourceId })
      .from(metaEvents)
      .where(eq(metaEvents.source, 'bcp'))
    const existingSourceIds = new Set(existingEvents.map((e) => e.sourceId))

    // Filter to new, non-team events
    const newEvents = events.filter((e) => !e.isTeamEvent && !existingSourceIds.has(e.id))

    let eventsScraped = 0
    let totalPairings = 0
    const errors: string[] = []

    for (const searchEvent of newEvents) {
      // Network phase: fetch everything from BCP before writing anything to the
      // DB, so a mid-event fetch failure leaves no row behind that would
      // permanently exclude the event via the existingSourceIds filter above.
      let event: BcpEvent
      let allPairings: BcpPairing[]
      try {
        event = await api.getEvent(searchEvent.id)

        allPairings = []
        for (let round = 1; round <= event.rounds; round++) {
          const roundPairings = await api.getPairings(event.id, round)
          allPairings.push(...roundPairings)
        }
      } catch (fetchErr) {
        errors.push(`Event ${searchEvent.id} (${searchEvent.name}): ${(fetchErr as Error).message}`)
        continue
      }

      // Insert phase: build the players/pairings shape and hand off to the
      // shared upsertMetaEvent() writer (D2-01), which owns the
      // (source, sourceId) delete-then-reinsert contract, Glicko-2, and the
      // scoped cube rebuild. A failure here is just recorded — the next
      // scrape of this event retries via upsertMetaEvent's own upsert
      // semantics rather than scrape.ts manually unwinding partial writes
      // across tables it no longer touches directly.
      try {
        // Accumulate player stats from pairings
        const playerMap = new Map<string, PlayerAccumulator>()

        for (const pairing of allPairings) {
          if (!pairing.player1Game || !pairing.player2Game) continue
          const result = mapResult(pairing.player1Game.result, pairing.player2Game.result)

          // Player 1
          if (!playerMap.has(pairing.player1.name)) {
            playerMap.set(pairing.player1.name, {
              name: pairing.player1.name,
              faction: pairing.player1.faction,
              userId: pairing.player1.userId,
              wins: 0,
              losses: 0,
              draws: 0,
            })
          }
          const p1 = playerMap.get(pairing.player1.name)!
          if (result === 'p1') p1.wins++
          else if (result === 'p2') p1.losses++
          else p1.draws++

          // Player 2
          if (!playerMap.has(pairing.player2.name)) {
            playerMap.set(pairing.player2.name, {
              name: pairing.player2.name,
              faction: pairing.player2.faction,
              userId: pairing.player2.userId,
              wins: 0,
              losses: 0,
              draws: 0,
            })
          }
          const p2 = playerMap.get(pairing.player2.name)!
          if (result === 'p2') p2.wins++
          else if (result === 'p1') p2.losses++
          else p2.draws++
        }

        // Sort players by wins (descending) for placement
        const sortedPlayers = [...playerMap.values()].sort(
          (a, b) => b.wins - a.wins || a.losses - b.losses,
        )

        // Resolve factions and filter out players whose faction can't be
        // normalized — bcp-scraper drops these rather than tagging them
        // "unknown" (unlike upsertMetaEvent's internal resolveFaction
        // fallback, which is for callers that never had a canonical slug
        // to begin with). Build the players array + a name -> array-index
        // map so pairings can reference the right entry.
        const players: MetaIngestPlayer[] = []
        const playerIndexMap = new Map<string, number>()
        for (const player of sortedPlayers) {
          const factionSlug = normalizeFaction(player.faction)
          if (!factionSlug) {
            errors.push(
              `Unknown faction "${player.faction}" for player "${player.name}" in event ${searchEvent.id}`,
            )
            continue
          }

          playerIndexMap.set(player.name, players.length)
          players.push({
            playerName: player.name,
            sourcePlayerId: player.userId ?? null,
            faction: factionSlug,
            placement: players.length + 1,
            wins: player.wins,
            losses: player.losses,
            draws: player.draws,
          })
        }

        // Build pairings (skip if either player was filtered out above)
        const pairings: MetaIngestPairing[] = []
        for (const pairing of allPairings) {
          if (!pairing.player1Game || !pairing.player2Game) continue

          const p1Index = playerIndexMap.get(pairing.player1.name)
          const p2Index = playerIndexMap.get(pairing.player2.name)
          if (p1Index === undefined || p2Index === undefined) continue

          pairings.push({
            round: pairing.round,
            player1Index: p1Index,
            player2Index: p2Index,
            player1Score: pairing.player1Game.points,
            player2Score: pairing.player2Game.points,
            result: mapResult(pairing.player1Game.result, pairing.player2Game.result),
          })
        }

        await upsertMetaEvent(db, {
          source: 'bcp',
          sourceId: event.id,
          name: event.name,
          date: new Date(event.endDate).getTime(),
          location: buildLocation(event),
          format: 'GT',
          rounds: event.rounds,
          // BCP's own registered-player count, independent of how many
          // players were actually recovered from pairing data (players.length).
          playerCount: event.playerCount,
          players,
          pairings,
        })

        totalPairings += allPairings.length
        eventsScraped++
      } catch (eventErr) {
        // No manual rollback needed: upsertMetaEvent's own (source, sourceId)
        // delete-then-reinsert makes the next scrape of this event
        // self-healing even if this attempt wrote partial rows.
        errors.push(`Event ${searchEvent.id} (${searchEvent.name}): ${(eventErr as Error).message}`)
      }
    }

    // Update job as completed
    await db
      .update(bcpScrapeJobs)
      .set({
        status: 'completed',
        completedAt: new Date(),
        eventsFound: events.length,
        eventsScraped,
        pairingsScraped: totalPairings,
        errors: errors.length > 0 ? errors.join('\n') : null,
      })
      .where(eq(bcpScrapeJobs.id, jobId))
  } catch (err) {
    // Update job as failed
    const message = err instanceof Error ? err.message : String(err)
    await db
      .update(bcpScrapeJobs)
      .set({
        status: 'failed',
        completedAt: new Date(),
        errors: message,
      })
      .where(eq(bcpScrapeJobs.id, jobId))
  }

  return { jobId }
}

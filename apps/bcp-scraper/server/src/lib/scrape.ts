/**
 * @see docs/etl-data-pipelines.md — ETL diagram and function reference
 * @see docs/schema-turso.md — Turso database schema (meta_events, meta_event_players, meta_pairings)
 */
import type { Db } from '@tabletop-tools/db'
import { bcpScrapeJobs, metaEventPlayers, metaEvents, metaPairings } from '@tabletop-tools/db'
import { generateId } from '@tabletop-tools/server-core'
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

      // Insert phase: write event, players, pairings. If anything fails partway,
      // delete whatever was already inserted for this event so it stays
      // re-scrapable on the next run instead of being permanently locked out.
      const eventId = generateId()
      try {
        // Insert event
        await db.insert(metaEvents).values({
          id: eventId,
          name: event.name,
          date: new Date(event.endDate).getTime(),
          location: buildLocation(event),
          format: 'GT',
          rounds: event.rounds,
          playerCount: event.playerCount,
          source: 'bcp',
          sourceId: event.id,
          importedAt: Date.now(),
        })

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

        // Insert players, build name->id map for pairing FKs
        const playerIdMap = new Map<string, string>()
        for (let i = 0; i < sortedPlayers.length; i++) {
          const player = sortedPlayers[i]!
          const playerId = generateId()
          playerIdMap.set(player.name, playerId)

          const factionSlug = normalizeFaction(player.faction)
          if (!factionSlug) {
            errors.push(
              `Unknown faction "${player.faction}" for player "${player.name}" in event ${searchEvent.id}`,
            )
            continue
          }

          await db.insert(metaEventPlayers).values({
            id: playerId,
            eventId,
            playerName: player.name,
            sourcePlayerId: player.userId ?? null,
            factionId: factionSlug,
            subfactionId: null,
            detachmentId: null,
            placement: i + 1,
            wins: player.wins,
            losses: player.losses,
            draws: player.draws,
          })
        }

        // Insert pairings (skip if either player wasn't inserted)
        for (const pairing of allPairings) {
          if (!pairing.player1Game || !pairing.player2Game) continue

          const p1Id = playerIdMap.get(pairing.player1.name)
          const p2Id = playerIdMap.get(pairing.player2.name)
          if (!p1Id || !p2Id) continue

          const pairingId = generateId()
          const result = mapResult(pairing.player1Game.result, pairing.player2Game.result)

          await db.insert(metaPairings).values({
            id: pairingId,
            eventId,
            round: pairing.round,
            player1Id: p1Id,
            player2Id: p2Id,
            player1Score: pairing.player1Game.points,
            player2Score: pairing.player2Game.points,
            result,
          })
        }

        totalPairings += allPairings.length
        eventsScraped++
      } catch (eventErr) {
        // Roll back any partial writes for this event so it stays re-scrapable
        // (existingSourceIds is derived from metaEvents, so a lingering row
        // here would permanently exclude the event from future runs).
        await db.delete(metaPairings).where(eq(metaPairings.eventId, eventId))
        await db.delete(metaEventPlayers).where(eq(metaEventPlayers.eventId, eventId))
        await db.delete(metaEvents).where(eq(metaEvents.id, eventId))

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

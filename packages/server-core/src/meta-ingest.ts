/**
 * Shared meta-analytics event ingestion.
 *
 * D2-01 (docs/wargame/w2/decisions/D2-01-tournament-data-unification.md,
 * Option D — Option C now): replaces three independent writers into
 * meta_events / meta_event_players / meta_pairings —
 * apps/tournament/server's exportToMeta, apps/new-meta/server's
 * admin.import, and apps/bcp-scraper's scrape.ts — with one function that
 * owns the (source, sourceId) upsert contract, the single Glicko-2 path,
 * and the analytics-cube trigger.
 *
 * Glicko-2 orchestration: tournament.ts's computeGlicko2ForEvent and
 * new-meta's admin.ts updateGlickoForEvent both already delegated the
 * rating math itself to the shared updateGlicko2() in ./glicko2.ts — they
 * were not forked at the algorithm level. The difference was in the
 * surrounding orchestration: computeGlicko2ForEvent required real
 * meta_pairings rows and early-returned without them, while
 * updateGlickoForEvent additionally synthesized games from a player's
 * win/loss/draw counts against an average opponent (rating 1500, RD 200)
 * when no pairing-level data existed — the CSV-import-without-pairings
 * case. That fallback is preserved here; it is real, currently-supported
 * behavior for new-meta's CSV path, not something to prune.
 */
import type { Db } from '@tabletop-tools/db'
import {
  authUsers,
  glickoHistory,
  metaEventPlayers,
  metaEvents,
  metaPairings,
  playerGlicko,
  resolveFaction,
} from '@tabletop-tools/db'
import { and, eq } from 'drizzle-orm'

import { updateGlicko2 } from './glicko2'
import { generateId } from './id'
import { buildCubeForEvents } from './meta-cube'

export interface MetaIngestPlayer {
  playerName: string
  sourcePlayerId?: string | null
  /** Raw faction reference (slug, BCP name, chapter name, etc.) — resolved via resolveFaction(). */
  faction: string
  subfactionId?: string | null
  detachmentId?: string | null
  placement: number
  listText?: string | null
  /** BCP list ID — stored so the list-text scraper can find rows needing army list fetch. */
  sourceListId?: string | null
  wins: number
  losses: number
  draws: number
}

export interface MetaIngestPairing {
  round: number
  /** Index into the `players` array passed to upsertMetaEvent — resolved to a real metaEventPlayers.id internally. */
  player1Index: number
  player2Index: number
  player1Score: number | null
  player2Score: number | null
  result: 'p1' | 'p2' | 'draw'
}

export interface UpsertMetaEventInput {
  source: string
  /**
   * Required, non-empty. This is the dedup contract: rows are keyed on the
   * unique index (source, sourceId). A null/empty sourceId defeats that
   * index — this is the exact bug this function exists to close (formerly
   * new-meta admin.import wrote sourceId: null on every CSV upload).
   */
  sourceId: string
  name: string
  date: number
  location?: string | null
  format: string
  rounds?: number | null
  /**
   * Total registered player count, if the source reports one independently
   * of the players array (e.g. BCP's event.playerCount, which can exceed
   * the number of players actually recovered from pairing data on a
   * partial scrape). Defaults to players.length when omitted — the
   * correct behavior for callers (CSV import, native tournament export)
   * whose players array is already the authoritative full roster.
   */
  playerCount?: number
  players: MetaIngestPlayer[]
  pairings: MetaIngestPairing[]
}

export interface UpsertMetaEventResult {
  eventId: string
}

/**
 * Upsert a tournament/event's results into the shared meta-analytics 3NF
 * tables, run Glicko-2, and refresh the analytics cube — all scoped to
 * exactly this event.
 *
 * Idempotency: keyed on (source, sourceId). Re-calling with the same pair
 * deletes the prior event row (cascading to its players/pairings/fact rows)
 * and reinserts fresh, so re-exports and re-imports replace rather than
 * duplicate. Mirrors the pattern apps/tournament/server's exportToMeta
 * already used correctly.
 */
export async function upsertMetaEvent(
  db: Db,
  input: UpsertMetaEventInput,
): Promise<UpsertMetaEventResult> {
  if (!input.sourceId || input.sourceId.trim() === '') {
    throw new Error(
      'upsertMetaEvent: sourceId is required and must be non-empty — it is the (source, sourceId) dedup key. ' +
        'A null/empty sourceId defeats the unique index and causes silent duplicate events on re-import.',
    )
  }

  // Delete-then-reinsert keyed on (source, sourceId) — mirrors
  // apps/tournament/server's existing exportToMeta pattern. Cascading FKs
  // on meta_event_players/meta_pairings (ON DELETE CASCADE) clean up
  // children; fact_game_results rows for the old event are cleared by
  // buildCubeForEvents on the subsequent rebuild.
  const existing = await db
    .select({ id: metaEvents.id })
    .from(metaEvents)
    .where(and(eq(metaEvents.source, input.source), eq(metaEvents.sourceId, input.sourceId)))
    .get()
  if (existing) {
    await db.delete(metaEvents).where(eq(metaEvents.id, existing.id))
  }

  const eventId = generateId()
  const now = Date.now()

  await db.insert(metaEvents).values({
    id: eventId,
    name: input.name,
    date: input.date,
    location: input.location ?? null,
    format: input.format,
    rounds: input.rounds ?? null,
    playerCount: input.playerCount ?? input.players.length,
    source: input.source,
    sourceId: input.sourceId,
    importedAt: now,
  })

  // Insert players, resolving faction references and building the
  // array-index -> real metaEventPlayers.id map pairings need.
  const playerIds: string[] = []
  for (const p of input.players) {
    const playerId = generateId()
    playerIds.push(playerId)

    let factionId = await resolveFaction(db, p.faction)
    if (!factionId) factionId = 'unknown'

    await db.insert(metaEventPlayers).values({
      id: playerId,
      eventId,
      playerName: p.playerName,
      sourcePlayerId: p.sourcePlayerId ?? null,
      factionId,
      subfactionId: p.subfactionId ?? null,
      detachmentId: p.detachmentId ?? null,
      placement: p.placement,
      listText: p.listText ?? null,
      sourceListId: p.sourceListId ?? null,
      wins: p.wins,
      losses: p.losses,
      draws: p.draws,
    })
  }

  for (const pair of input.pairings) {
    const p1Id = playerIds[pair.player1Index]
    const p2Id = playerIds[pair.player2Index]
    if (!p1Id || !p2Id) {
      throw new Error(
        `upsertMetaEvent: pairing references player index out of range (player1Index=${pair.player1Index}, player2Index=${pair.player2Index}, players.length=${input.players.length})`,
      )
    }

    await db.insert(metaPairings).values({
      id: generateId(),
      eventId,
      round: pair.round,
      player1Id: p1Id,
      player2Id: p2Id,
      player1Score: pair.player1Score,
      player2Score: pair.player2Score,
      result: pair.result,
    })
  }

  await runGlickoForEvent(db, eventId)
  await buildCubeForEvents(db, [eventId])

  return { eventId }
}

// ── Internal: Glicko-2 orchestration ────────────────────────────────────────

interface GlickoRow {
  id: string
  userId: string | null
  playerName: string
  rating: number
  ratingDeviation: number
  volatility: number
  gamesPlayed: number
}

/**
 * Run Glicko-2 for every player in an event. Uses real opponent data from
 * meta_pairings when available; falls back to synthesized average-opponent
 * games (rating 1500, RD 200) built from each player's win/loss/draw
 * counts when the event has no pairing-level data (CSV imports without
 * round detail).
 *
 * Exported (not just called internally by upsertMetaEvent) so callers that
 * need to recompute ratings for an *already-stored* event — e.g. new-meta's
 * admin.recomputeGlicko, which reruns every event from scratch after
 * clearing playerGlicko/glickoHistory — reuse this same implementation
 * instead of forking a second one.
 *
 * Returns the number of players actually updated (skips players with zero
 * games — see the `games.length === 0` continue below) so callers that
 * report a total (recomputeGlicko's `playersUpdated`) don't need their own
 * copy of that skip condition.
 */
export async function runGlickoForEvent(db: Db, eventId: string): Promise<number> {
  const eventPlayers = await db
    .select()
    .from(metaEventPlayers)
    .where(eq(metaEventPlayers.eventId, eventId))
    .all()

  if (eventPlayers.length === 0) return 0

  const eventPairings = await db
    .select()
    .from(metaPairings)
    .where(eq(metaPairings.eventId, eventId))
    .all()

  const allGlicko = await db.select().from(playerGlicko).all()
  const glickoByName = new Map<string, GlickoRow>()
  for (const g of allGlicko) {
    glickoByName.set(g.playerName.toLowerCase(), g as GlickoRow)
  }

  const users = await db
    .select({
      id: authUsers.id,
      username: authUsers.username,
      displayUsername: authUsers.displayUsername,
    })
    .from(authUsers)
    .all()

  const metaPlayerIdToGlickoId = new Map<string, string>()
  const metaPlayerIdToGlickoData = new Map<string, GlickoRow>()

  for (const ep of eventPlayers) {
    let glickoEntry = glickoByName.get(ep.playerName.toLowerCase())

    if (!glickoEntry) {
      let userId: string | null = null
      if (ep.sourcePlayerId) {
        const matched = users.find((u) => u.id === ep.sourcePlayerId)
        if (matched) userId = matched.id
      }

      const newEntry: GlickoRow = {
        id: generateId(),
        userId,
        playerName: ep.playerName,
        rating: 1500,
        ratingDeviation: 350,
        volatility: 0.06,
        gamesPlayed: 0,
      }
      await db.insert(playerGlicko).values({
        id: newEntry.id,
        userId: newEntry.userId,
        playerName: newEntry.playerName,
        rating: newEntry.rating,
        ratingDeviation: newEntry.ratingDeviation,
        volatility: newEntry.volatility,
        gamesPlayed: newEntry.gamesPlayed,
        lastRatingPeriod: null,
        updatedAt: Date.now(),
      })
      glickoByName.set(ep.playerName.toLowerCase(), newEntry)
      glickoEntry = newEntry
    }

    metaPlayerIdToGlickoId.set(ep.id, glickoEntry.id)
    metaPlayerIdToGlickoData.set(ep.id, glickoEntry)
  }

  const hasPairings = eventPairings.length > 0
  let updated = 0

  for (const ep of eventPlayers) {
    const glickoId = metaPlayerIdToGlickoId.get(ep.id)
    if (!glickoId) continue
    const current = metaPlayerIdToGlickoData.get(ep.id)!

    let games: Array<{ opponentRating: number; opponentRD: number; score: number }> = []

    if (hasPairings) {
      for (const pair of eventPairings) {
        let opponentId: string | null = null
        let score: number | null = null

        if (pair.player1Id === ep.id) {
          opponentId = pair.player2Id
          score = pair.result === 'p1' ? 1 : pair.result === 'p2' ? 0 : 0.5
        } else if (pair.player2Id === ep.id) {
          opponentId = pair.player1Id
          score = pair.result === 'p2' ? 1 : pair.result === 'p1' ? 0 : 0.5
        }

        if (opponentId && score !== null) {
          const oppGlicko = metaPlayerIdToGlickoData.get(opponentId)
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
      // Synthesize games from W/L/D against an average opponent — the
      // CSV-import-without-pairing-data case (admin.ts's original fallback).
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

    // Keep the in-loop cache current so a player's second pairing in the
    // same event (impossible for a real single round-robin round but not
    // impossible across multiple rounds processed together) uses the
    // updated rating rather than the stale pre-event one.
    metaPlayerIdToGlickoData.set(ep.id, {
      ...current,
      rating: result.rating,
      ratingDeviation: result.ratingDeviation,
      volatility: result.volatility,
      gamesPlayed: current.gamesPlayed + games.length,
    })

    updated++
  }

  return updated
}

/**
 * One-off backfill: BCP events Jun 1 – Jul 31 2026.
 *
 * BCP API discovery (2026-07-27):
 *   - /v2/events search: date filter params are IGNORED by the server.
 *     Results are sorted descending by eventDate. Pagination is cursor-based
 *     via nextKey/prevKey in the response.
 *   - /v2/events/:id (getEvent): requires auth → SKIPPED; search result has same fields.
 *   - /v1/events/:id/pairings: no auth needed.
 *
 * Strategy: paginate through /v2/events with nextKey cursor, filter client-side
 * to Jun 1 – Jul 31, stop when all events on a page predate Jun 1.
 *
 * Run from apps/bcp-scraper/server/:
 *   set -a && source ../../../.env && set +a
 *   NODE_OPTIONS=--dns-result-order=ipv4first \
 *     node --import tsx/esm scripts/scrape-jun-jul.ts
 */
import { createDb } from '@tabletop-tools/db'
import { bcpScrapeJobs, metaEvents } from '@tabletop-tools/db'
import {
  generateId,
  type MetaIngestPairing,
  type MetaIngestPlayer,
  upsertMetaEvent,
} from '@tabletop-tools/server-core'
import { eq, sql } from 'drizzle-orm'

import type { BcpEvent, BcpPairing } from '../src/lib/bcp-api.js'
import { loadFactionMap, normalizeFaction } from '../src/lib/faction-map.js'

const BASE_URL = 'https://newprod-api.bestcoastpairings.com'
const GAME_SYSTEM_ID = 'WGMSzfKFYA'

// Target window — client-side filter since API date params are ignored
const WINDOW_START = new Date('2026-06-01T00:00:00Z')
const WINDOW_END = new Date('2026-07-31T23:59:59Z')
const WINDOW_START_MS = WINDOW_START.getTime()
const WINDOW_END_MS = WINDOW_END.getTime()

// Minimum size filter — BCP's `numberOfRounds` + `numberOfPlayers` query params
// are silently ignored (confirmed 2026-07-27), so filter client-side. Only
// tournaments of 5+ rounds AND 20+ players count as meta-relevant data.
const MIN_ROUNDS = 5
const MIN_PLAYERS = 20

const HEADERS: Record<string, string> = {
  'client-id': 'web-app',
  env: 'bcp',
  'content-type': 'application/json',
}

interface BcpSearchRaw {
  id: string
  name: string
  dates: { start: string; end: string }
  location?: {
    city?: string
    state?: string
    country?: string
    point?: { latitude: number; longitude: number }
  }
  status: { numberOfRounds: number; started: boolean; ended: boolean }
  playerCounts: { total: number }
  format: { teamEvent: boolean }
}

/**
 * Paginate through BCP events API using cursor (nextKey).
 * The API sorts descending by eventDate; stop once we've passed the window start.
 * Filter results client-side to the target window.
 */
async function fetchEventsInWindow(): Promise<BcpEvent[]> {
  const windowEvents: BcpEvent[] = []
  let nextKey: string | null = null
  let pageNum = 0
  let totalFetched = 0

  // eslint-disable-next-line no-constant-condition
  while (true) {
    pageNum++
    const qs = new URLSearchParams({
      limit: '40',
      sortAscending: 'false',
      sortKey: 'eventDate',
      // Required by the API even though it ignores them for actual filtering
      startDate: '2026-06-01T00:00:00Z',
      endDate: '2026-07-31T23:59:59Z',
      gameSystemId: GAME_SYSTEM_ID,
      numberOfRounds: '5',
      numberOfPlayers: '20',
    })
    if (nextKey) qs.set('nextKey', nextKey)

    const resp = await fetch(`${BASE_URL}/v2/events?${qs}`, { headers: HEADERS })
    if (!resp.ok) throw new Error(`BCP search failed: ${resp.status} on page ${pageNum}`)

    const data = (await resp.json()) as {
      data: BcpSearchRaw[]
      nextKey?: string
    }

    const page = data.data ?? []
    totalFetched += page.length

    let hitPreWindow = false
    let droppedTooSmall = 0

    for (const raw of page) {
      const endMs = new Date(raw.dates.end).getTime()

      if (endMs > WINDOW_END_MS) {
        // Event is after our window (future) — skip but keep paginating (sorted desc)
        continue
      }

      if (endMs < WINDOW_START_MS) {
        // Event predates our window — since sorted desc, rest will also predate
        hitPreWindow = true
        break
      }

      // Size filter — BCP ignores numberOfRounds/numberOfPlayers query params.
      const rounds = raw.status.numberOfRounds ?? 0
      const players = raw.playerCounts?.total ?? 0
      if (rounds < MIN_ROUNDS || players < MIN_PLAYERS) {
        droppedTooSmall++
        continue
      }

      // In window + meets size floor
      windowEvents.push({
        id: raw.id,
        name: raw.name,
        startDate: raw.dates.start,
        endDate: raw.dates.end,
        city: raw.location?.city,
        state: raw.location?.state,
        country: raw.location?.country,
        latitude: raw.location?.point?.latitude,
        longitude: raw.location?.point?.longitude,
        rounds,
        playerCount: players,
        isTeamEvent: raw.format.teamEvent,
      })
    }

    const lastDate = page.length > 0 ? page[page.length - 1].dates.end : null
    console.log(
      `  page ${pageNum}: ${page.length} fetched, ${windowEvents.length} in window (dropped ${droppedTooSmall} too-small this page), last date: ${lastDate?.slice(0, 10) ?? 'n/a'}`,
    )

    if (page.length === 0 || !data.nextKey || hitPreWindow) {
      if (hitPreWindow) console.log('  Reached pre-window dates — stopping.')
      break
    }

    nextKey = data.nextKey
  }

  console.log(`Pagination done: ${totalFetched} events fetched across ${pageNum} pages`)
  return windowEvents
}

/** Fetch pairings for all rounds without auth. */
async function fetchPairings(eventId: string, rounds: number): Promise<BcpPairing[]> {
  const all: BcpPairing[] = []
  for (let round = 1; round <= rounds; round++) {
    const qs = new URLSearchParams({
      eventId,
      round: String(round),
      pairingType: 'Pairing',
    })
    const resp = await fetch(`${BASE_URL}/v1/events/${eventId}/pairings?${qs}`, {
      headers: HEADERS,
    })
    if (!resp.ok) throw new Error(`getPairings failed: ${resp.status} round ${round}`)

    const data = (await resp.json()) as {
      active: Array<{
        round: number
        table: number
        player1: {
          user: { id?: string; firstName: string; lastName: string }
          faction: string
          listId?: string | null
        }
        player2: {
          user: { id?: string; firstName: string; lastName: string }
          faction: string
          listId?: string | null
        }
        player1Game: { result: number; points: number }
        player2Game: { result: number; points: number }
      }>
    }

    for (const raw of data.active ?? []) {
      if (!raw.player1 || !raw.player2) continue // BYE
      all.push({
        round: raw.round,
        table: raw.table,
        player1: {
          name: `${raw.player1.user?.firstName ?? ''} ${raw.player1.user?.lastName ?? ''}`.trim(),
          faction: raw.player1.faction ?? '',
          listId: raw.player1.listId ?? undefined,
          userId: raw.player1.user?.id ?? undefined,
        },
        player2: {
          name: `${raw.player2.user?.firstName ?? ''} ${raw.player2.user?.lastName ?? ''}`.trim(),
          faction: raw.player2.faction ?? '',
          listId: raw.player2.listId ?? undefined,
          userId: raw.player2.user?.id ?? undefined,
        },
        player1Game: raw.player1Game
          ? { result: raw.player1Game.result, points: raw.player1Game.points }
          : null,
        player2Game: raw.player2Game
          ? { result: raw.player2Game.result, points: raw.player2Game.points }
          : null,
      })
    }
  }
  return all
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

async function main() {
  const startTime = Date.now()

  const db = createDb({
    url: process.env.TURSO_DB_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  })

  console.log('Loading faction map from DB...')
  await loadFactionMap(db)
  console.log('Faction map loaded.')

  // Before count
  const beforeRows = (await db.all(sql`
    SELECT COUNT(*) as cnt FROM meta_events
    WHERE source='bcp' AND date >= ${WINDOW_START_MS} AND date <= ${WINDOW_END_MS}
  `)) as Array<{ cnt: number }>
  console.log(`\nBEFORE: ${beforeRows[0]?.cnt ?? 0} bcp events in window`)

  console.log(
    `\nFetching BCP events for ${WINDOW_START.toISOString().slice(0, 10)} → ${WINDOW_END.toISOString().slice(0, 10)}...`,
  )
  console.log(
    '(API date params are ignored by server; filtering client-side via cursor pagination)',
  )
  const windowEvents = await fetchEventsInWindow()
  console.log(`\nEvents in date window: ${windowEvents.length}`)

  // Check what's already in DB
  const existingRows = await db
    .select({ sourceId: metaEvents.sourceId })
    .from(metaEvents)
    .where(eq(metaEvents.source, 'bcp'))
  const existingSourceIds = new Set(existingRows.map((e) => e.sourceId))

  const teamEvents = windowEvents.filter((e) => e.isTeamEvent)
  const newEvents = windowEvents.filter((e) => !e.isTeamEvent && !existingSourceIds.has(e.id))
  const alreadyInDb = windowEvents.filter((e) => !e.isTeamEvent && existingSourceIds.has(e.id))

  console.log(`  Team events skipped: ${teamEvents.length}`)
  console.log(`  Already in DB (skipped): ${alreadyInDb.length}`)
  console.log(`  New events to scrape: ${newEvents.length}`)

  if (newEvents.length === 0) {
    console.log('\nNo new events to scrape.')
    const after = (await db.all(sql`
      SELECT COUNT(*) as cnt, MIN(date) as minDate, MAX(date) as maxDate
      FROM meta_events WHERE source='bcp' AND date >= ${WINDOW_START_MS} AND date <= ${WINDOW_END_MS}
    `)) as Array<{ cnt: number; minDate: number | null; maxDate: number | null }>
    const a = after[0]
    console.log(
      `Verification: count=${a?.cnt}  min=${a?.minDate ? new Date(a.minDate).toISOString().slice(0, 10) : 'null'}  max=${a?.maxDate ? new Date(a.maxDate).toISOString().slice(0, 10) : 'null'}`,
    )
    return
  }

  const jobId = generateId()
  await db.insert(bcpScrapeJobs).values({
    id: jobId,
    startedAt: new Date(),
    status: 'running',
    triggeredBy: 'backfill-jun-jul-2026',
  })

  let eventsScraped = 0
  let totalPairings = 0
  const errors: string[] = []

  for (let i = 0; i < newEvents.length; i++) {
    const searchEvent = newEvents[i]
    console.log(`\n[${i + 1}/${newEvents.length}] ${searchEvent.name}`)
    console.log(
      `  id=${searchEvent.id}  end=${searchEvent.endDate.slice(0, 10)}  rounds=${searchEvent.rounds}  players=${searchEvent.playerCount}`,
    )

    let allPairings: BcpPairing[]
    try {
      allPairings = await fetchPairings(searchEvent.id, searchEvent.rounds)
      console.log(`  pairings fetched: ${allPairings.length}`)
    } catch (fetchErr) {
      const msg = `FETCH ${searchEvent.id} (${searchEvent.name}): ${(fetchErr as Error).message}`
      console.error(`  ${msg}`)
      errors.push(msg)
      continue
    }

    try {
      const playerMap = new Map<string, PlayerAccumulator>()

      for (const pairing of allPairings) {
        if (!pairing.player1Game || !pairing.player2Game) continue
        const result = mapResult(pairing.player1Game.result, pairing.player2Game.result)

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

      const sortedPlayers = [...playerMap.values()].sort(
        (a, b) => b.wins - a.wins || a.losses - b.losses,
      )

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
        sourceId: searchEvent.id,
        name: searchEvent.name,
        date: new Date(searchEvent.endDate).getTime(),
        location: buildLocation(searchEvent),
        format: 'GT',
        rounds: searchEvent.rounds,
        playerCount: searchEvent.playerCount,
        players,
        pairings,
      })

      totalPairings += allPairings.length
      eventsScraped++
      console.log(`  OK: ${players.length} players, ${pairings.length} scored pairings written`)
    } catch (eventErr) {
      const msg = `INSERT ${searchEvent.id} (${searchEvent.name}): ${(eventErr as Error).message}`
      console.error(`  ${msg}`)
      errors.push(msg)
    }
  }

  // Update job record
  await db
    .update(bcpScrapeJobs)
    .set({
      status: 'completed',
      completedAt: new Date(),
      eventsFound: windowEvents.length,
      eventsScraped,
      pairingsScraped: totalPairings,
      errors: errors.length > 0 ? errors.join('\n') : null,
    })
    .where(eq(bcpScrapeJobs.id, jobId))

  // Verification query
  const after = (await db.all(sql`
    SELECT COUNT(*) as cnt, MIN(date) as minDate, MAX(date) as maxDate
    FROM meta_events
    WHERE source='bcp' AND date >= ${WINDOW_START_MS} AND date <= ${WINDOW_END_MS}
  `)) as Array<{ cnt: number; minDate: number | null; maxDate: number | null }>

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  console.log('\n===== SCRAPE COMPLETE =====')
  console.log(`Duration: ${elapsed}s`)
  console.log(
    `Events in window from API: ${windowEvents.length} (team: ${teamEvents.length}, already-in-db: ${alreadyInDb.length}, new: ${newEvents.length})`,
  )
  console.log(`New events successfully scraped: ${eventsScraped}`)
  console.log(`Total pairings inserted: ${totalPairings}`)
  console.log(`Errors: ${errors.length}`)
  if (errors.length > 0) {
    console.log('\nError log:')
    for (const e of errors) console.log(`  - ${e}`)
  }
  const a = after[0]
  const minStr = a?.minDate ? new Date(a.minDate).toISOString().slice(0, 10) : 'null'
  const maxStr = a?.maxDate ? new Date(a.maxDate).toISOString().slice(0, 10) : 'null'
  console.log(`\nVerification (bcp events Jun1..Jul31 2026):`)
  console.log(
    `  BEFORE: ${beforeRows[0]?.cnt ?? 0}  AFTER: ${a?.cnt}  (delta: +${(a?.cnt ?? 0) - (beforeRows[0]?.cnt ?? 0)})`,
  )
  console.log(`  date range in DB: ${minStr} → ${maxStr}`)
  console.log(`\nJob ID: ${jobId}`)
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})

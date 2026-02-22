// ============================================================
// Aggregate — compute meta analytics from TournamentRecord[]
//
// All functions are pure: they take records and return typed
// stats. No database access here.
// ============================================================

import type { TournamentRecord, TournamentPlayer } from '@tabletop-tools/game-content'

export interface FactionStat {
  faction: string
  wins: number
  losses: number
  draws: number
  games: number
  winRate: number       // 0–1, counting draws as 0.5
  players: number       // distinct player entries
  representationPct: number  // % of all player-events
}

export interface DetachmentStat {
  detachment: string
  faction: string
  wins: number
  losses: number
  draws: number
  games: number
  winRate: number
  players: number
}

export interface MatchupCell {
  factionA: string
  factionB: string
  aWins: number
  bWins: number
  draws: number
  totalGames: number
  aWinRate: number   // from faction A's perspective
}

export interface ListResult {
  eventName: string
  eventDate: string
  placement: number
  faction: string
  detachment?: string
  listText?: string
  wins: number
  losses: number
  draws: number
  points: number
}

export interface WeeklyPoint {
  week: string      // ISO week start date e.g. "2025-06-09"
  faction: string
  wins: number
  losses: number
  draws: number
  games: number
  winRate: number
}

// ---- Faction stats ----

export function computeFactionStats(records: TournamentRecord[]): FactionStat[] {
  const map = new Map<string, { wins: number; losses: number; draws: number; players: number }>()
  let totalPlayerEvents = 0

  for (const record of records) {
    for (const player of record.players) {
      const faction = player.faction.trim()
      if (!faction) continue

      totalPlayerEvents++
      const entry = map.get(faction) ?? { wins: 0, losses: 0, draws: 0, players: 0 }
      entry.wins += player.wins
      entry.losses += player.losses
      entry.draws += player.draws
      entry.players++
      map.set(faction, entry)
    }
  }

  const results: FactionStat[] = []
  for (const [faction, data] of map) {
    const games = data.wins + data.losses + data.draws
    const winRate = games > 0 ? (data.wins + data.draws * 0.5) / games : 0
    results.push({
      faction,
      wins: data.wins,
      losses: data.losses,
      draws: data.draws,
      games,
      winRate,
      players: data.players,
      representationPct: totalPlayerEvents > 0 ? data.players / totalPlayerEvents : 0,
    })
  }

  return results.sort((a, b) => b.winRate - a.winRate)
}

// ---- Detachment stats ----

export function computeDetachmentStats(records: TournamentRecord[]): DetachmentStat[] {
  const map = new Map<string, { faction: string; wins: number; losses: number; draws: number; players: number }>()

  for (const record of records) {
    for (const player of record.players) {
      const detachment = player.detachment?.trim()
      if (!detachment) continue

      const faction = player.faction.trim()
      const key = `${faction}::${detachment}`
      const entry = map.get(key) ?? { faction, wins: 0, losses: 0, draws: 0, players: 0 }
      entry.wins += player.wins
      entry.losses += player.losses
      entry.draws += player.draws
      entry.players++
      map.set(key, entry)
    }
  }

  const results: DetachmentStat[] = []
  for (const [key, data] of map) {
    const detachment = key.slice(key.indexOf('::') + 2)
    const games = data.wins + data.losses + data.draws
    const winRate = games > 0 ? (data.wins + data.draws * 0.5) / games : 0
    results.push({
      detachment,
      faction: data.faction,
      wins: data.wins,
      losses: data.losses,
      draws: data.draws,
      games,
      winRate,
      players: data.players,
    })
  }

  return results.sort((a, b) => b.winRate - a.winRate)
}

// ---- Matchup matrix ----
//
// To build matchup data we need pairing information: who played whom.
// TournamentRecord doesn't include pairing data (only standings).
// The matchup matrix is derived from players' win/loss counts
// cross-referenced within the same event (best-effort).
//
// A simpler model: for events with 2-player results, compute
// faction-vs-faction wins by pairing players from same event.
// For now: we compute mirror matches and skip them.

export function computeMatchups(records: TournamentRecord[]): MatchupCell[] {
  // Build faction pairs from same-event round results
  // Since we don't have individual pairing data in TournamentRecord,
  // we approximate from the players' raw results.
  // This is a best-effort approximation: we pair top players vs bottom players.
  // Proper matchup matrix requires pairing data (future work).
  //
  // For now return empty array — callers that need real matchup data
  // should use native tournament data (pairings table).
  return buildMatchupCells(records)
}

/**
 * Build a matchup matrix from event data.
 * Pairs player results within each round group by standing order.
 * This is a statistical approximation — for exact data, use pairings table.
 */
function buildMatchupCells(records: TournamentRecord[]): MatchupCell[] {
  const pairMap = new Map<string, { aWins: number; bWins: number; draws: number }>()

  for (const record of records) {
    const players = [...record.players].sort((a, b) => a.placement - b.placement)
    const n = players.length
    // Pair player[i] with player[n-1-i] (top vs bottom approximation)
    for (let i = 0; i < Math.floor(n / 2); i++) {
      const p1 = players[i]!
      const p2 = players[n - 1 - i]!
      if (p1.faction === p2.faction) continue  // skip mirror matches

      const [a, b] = sortFactionPair(p1.faction, p2.faction)
      const key = `${a}::${b}`
      const entry = pairMap.get(key) ?? { aWins: 0, bWins: 0, draws: 0 }

      // Higher placed player wins; if same placement, draw
      if (p1.faction === a) {
        // p1 placed higher (lower placement number = better)
        entry.aWins++
      } else {
        entry.bWins++
      }
      pairMap.set(key, entry)
    }
  }

  const cells: MatchupCell[] = []
  for (const [key, data] of pairMap) {
    const [factionA, factionB] = key.split('::') as [string, string]
    const total = data.aWins + data.bWins + data.draws
    cells.push({
      factionA,
      factionB,
      aWins: data.aWins,
      bWins: data.bWins,
      draws: data.draws,
      totalGames: total,
      aWinRate: total > 0 ? (data.aWins + data.draws * 0.5) / total : 0.5,
    })
  }

  return cells
}

function sortFactionPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

// ---- Top lists ----

export function getTopLists(records: TournamentRecord[], opts: {
  faction?: string
  detachment?: string
  limit?: number
} = {}): ListResult[] {
  const results: ListResult[] = []

  for (const record of records) {
    for (const player of record.players) {
      if (opts.faction && player.faction !== opts.faction) continue
      if (opts.detachment && player.detachment !== opts.detachment) continue

      results.push({
        eventName: record.eventName,
        eventDate: record.eventDate,
        placement: player.placement,
        faction: player.faction,
        detachment: player.detachment,
        listText: player.listText,
        wins: player.wins,
        losses: player.losses,
        draws: player.draws,
        points: player.points,
      })
    }
  }

  // Sort by placement ascending (1st place first), then wins desc
  results.sort((a, b) => {
    if (a.placement !== b.placement) return a.placement - b.placement
    return b.wins - a.wins
  })

  return opts.limit ? results.slice(0, opts.limit) : results
}

// ---- Win rate timeline ----

/**
 * Groups results into weekly buckets (by event date) and computes
 * win rates per faction per week.
 */
export function computeTimeline(records: TournamentRecord[], faction?: string): WeeklyPoint[] {
  const weekMap = new Map<string, Map<string, { wins: number; losses: number; draws: number }>>()

  for (const record of records) {
    const week = getWeekStart(record.eventDate)

    for (const player of record.players) {
      if (faction && player.faction !== faction) continue
      const f = player.faction.trim()
      if (!f) continue

      if (!weekMap.has(week)) weekMap.set(week, new Map())
      const factionMap = weekMap.get(week)!
      const entry = factionMap.get(f) ?? { wins: 0, losses: 0, draws: 0 }
      entry.wins += player.wins
      entry.losses += player.losses
      entry.draws += player.draws
      factionMap.set(f, entry)
    }
  }

  const points: WeeklyPoint[] = []
  for (const [week, factionMap] of weekMap) {
    for (const [f, data] of factionMap) {
      const games = data.wins + data.losses + data.draws
      points.push({
        week,
        faction: f,
        wins: data.wins,
        losses: data.losses,
        draws: data.draws,
        games,
        winRate: games > 0 ? (data.wins + data.draws * 0.5) / games : 0,
      })
    }
  }

  return points.sort((a, b) => a.week.localeCompare(b.week))
}

/** Return the Monday (week start) for an ISO date string. */
function getWeekStart(isoDate: string): string {
  const d = new Date(isoDate)
  if (isNaN(d.getTime())) return isoDate  // fallback: return as-is
  const day = d.getUTCDay()
  const diff = (day + 6) % 7  // Monday = 0
  d.setUTCDate(d.getUTCDate() - diff)
  return d.toISOString().slice(0, 10)
}

// ---- Helpers exported for tests ----

export { getWeekStart }

/** Flatten all players from all records, optionally filtering by faction/detachment */
export function flattenPlayers(records: TournamentRecord[], opts: {
  faction?: string
  detachment?: string
} = {}): Array<TournamentPlayer & { eventName: string; eventDate: string }> {
  const result = []
  for (const record of records) {
    for (const player of record.players) {
      if (opts.faction && player.faction !== opts.faction) continue
      if (opts.detachment && player.detachment !== opts.detachment) continue
      result.push({ ...player, eventName: record.eventName, eventDate: record.eventDate })
    }
  }
  return result
}

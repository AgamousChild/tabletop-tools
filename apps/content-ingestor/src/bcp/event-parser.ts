import type { BCPEvent } from './event-list'
import type { BCPStanding } from './standings'

// Defined locally to avoid importing from game-content (which pulls in Node fs deps).
// Must remain structurally compatible with game-content's TournamentRecord.
export interface TournamentRecord {
  eventName: string
  eventDate: string // ISO date: YYYY-MM-DD
  format: string    // "GT", "RTT", "Major", "Super Major", "Local"
  players: Array<{
    name: string
    placement: number
    faction: string
    detachment?: string
    listText?: string
    wins: number
    losses: number
    draws: number
    points: number
  }>
}

/**
 * Derive a human-readable format label from player count.
 * Thresholds are BCP community convention for Warhammer 40K events.
 */
export function deriveFormat(playerCount: number): string {
  if (playerCount >= 400) return 'Super Major'
  if (playerCount >= 200) return 'Major'
  if (playerCount >= 100) return 'GT'
  if (playerCount >= 30) return 'RTT'
  return 'Local'
}

/**
 * Normalise a date string to ISO YYYY-MM-DD format.
 *
 * Handles:
 *   - "2025-05-04"         → "2025-05-04"   (passthrough)
 *   - "May 4, 2025"        → "2025-05-04"
 *   - "May 4"              → best-effort with current year
 *   - Any other parseable  → toISOString().split('T')[0]
 *   - Unparseable          → return as-is
 */
export function normalizeDate(dateStr: string): string {
  // Fast path: already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr

  // "Month Day" without year — append current year so Date can parse it
  const shortMonth = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d+$/i.test(dateStr)
  const withYear = shortMonth ? `${dateStr}, ${new Date().getFullYear()}` : dateStr

  const parsed = new Date(withYear)
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0]!
  }

  return dateStr
}

/**
 * Map an ISO date string to a calendar quarter string (e.g. "2025-Q2").
 */
export function deriveMetaWindow(eventDate: string): string {
  // Use UTC accessors — ISO date strings parse as midnight UTC.
  // Local-time accessors would shift the date on machines behind UTC.
  const d = new Date(eventDate)
  const year = d.getUTCFullYear()
  const quarter = Math.ceil((d.getUTCMonth() + 1) / 3)
  return `${year}-Q${quarter}`
}

/**
 * Transform a scraped BCP event + standings into a TournamentRecord.
 *
 * @param event      - Event metadata from scrapeEventList
 * @param standings  - Player standings from scrapeStandings
 * @param armyLists  - Optional map of playerName → listText from scrapeArmyList calls
 */
export function toTournamentRecord(
  event: BCPEvent,
  standings: BCPStanding[],
  armyLists?: Map<string, string>,
): TournamentRecord {
  return {
    eventName: event.name,
    eventDate: normalizeDate(event.date),
    format: deriveFormat(event.playerCount),
    players: standings.map(s => ({
      name: s.playerName,
      placement: s.placement,
      faction: s.faction,
      wins: s.wins,
      losses: s.losses,
      draws: s.draws,
      points: s.points,
      listText: armyLists?.get(s.playerName),
    })),
  }
}

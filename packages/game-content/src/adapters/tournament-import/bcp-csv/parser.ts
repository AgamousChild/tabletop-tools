import type { TournamentRecord, TournamentPlayer } from '../../../types.js'

// ============================================================
// BCP CSV parser
//
// BCP (Best Coast Pairings) exports results as a CSV with this
// rough shape (columns may vary by event type):
//
//   Place,Player Name,Faction,W,L,D,Total Points,List
//
// The operator exports this themselves from BCP and imports it.
// This code never makes any network requests.
// ============================================================

export interface BcpCsvOptions {
  /** Name of the event (not present in the CSV itself) */
  eventName: string
  /** ISO date string e.g. "2025-06-14" */
  eventDate: string
  /** Format label e.g. "GT" */
  format?: string
}

/**
 * Parse a BCP results CSV export into a TournamentRecord.
 *
 * Expected CSV headers (case-insensitive, flexible column order):
 *   place | placement | rank
 *   name | player | player name
 *   faction | army | faction/army
 *   w | wins
 *   l | losses
 *   d | draws
 *   points | total points | vp | total vp
 *   list | army list (optional)
 */
export function parseBcpCsv(csv: string, options: BcpCsvOptions): TournamentRecord {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  if (lines.length < 2) {
    return {
      eventName: options.eventName,
      eventDate: options.eventDate,
      format: options.format ?? 'GT',
      players: [],
    }
  }

  const headers = parseRow(lines[0]!).map((h) => h.toLowerCase().trim())
  const col = buildColumnMap(headers)

  const players: TournamentPlayer[] = []

  for (let i = 1; i < lines.length; i++) {
    const cells = parseRow(lines[i]!)
    const player = parsePlayerRow(cells, col)
    if (player) players.push(player)
  }

  return {
    eventName: options.eventName,
    eventDate: options.eventDate,
    format: options.format ?? 'GT',
    players,
  }
}

// ---- Helpers ----

interface ColumnMap {
  placement: number
  faction: number
  wins: number
  losses: number
  draws: number
  points: number
  listText: number
}

const HEADER_ALIASES: Record<keyof ColumnMap, string[]> = {
  placement: ['place', 'placement', 'rank', 'finish'],
  faction:   ['faction', 'army', 'faction/army', 'detachment'],
  wins:      ['w', 'wins', 'win'],
  losses:    ['l', 'losses', 'loss'],
  draws:     ['d', 'draws', 'draw'],
  points:    ['points', 'total points', 'vp', 'total vp', 'tournament points'],
  listText:  ['list', 'army list', 'list text', 'roster'],
}

function buildColumnMap(headers: string[]): ColumnMap {
  function findCol(aliases: string[]): number {
    for (const alias of aliases) {
      const idx = headers.indexOf(alias)
      if (idx >= 0) return idx
    }
    return -1
  }

  return {
    placement: findCol(HEADER_ALIASES.placement),
    faction:   findCol(HEADER_ALIASES.faction),
    wins:      findCol(HEADER_ALIASES.wins),
    losses:    findCol(HEADER_ALIASES.losses),
    draws:     findCol(HEADER_ALIASES.draws),
    points:    findCol(HEADER_ALIASES.points),
    listText:  findCol(HEADER_ALIASES.listText),
  }
}

function parsePlayerRow(cells: string[], col: ColumnMap): TournamentPlayer | null {
  const placementStr = col.placement >= 0 ? (cells[col.placement] ?? '') : ''
  const placement = parseInt(placementStr, 10)
  if (isNaN(placement)) return null

  return {
    placement,
    faction:  col.faction  >= 0 ? (cells[col.faction]  ?? '').trim() : '',
    wins:     col.wins     >= 0 ? parseInt(cells[col.wins]     ?? '0', 10) : 0,
    losses:   col.losses   >= 0 ? parseInt(cells[col.losses]   ?? '0', 10) : 0,
    draws:    col.draws    >= 0 ? parseInt(cells[col.draws]    ?? '0', 10) : 0,
    points:   col.points   >= 0 ? parseInt(cells[col.points]   ?? '0', 10) : 0,
    listText: col.listText >= 0 ? (cells[col.listText] ?? '').trim() || undefined : undefined,
  }
}

/** Parse a single CSV row, handling quoted fields. */
function parseRow(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  cells.push(current)
  return cells
}

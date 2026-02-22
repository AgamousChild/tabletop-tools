import type { TournamentRecord, TournamentPlayer } from '../../../types.js'

// ============================================================
// Tabletop Admiral CSV parser
//
// Tabletop Admiral exports results in a format roughly like:
//
//   Rank,Player,Faction,CP,Win,Loss,Draw,List
//
// Note: TA calls victory points "CP" (Championship Points) and
// uses "Win"/"Loss"/"Draw" as integer counts. The operator
// exports this themselves from TA. No network requests here.
// ============================================================

export interface TabletopAdmiralCsvOptions {
  eventName: string
  eventDate: string
  format?: string
}

/**
 * Parse a Tabletop Admiral results CSV export into a TournamentRecord.
 *
 * Supported headers (case-insensitive):
 *   rank | place | placement
 *   faction | army | detachment
 *   cp | championship points | vp | points | total
 *   win | wins | w
 *   loss | losses | l
 *   draw | draws | d
 *   list | army list | roster
 */
export function parseTabletopAdmiralCsv(
  csv: string,
  options: TabletopAdmiralCsvOptions,
): TournamentRecord {
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
  playerName: number
  faction: number
  detachment: number
  points: number
  wins: number
  losses: number
  draws: number
  listText: number
}

const HEADER_ALIASES: Record<keyof ColumnMap, string[]> = {
  placement:  ['rank', 'place', 'placement', 'finish', 'position'],
  playerName: ['player', 'name', 'player name', 'player_name'],
  faction:    ['faction', 'army', 'faction/army'],
  detachment: ['detachment', 'sub_faction', 'sub faction', 'subfaction'],
  points:     ['cp', 'championship points', 'vp', 'points', 'total', 'tournament points'],
  wins:       ['win', 'wins', 'w'],
  losses:     ['loss', 'losses', 'l'],
  draws:      ['draw', 'draws', 'd'],
  listText:   ['list', 'army list', 'roster', 'list text'],
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
    placement:  findCol(HEADER_ALIASES.placement),
    playerName: findCol(HEADER_ALIASES.playerName),
    faction:    findCol(HEADER_ALIASES.faction),
    detachment: findCol(HEADER_ALIASES.detachment),
    points:     findCol(HEADER_ALIASES.points),
    wins:       findCol(HEADER_ALIASES.wins),
    losses:     findCol(HEADER_ALIASES.losses),
    draws:      findCol(HEADER_ALIASES.draws),
    listText:   findCol(HEADER_ALIASES.listText),
  }
}

function parsePlayerRow(cells: string[], col: ColumnMap): TournamentPlayer | null {
  const placementStr = col.placement >= 0 ? (cells[col.placement] ?? '') : ''
  const placement = parseInt(placementStr, 10)
  if (isNaN(placement)) return null

  return {
    placement,
    playerName: col.playerName >= 0 ? (cells[col.playerName] ?? '').trim() || undefined : undefined,
    faction:    col.faction    >= 0 ? (cells[col.faction]    ?? '').trim() : '',
    detachment: col.detachment >= 0 ? (cells[col.detachment] ?? '').trim() || undefined : undefined,
    points:     col.points     >= 0 ? parseInt(cells[col.points]   ?? '0', 10) : 0,
    wins:       col.wins       >= 0 ? parseInt(cells[col.wins]     ?? '0', 10) : 0,
    losses:     col.losses     >= 0 ? parseInt(cells[col.losses]   ?? '0', 10) : 0,
    draws:      col.draws      >= 0 ? parseInt(cells[col.draws]    ?? '0', 10) : 0,
    listText:   col.listText   >= 0 ? (cells[col.listText] ?? '').trim() || undefined : undefined,
  }
}

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

import type { TournamentRecord, TournamentPlayer, UnitResult } from '../../../types.js'

// ============================================================
// Generic CSV parser — platform's own documented format
//
// This is the format the platform defines itself. Operators who
// want to import data not covered by BCP or TA exports can use
// this format.
//
// Required columns:
//   event_name, event_date, format, placement, faction, wins, losses, draws, points
//
// Optional columns:
//   list_text, unit_name, unit_games_played, unit_avg_points
//
// For per-unit data, include one row per unit per player. The
// placement + faction combination identifies the player.
// ============================================================

/**
 * Parse the platform's generic CSV format into TournamentRecord[].
 *
 * One CSV can contain multiple events (different event_name + event_date combos).
 * Returns one TournamentRecord per unique (event_name, event_date) pair.
 */
export function parseGenericCsv(csv: string): TournamentRecord[] {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  if (lines.length < 2) return []

  const headers = parseRow(lines[0]!).map((h) => h.toLowerCase().trim())
  const col = buildColumnMap(headers)

  // Group rows by event
  const eventMap = new Map<string, Map<string, TournamentPlayer>>()
  const eventMeta = new Map<string, { eventName: string; eventDate: string; format: string }>()

  for (let i = 1; i < lines.length; i++) {
    const cells = parseRow(lines[i]!)

    const eventName = col.eventName >= 0 ? (cells[col.eventName] ?? '').trim() : ''
    const eventDate = col.eventDate >= 0 ? (cells[col.eventDate] ?? '').trim() : ''
    const format    = col.format    >= 0 ? (cells[col.format]    ?? '').trim() : 'GT'

    if (!eventName || !eventDate) continue

    const eventKey = `${eventName}::${eventDate}`

    if (!eventMeta.has(eventKey)) {
      eventMeta.set(eventKey, { eventName, eventDate, format })
      eventMap.set(eventKey, new Map())
    }

    const placementStr = col.placement >= 0 ? (cells[col.placement] ?? '') : ''
    const placement = parseInt(placementStr, 10)
    if (isNaN(placement)) continue

    const faction = col.faction >= 0 ? (cells[col.faction] ?? '').trim() : ''
    const playerKey = `${placement}::${faction}`
    const players = eventMap.get(eventKey)!

    let player = players.get(playerKey)
    if (!player) {
      player = {
        placement,
        playerName: col.playerName >= 0 ? (cells[col.playerName] ?? '').trim() || undefined : undefined,
        faction,
        detachment: col.detachment >= 0 ? (cells[col.detachment] ?? '').trim() || undefined : undefined,
        wins:       col.wins       >= 0 ? parseInt(cells[col.wins]     ?? '0', 10) : 0,
        losses:     col.losses     >= 0 ? parseInt(cells[col.losses]   ?? '0', 10) : 0,
        draws:      col.draws      >= 0 ? parseInt(cells[col.draws]    ?? '0', 10) : 0,
        points:     col.points     >= 0 ? parseInt(cells[col.points]   ?? '0', 10) : 0,
        listText:   col.listText   >= 0 ? (cells[col.listText] ?? '').trim() || undefined : undefined,
        unitResults: [],
      }
      players.set(playerKey, player)
    }

    // Per-unit row
    if (col.unitName >= 0) {
      const unitName = (cells[col.unitName] ?? '').trim()
      if (unitName) {
        const unitResult: UnitResult = {
          unitName,
          contentId: col.contentId >= 0 ? (cells[col.contentId] ?? '').trim() || undefined : undefined,
          gamesPlayed: col.unitGamesPlayed >= 0 ? parseInt(cells[col.unitGamesPlayed] ?? '0', 10) : 0,
          averagePoints: col.unitAvgPoints >= 0 ? parseFloat(cells[col.unitAvgPoints] ?? '0') : 0,
        }
        player.unitResults ??= []
        player.unitResults.push(unitResult)
      }
    }
  }

  const records: TournamentRecord[] = []
  for (const [eventKey, meta] of eventMeta) {
    const playerMap = eventMap.get(eventKey)!
    const players = [...playerMap.values()]
    // Clean up empty unitResults arrays
    for (const p of players) {
      if (p.unitResults?.length === 0) {
        p.unitResults = undefined
      }
    }
    records.push({
      eventName: meta.eventName,
      eventDate: meta.eventDate,
      format: meta.format,
      players,
    })
  }

  return records
}

// ---- Helpers ----

interface ColumnMap {
  eventName: number
  eventDate: number
  format: number
  placement: number
  playerName: number
  faction: number
  detachment: number
  wins: number
  losses: number
  draws: number
  points: number
  listText: number
  unitName: number
  contentId: number
  unitGamesPlayed: number
  unitAvgPoints: number
}

const HEADER_ALIASES: Record<keyof ColumnMap, string[]> = {
  eventName:       ['event_name', 'event name', 'event'],
  eventDate:       ['event_date', 'event date', 'date'],
  format:          ['format', 'event_format', 'event format'],
  placement:       ['placement', 'place', 'rank', 'finish'],
  playerName:      ['player_name', 'player name', 'player', 'name'],
  faction:         ['faction', 'army'],
  detachment:      ['detachment', 'sub_faction', 'sub faction', 'subfaction'],
  wins:            ['wins', 'w', 'win'],
  losses:          ['losses', 'l', 'loss'],
  draws:           ['draws', 'd', 'draw'],
  points:          ['points', 'vp', 'total_points', 'total points'],
  listText:        ['list_text', 'list text', 'list', 'army list'],
  unitName:        ['unit_name', 'unit name', 'unit'],
  contentId:       ['content_id', 'content id', 'bsdata_id'],
  unitGamesPlayed: ['unit_games_played', 'games_played', 'games played'],
  unitAvgPoints:   ['unit_avg_points', 'avg_points', 'avg points', 'average points'],
}

function buildColumnMap(headers: string[]): ColumnMap {
  function findCol(aliases: string[]): number {
    for (const alias of aliases) {
      const idx = headers.indexOf(alias)
      if (idx >= 0) return idx
    }
    return -1
  }

  const result = {} as ColumnMap
  for (const key of Object.keys(HEADER_ALIASES) as (keyof ColumnMap)[]) {
    result[key] = findCol(HEADER_ALIASES[key])
  }
  return result
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

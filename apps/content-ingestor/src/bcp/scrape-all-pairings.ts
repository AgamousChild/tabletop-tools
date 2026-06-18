/**
 * Scrape all pairings from all BCP events using Playwright MCP.
 * Must be run with an authenticated BCP session in the Playwright browser.
 *
 * Usage: This is meant to be run via the MCP Playwright browser_run_code tool,
 * NOT as a standalone script (which would launch a fresh unauthenticated browser).
 *
 * For standalone use, save the full scrape logic as a Playwright script
 * and run it in the same browser context where BCP is logged in.
 */

import type { BCPEvent } from './event-list'
import { deriveFormat, normalizeDate } from './event-parser'

export interface PairingResult {
  round: number
  table: number
  p1: { name: string; faction: string; result: 'win' | 'loss' | 'draw'; score: number; listUrl: string | null }
  p2: { name: string; faction: string; result: 'win' | 'loss' | 'draw'; score: number; listUrl: string | null }
}

export interface FullEventData {
  event: BCPEvent
  pairings: PairingResult[]
  playerRecords: Record<string, { wins: number; losses: number; draws: number; faction: string; listUrl: string | null }>
}

/**
 * Calculate W/L/D records from pairings
 */
export function calculatePlayerRecords(pairings: PairingResult[]): Record<string, { wins: number; losses: number; draws: number; faction: string; listUrl: string | null }> {
  const records: Record<string, { wins: number; losses: number; draws: number; faction: string; listUrl: string | null }> = {}

  for (const p of pairings) {
    for (const player of [p.p1, p.p2]) {
      if (!player.name || player.name === 'BYE' || player.name.includes('---')) continue
      if (!records[player.name]) {
        records[player.name] = { wins: 0, losses: 0, draws: 0, faction: player.faction, listUrl: player.listUrl }
      }
      if (player.result === 'win') records[player.name]!.wins++
      else if (player.result === 'loss') records[player.name]!.losses++
      else records[player.name]!.draws++
      // Update faction and list URL (latest round's data)
      records[player.name]!.faction = player.faction
      if (player.listUrl) records[player.name]!.listUrl = player.listUrl
    }
  }

  return records
}

/**
 * Convert full event data to TournamentRecord format for DB import
 */
export function toImportRecord(data: FullEventData) {
  const players = Object.entries(data.playerRecords)
    .map(([name, r], idx) => ({
      name,
      placement: idx + 1, // approximate — sorted by wins
      faction: r.faction,
      wins: r.wins,
      losses: r.losses,
      draws: r.draws,
      points: 0,
      listUrl: r.listUrl,
    }))
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses)
    .map((p, idx) => ({ ...p, placement: idx + 1 }))

  return {
    eventName: data.event.name,
    eventDate: normalizeDate(data.event.date),
    format: deriveFormat(players.length),
    players,
  }
}

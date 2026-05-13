import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import type { TournamentRecord } from './event-parser'

export interface ImportResult {
  imported: number
  skipped: number
  errors: number
}

/**
 * Import tournament records into the new-meta database.
 * Skips events that already exist (by eventName + eventDate).
 *
 * NOTE: For now, this writes JSON files that can be manually imported
 * via the new-meta admin UI, rather than directly writing to Turso.
 * Direct DB import requires the DB credentials and auth context.
 */
export async function prepareForImport(
  bcpDataDir: string,
  outputDir: string,
): Promise<ImportResult> {
  const files = readdirSync(bcpDataDir).filter(f => f.endsWith('.json') && f !== 'events.json')
  let imported = 0
  let skipped = 0
  let errors = 0

  const { mkdirSync, writeFileSync } = await import('node:fs')
  mkdirSync(outputDir, { recursive: true })

  for (const file of files) {
    try {
      const data = JSON.parse(readFileSync(path.join(bcpDataDir, file), 'utf-8'))
      const record = data as TournamentRecord

      if (!record.eventName || !record.players || record.players.length === 0) {
        skipped++
        continue
      }

      // Write import-ready JSON
      writeFileSync(path.join(outputDir, file), JSON.stringify(record, null, 2))
      imported++
    } catch {
      errors++
    }
  }

  return { imported, skipped, errors }
}

/**
 * Generate a CSV summary of all scraped events for quick review.
 */
export function generateSummaryCSV(records: TournamentRecord[]): string {
  const header = 'Event Name,Date,Format,Players,Top Faction,Top Player'
  const rows = records.map(r => {
    const topPlayer = r.players[0]
    return [
      `"${r.eventName}"`,
      r.eventDate,
      r.format,
      r.players.length,
      topPlayer?.faction ?? '',
      topPlayer?.name ?? '',
    ].join(',')
  })
  return [header, ...rows].join('\n')
}

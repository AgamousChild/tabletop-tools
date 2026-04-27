import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@libsql/client'
import type { TournamentRecord } from './event-parser'

function generateId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 21; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

function deriveMetaWindow(eventDate: string): string {
  const d = new Date(eventDate)
  const year = d.getUTCFullYear()
  const quarter = Math.ceil((d.getUTCMonth() + 1) / 3)
  return `${year}-Q${quarter}`
}

async function main() {
  const dbUrl = process.env.TURSO_DB_URL
  const authToken = process.env.TURSO_AUTH_TOKEN
  const importedBy = process.env.ADMIN_USER_ID || 'bcp-scraper'

  if (!dbUrl || !authToken) {
    console.error('Set TURSO_DB_URL and TURSO_AUTH_TOKEN environment variables')
    process.exit(1)
  }

  const client = createClient({ url: dbUrl, authToken })

  const importDir = '.local/ingest/bcp-import'
  const files = readdirSync(importDir).filter(f => f.endsWith('.json'))

  console.log(`Importing ${files.length} events into Turso...`)

  let imported = 0
  let skipped = 0

  for (const file of files) {
    const record = JSON.parse(readFileSync(path.join(importDir, file), 'utf-8')) as TournamentRecord

    // Check if already imported — if so, UPDATE with new data (W/L/D from pairings)
    const existing = await client.execute({
      sql: 'SELECT id FROM imported_tournament_results WHERE event_name = ?',
      args: [record.eventName],
    })

    if (existing.rows.length > 0) {
      const existingId = existing.rows[0]!.id as string
      await client.execute({
        sql: 'UPDATE imported_tournament_results SET parsed_data = ?, raw_data = ?, imported_at = ? WHERE id = ?',
        args: [JSON.stringify(record), JSON.stringify(record), Date.now(), existingId],
      })
      console.log(`  ↻ ${record.eventName} — updated with W/L/D data (${record.players.length} players)`)
      imported++
      continue
    }

    const id = generateId()
    const now = Date.now()
    const parsedDate = new Date(record.eventDate).getTime()
    const eventDate = isNaN(parsedDate) ? now : parsedDate
    const metaWindow = deriveMetaWindow(record.eventDate)

    await client.execute({
      sql: `INSERT INTO imported_tournament_results (id, imported_by, event_name, event_date, format, meta_window, raw_data, parsed_data, imported_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        importedBy,
        record.eventName,
        eventDate,
        record.format,
        metaWindow,
        JSON.stringify(record),
        JSON.stringify(record),
        now,
      ],
    })

    imported++
    console.log(`  ✓ ${record.eventName} — ${record.players.length} players (${record.format})`)
  }

  console.log(`\nDone. ${imported} imported, ${skipped} skipped.`)
  client.close()
}

main().catch(console.error)

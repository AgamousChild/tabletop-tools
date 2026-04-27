import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@libsql/client'

const BCP_DIR = '.local/ingest/bcp'

function generateId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 21; i++) result += chars.charAt(Math.floor(Math.random() * chars.length))
  return result
}

function deriveMetaWindow(dateStr: string): string {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '2024-Q3'
  const year = d.getUTCFullYear()
  const quarter = Math.ceil((d.getUTCMonth() + 1) / 3)
  return `${year}-Q${quarter}`
}

function deriveFormat(playerCount: number): string {
  if (playerCount >= 400) return 'Super Major'
  if (playerCount >= 200) return 'Major'
  if (playerCount >= 100) return 'GT'
  return 'RTT'
}

async function main() {
  const dbUrl = process.env.TURSO_DB_URL
  const authToken = process.env.TURSO_AUTH_TOKEN
  const importedBy = process.env.ADMIN_USER_ID || '8bCA9NBIcOEr7EssqDbXjR7RaHafmJWJ'

  if (!dbUrl || !authToken) {
    console.error('Set TURSO_DB_URL and TURSO_AUTH_TOKEN')
    process.exit(1)
  }

  const client = createClient({ url: dbUrl, authToken })

  // Delete all existing imports to re-import fresh
  await client.execute('DELETE FROM imported_tournament_results')
  console.log('Cleared existing imports\n')

  const files = readdirSync(BCP_DIR).filter(f => f.startsWith('pairings-') && f.endsWith('.json'))
  console.log(`Importing ${files.length} events from pairings data...\n`)

  let imported = 0

  for (const file of files) {
    const data = JSON.parse(readFileSync(path.join(BCP_DIR, file), 'utf-8'))
    const event = data.event
    const records = data.records as Record<string, { wins: number; losses: number; draws: number; faction: string; listUrl: string | null }>

    if (!records || Object.keys(records).length === 0) continue

    // Build TournamentRecord format
    const players = Object.entries(records)
      .map(([name, r]) => ({
        name,
        placement: 0,
        faction: r.faction,
        wins: r.wins,
        losses: r.losses,
        draws: r.draws,
        points: 0,
        listText: r.listUrl || undefined,
      }))
      .sort((a, b) => b.wins - a.wins || a.losses - b.losses)
      .map((p, idx) => ({ ...p, placement: idx + 1 }))

    const tournamentRecord = {
      eventName: event.name,
      eventDate: event.date || '2024-06-01',
      format: deriveFormat(players.length),
      players,
    }

    const id = generateId()
    const now = Date.now()
    const eventDate = new Date(event.date || '2024-06-01').getTime()
    const safeEventDate = isNaN(eventDate) ? now : eventDate

    await client.execute({
      sql: `INSERT INTO imported_tournament_results (id, imported_by, event_name, event_date, format, meta_window, raw_data, parsed_data, imported_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        importedBy,
        event.name,
        safeEventDate,
        tournamentRecord.format,
        deriveMetaWindow(event.date || '2024-06-01'),
        JSON.stringify(data),
        JSON.stringify([tournamentRecord]),
        now,
      ],
    })

    imported++
    console.log(`  ✓ ${event.name} — ${players.length} players, top: ${players[0]?.name} (${players[0]?.faction}) ${players[0]?.wins}-${players[0]?.losses}-${players[0]?.draws}`)
  }

  console.log(`\nDone. ${imported} events imported with real W/L/D data.`)
  client.close()
}

main().catch(console.error)

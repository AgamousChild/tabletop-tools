/**
 * Import army list text into bcp_army_lists table.
 * Reads from pairings-*.json files that have listText on player records.
 *
 * Run: TURSO_DB_URL=... TURSO_AUTH_TOKEN=... npx tsx src/bcp/import-lists.ts
 */

import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { createClient } from '@libsql/client'
import { createDbFromClient, getAllFactions, getFactionAliasMap } from '@tabletop-tools/db'

const BCP_DIR = '.local/ingest/bcp'

let factionAliasToName: Map<string, string> | null = null

async function loadFactionAliases(client: ReturnType<typeof createClient>) {
  const db = createDbFromClient(client)
  const aliasMap = await getFactionAliasMap(db)
  const factions = await getAllFactions(db)
  const slugToName = new Map(factions.map((f) => [f.id, f.name]))

  // Build alias → canonical name (not slug) for BCP list import
  factionAliasToName = new Map<string, string>()
  for (const [alias, slug] of aliasMap) {
    const name = slugToName.get(slug)
    if (name) factionAliasToName.set(alias, name)
  }
}

function normalizeFaction(faction: string): string {
  if (!factionAliasToName) throw new Error('Faction aliases not loaded')
  return factionAliasToName.get(faction) ?? faction
}

function generateId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 21; i++) result += chars.charAt(Math.floor(Math.random() * chars.length))
  return result
}

async function main() {
  const dbUrl = process.env.TURSO_DB_URL
  const authToken = process.env.TURSO_AUTH_TOKEN

  if (!dbUrl || !authToken) {
    console.error('Set TURSO_DB_URL and TURSO_AUTH_TOKEN')
    process.exit(1)
  }

  const client = createClient({ url: dbUrl, authToken })

  // Load faction aliases from DB
  await loadFactionAliases(client)

  // Create table if it doesn't exist
  await client.execute(`CREATE TABLE IF NOT EXISTS bcp_army_lists (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    event_name TEXT NOT NULL,
    player_name TEXT NOT NULL,
    faction TEXT NOT NULL,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    draws INTEGER NOT NULL DEFAULT 0,
    list_text TEXT NOT NULL,
    event_date INTEGER
  )`)
  await client.execute(
    'CREATE INDEX IF NOT EXISTS idx_bcp_lists_event_id ON bcp_army_lists(event_id)',
  )
  await client.execute(
    'CREATE INDEX IF NOT EXISTS idx_bcp_lists_faction ON bcp_army_lists(faction)',
  )
  await client.execute(
    'CREATE INDEX IF NOT EXISTS idx_bcp_lists_event_date ON bcp_army_lists(event_date)',
  )

  // Clear existing
  await client.execute('DELETE FROM bcp_army_lists')
  console.log('Cleared existing lists\n')

  const files = readdirSync(BCP_DIR).filter((f) => f.startsWith('pairings-') && f.endsWith('.json'))
  console.log(`Processing ${files.length} events...\n`)

  let imported = 0
  let skipped = 0

  for (const file of files) {
    const data = JSON.parse(readFileSync(path.join(BCP_DIR, file), 'utf-8'))
    const event = data.event
    const records = data.records as Record<
      string,
      {
        wins: number
        losses: number
        draws: number
        faction: string
        listUrl: string | null
        listText?: string
      }
    >

    if (!records) continue

    const eventDate = event.date ? new Date(event.date).getTime() : null
    const safeDate = eventDate && !isNaN(eventDate) ? eventDate : null
    // Batch all players for this event
    const batch: Array<{ sql: string; args: unknown[] }> = []

    for (const [playerName, record] of Object.entries(records)) {
      if (!record.listText || record.listText.length < 20) {
        skipped++
        continue
      }

      const faction = normalizeFaction(record.faction)
      if (!faction) {
        skipped++
        continue
      }

      batch.push({
        sql: `INSERT INTO bcp_army_lists (id, event_id, event_name, player_name, faction, wins, losses, draws, list_text, event_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          generateId(),
          event.id,
          event.name,
          playerName,
          faction,
          record.wins,
          record.losses,
          record.draws,
          record.listText,
          safeDate,
        ],
      })
    }

    if (batch.length > 0) {
      await client.batch(batch as any)
      imported += batch.length
      console.log(`  ✓ ${event.name.substring(0, 50)} — ${batch.length} lists`)
    }
  }

  console.log(
    `\nDone. ${imported} lists imported, ${skipped} skipped (no list text or bad faction).`,
  )
  client.close()
}

main().catch(console.error)

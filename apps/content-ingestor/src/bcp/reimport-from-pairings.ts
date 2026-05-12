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

/** Normalize subfaction/chapter names to their parent faction */
const FACTION_ALIASES: Record<string, string> = {
  // Tyranids
  'Forces of the Hive Mind': 'Tyranids',
  'Hive Fleet Kronos': 'Tyranids',
  'Hive Fleet Hyrda': 'Tyranids',

  // Space Marines chapters
  'Ultramarines': 'Space Marines (Astartes)',
  'Salamanders': 'Space Marines (Astartes)',
  'Imperial Fists': 'Space Marines (Astartes)',
  'Iron Hands': 'Space Marines (Astartes)',
  'Raven Guard': 'Space Marines (Astartes)',
  'White Scars': 'Space Marines (Astartes)',
  'Crimson Fists': 'Space Marines (Astartes)',
  'Carcharadons': 'Space Marines (Astartes)',

  // CSM legions
  'Alpha Legion': 'Chaos Space Marines',
  'Night Lords': 'Chaos Space Marines',
  'Iron Warriors': 'Chaos Space Marines',
  'Word Bearers': 'Chaos Space Marines',
  'Red Corsairs': 'Chaos Space Marines',
  'Black Legion': 'Chaos Space Marines',

  // Blood Angels subfactions
  'Flesh Tearers': 'Blood Angels',

  // Dark Angels subfactions
  'Deathwing': 'Dark Angels',

  // Drukhari subfactions
  'Kabal of the Flayed Skull': 'Drukhari',

  // Orks clans
  'Blood Axe': 'Orks',
  'Freebooterz': 'Orks',
  'Goffs': 'Orks',

  // T'au septs
  'T\'au Sept': 'T\'au Empire',
  'Farsight Enclaves': 'T\'au Empire',

  // Necron dynasties
  'Sautekh': 'Necrons',
  'Nihilakh': 'Necrons',

  // Leagues of Votann
  'Ymyr Conglomerate': 'Leagues of Votann',

  // Chaos Daemons god-specific
  'Nurgle Daemons': 'Chaos Daemons',
  'Slaanesh Daemons': 'Chaos Daemons',
  'Slaanesh': 'Chaos Daemons',

  // Guard regiments
  'Cadian Shock Troops': 'Astra Militarum',
  'Catachan Jungle Fighters': 'Astra Militarum',

  // Catch-all soup keywords
  'Imperium': 'Imperial Agents',
  'Chaos': 'Chaos Space Marines',
  'Xenos': 'Aeldari', // best guess — usually Ynnari or mixed Aeldari

  // Junk
  '--------': '',
}

function normalizeFaction(faction: string): string {
  return FACTION_ALIASES[faction] ?? faction
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
        faction: normalizeFaction(r.faction),
        wins: r.wins,
        losses: r.losses,
        draws: r.draws,
        points: 0,
        listText: undefined, // stored locally, not in DB
      }))
      .filter(p => p.faction !== '')
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
        JSON.stringify({ event: data.event, recordCount: Object.keys(records).length }),
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

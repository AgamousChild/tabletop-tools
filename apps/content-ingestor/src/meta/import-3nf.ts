/**
 * Import BCP pairings data into 3NF meta tables.
 *
 * Reads from .local/ingest/bcp/pairings-*.json
 * Populates: meta_events, meta_event_players, meta_pairings,
 *            meta_event_win_distribution, meta_event_placements
 *
 * Run: TURSO_DB_URL=... TURSO_AUTH_TOKEN=... npx tsx src/meta/import-3nf.ts
 */

import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { type Client, createClient } from '@libsql/client'
import { createDbFromClient, getFactionAliasMap, getSubfactions } from '@tabletop-tools/db'

// Inline detachment extraction (from apps/new-meta/server/src/lib/detachment.ts)
const DETACHMENT_PATTERNS: RegExp[] = [
  /^\+?\s*DETACHMENT:\s*(.+)$/im,
  /^Detachment:\s*(.+)$/im,
  /^--\s*(.+?)\s*Detachment\s*--$/im,
]
function extractDetachment(listText: string): string | null {
  for (const pattern of DETACHMENT_PATTERNS) {
    const match = listText.match(pattern)
    if (match && match[1]) {
      const name = match[1].trim()
      if (name) return name
    }
  }
  return null
}

const BCP_DIR = '.local/ingest/bcp'

function generateId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let r = ''
  for (let i = 0; i < 21; i++) r += chars.charAt(Math.floor(Math.random() * chars.length))
  return r
}

function deriveFormat(playerCount: number): string {
  if (playerCount >= 400) return 'Super Major'
  if (playerCount >= 200) return 'Major'
  if (playerCount >= 100) return 'GT'
  return 'RTT'
}

function deriveRegionId(location: string): number | null {
  if (!location) return null
  const loc = location.toLowerCase()
  if (/united states|us$|canada|\bca\b.*\d{5}|, [a-z]{2} \d{5}/i.test(location)) return 1 // NA
  if (
    /united kingdom|gb$|de$|deutschland|germany|france|nederland|netherlands|austria|spain|italia|italy|sweden|belgium|ireland|scotland|england|poland|czech|denmark|norway|finland|portugal|hungary/i.test(
      location,
    )
  )
    return 2 // Europe
  if (/australia|new zealand|nz$/i.test(location)) return 3 // Oceania
  if (/japan|korea|china|singapore|malaysia|philippines|india|indonesia|thailand/i.test(location))
    return 4 // Asia
  if (/brazil|argentina|chile|colombia|mexico|peru/i.test(location)) return 5 // South America
  if (loc.includes('online') || loc.includes('tts') || loc.includes('global')) return 7 // Online
  return null
}

// Build a detachment slug from name + faction
function detachmentSlug(name: string, factionSlug: string): string {
  return `${factionSlug}:${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')}`
}

interface PairingRecord {
  round: number
  table: number
  p1: { name: string; faction: string; result: string; score: number; listUrl: string | null }
  p2: { name: string; faction: string; result: string; score: number; listUrl: string | null }
}

interface PlayerRecord {
  wins: number
  losses: number
  draws: number
  faction: string
  listUrl: string | null
  listText?: string
}

async function createTables(client: Client) {
  await client.batch([
    `CREATE TABLE IF NOT EXISTS meta_events (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, date INTEGER NOT NULL,
      location TEXT, gps_coords TEXT, region_id INTEGER REFERENCES dim_region(id),
      format TEXT NOT NULL, rounds INTEGER, player_count INTEGER NOT NULL,
      source TEXT NOT NULL, source_id TEXT, imported_at INTEGER NOT NULL,
      win_faction_id TEXT REFERENCES dim_faction(id),
      win_subfaction_id TEXT REFERENCES dim_subfaction(id),
      win_detachment_id TEXT REFERENCES dim_detachment(id),
      UNIQUE(source, source_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_meta_events_date ON meta_events(date)`,
    `CREATE INDEX IF NOT EXISTS idx_meta_events_format ON meta_events(format)`,
    `CREATE INDEX IF NOT EXISTS idx_meta_events_region ON meta_events(region_id)`,

    `CREATE TABLE IF NOT EXISTS meta_event_players (
      id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES meta_events(id) ON DELETE CASCADE,
      player_name TEXT NOT NULL, source_player_id TEXT,
      faction_id TEXT NOT NULL REFERENCES dim_faction(id),
      subfaction_id TEXT REFERENCES dim_subfaction(id),
      detachment_id TEXT REFERENCES dim_detachment(id),
      placement INTEGER NOT NULL, list_text TEXT,
      wins INTEGER NOT NULL DEFAULT 0, losses INTEGER NOT NULL DEFAULT 0, draws INTEGER NOT NULL DEFAULT 0,
      gl2_rating_start REAL, gl2_rd_start REAL, gl2_vol_start REAL,
      gl2_rating_end REAL, gl2_rd_end REAL, gl2_vol_end REAL,
      UNIQUE(event_id, source_player_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_meta_event_players_event ON meta_event_players(event_id)`,
    `CREATE INDEX IF NOT EXISTS idx_meta_event_players_faction ON meta_event_players(faction_id)`,

    `CREATE TABLE IF NOT EXISTS meta_pairings (
      id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES meta_events(id) ON DELETE CASCADE,
      round INTEGER NOT NULL,
      player1_id TEXT NOT NULL REFERENCES meta_event_players(id) ON DELETE CASCADE,
      player2_id TEXT NOT NULL REFERENCES meta_event_players(id) ON DELETE CASCADE,
      player1_score INTEGER, player2_score INTEGER,
      player1_gl2 REAL, player2_gl2 REAL,
      result TEXT NOT NULL,
      UNIQUE(event_id, round, player1_id, player2_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_meta_pairings_event_round ON meta_pairings(event_id, round)`,
    `CREATE INDEX IF NOT EXISTS idx_meta_pairings_player1 ON meta_pairings(player1_id)`,
    `CREATE INDEX IF NOT EXISTS idx_meta_pairings_player2 ON meta_pairings(player2_id)`,

    `CREATE TABLE IF NOT EXISTS meta_event_win_distribution (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES meta_events(id) ON DELETE CASCADE,
      wins INTEGER NOT NULL, player_count INTEGER NOT NULL, player_pct REAL NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_event_win_dist_event ON meta_event_win_distribution(event_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_event_win_dist_unique ON meta_event_win_distribution(event_id, wins)`,

    `CREATE TABLE IF NOT EXISTS meta_event_placements (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES meta_events(id) ON DELETE CASCADE,
      tier TEXT NOT NULL, faction_id TEXT NOT NULL REFERENCES dim_faction(id),
      subfaction_id TEXT REFERENCES dim_subfaction(id),
      detachment_id TEXT REFERENCES dim_detachment(id),
      player_name TEXT NOT NULL, placement INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_event_placements_event ON meta_event_placements(event_id)`,
    `CREATE INDEX IF NOT EXISTS idx_event_placements_faction ON meta_event_placements(faction_id)`,
  ])
}

function getClient() {
  const local = process.argv.includes('--local')
  if (local) {
    console.log('Using local DB: .local/meta/meta.db\n')
    return createClient({ url: 'file:.local/meta/meta.db' })
  }
  const dbUrl = process.env.TURSO_DB_URL
  const authToken = process.env.TURSO_AUTH_TOKEN
  if (!dbUrl || !authToken) {
    console.error('Set TURSO_DB_URL and TURSO_AUTH_TOKEN')
    process.exit(1)
  }
  return createClient({ url: dbUrl, authToken })
}

async function main() {
  const client = getClient()

  await createTables(client)

  // Load faction alias map from dim_faction_alias table
  const db = createDbFromClient(client)
  const BCP_FACTION_TO_SLUG = Object.fromEntries(await getFactionAliasMap(db))
  const subfactions = await getSubfactions(db)
  const SUBFACTION_PARENT: Record<string, string> = Object.fromEntries(
    subfactions.map((s) => [s.id, s.factionId]),
  )

  // Load known dimension IDs for FK validation
  const detRows = await client.execute('SELECT id FROM dim_detachment')
  const knownDetachments = new Set(detRows.rows.map((r) => r.id as string))
  const sfRows = await client.execute('SELECT id FROM dim_subfaction')
  const knownSubfactions = new Set(sfRows.rows.map((r) => r.id as string))
  console.log(`Loaded ${knownDetachments.size} known detachments\n`)

  // Clear existing 3NF data
  await client.batch([
    'DELETE FROM meta_event_placements',
    'DELETE FROM meta_event_win_distribution',
    'DELETE FROM meta_pairings',
    'DELETE FROM meta_event_players',
    'DELETE FROM meta_events',
  ])
  console.log('Cleared existing 3NF data\n')

  const files = readdirSync(BCP_DIR).filter((f) => f.startsWith('pairings-') && f.endsWith('.json'))
  console.log(`Importing ${files.length} events...\n`)

  let totalEvents = 0
  let totalPlayers = 0
  let totalPairings = 0

  for (const file of files) {
    const data = JSON.parse(readFileSync(path.join(BCP_DIR, file), 'utf-8'))
    const event = data.event
    const records = data.records as Record<string, PlayerRecord>
    const pairings = (data.pairings || []) as PairingRecord[]

    if (!records || Object.keys(records).length === 0) continue

    const bcpFaction = Object.values(records)[0]?.faction || ''
    const factionSlug = BCP_FACTION_TO_SLUG[bcpFaction] || ''
    if (!factionSlug && bcpFaction && bcpFaction !== '--------') {
      // Unknown faction — skip silently
    }

    // Parse event date
    const eventDate = event.date ? new Date(event.date).getTime() : null
    const safeDate = eventDate && !isNaN(eventDate) ? eventDate : Date.now()
    const regionId = deriveRegionId(event.location || '')
    const playerCount = Object.keys(records).length
    const eventId = event.id || generateId()

    // Sort players by W/L/D for placement
    const sortedPlayers = Object.entries(records)
      .filter(([, r]) => {
        const slug = BCP_FACTION_TO_SLUG[r.faction]
        return slug && slug !== ''
      })
      .sort((a, b) => b[1].wins - a[1].wins || a[1].losses - b[1].losses)

    // Insert event
    await client.execute({
      sql: `INSERT OR IGNORE INTO meta_events (id, name, date, location, region_id, format, rounds, player_count, source, source_id, imported_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'bcp', ?, ?)`,
      args: [
        eventId,
        event.name,
        safeDate,
        event.location || null,
        regionId,
        deriveFormat(playerCount),
        event.rounds || null,
        playerCount,
        event.id,
        Date.now(),
      ],
    })

    // Insert players
    const playerIdMap = new Map<string, string>() // playerName → playerId

    const playerBatch = sortedPlayers.map(([name, r], idx) => {
      const playerId = generateId()
      playerIdMap.set(name, playerId)

      const slug = BCP_FACTION_TO_SLUG[r.faction]!
      const parentSlug = SUBFACTION_PARENT[slug]
      const factionId = parentSlug || slug
      const subfactionId = parentSlug && knownSubfactions.has(slug) ? slug : null

      // Try to extract detachment from list text
      // Only use if it exists in dim_detachment (validated below)
      let detachmentId: string | null = null
      if (r.listText) {
        const detName = extractDetachment(r.listText)
        if (detName) {
          const candidateSlug = detachmentSlug(detName, factionId)
          if (knownDetachments.has(candidateSlug)) {
            detachmentId = candidateSlug
          }
        }
      }

      return {
        sql: `INSERT OR IGNORE INTO meta_event_players (id, event_id, player_name, faction_id, subfaction_id, detachment_id, placement, list_text, wins, losses, draws)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          playerId,
          eventId,
          name,
          factionId,
          subfactionId,
          detachmentId,
          idx + 1,
          r.listText || null,
          r.wins,
          r.losses,
          r.draws,
        ],
      }
    })

    if (playerBatch.length > 0) {
      // Batch in chunks of 50 to avoid Turso limits
      for (let i = 0; i < playerBatch.length; i += 50) {
        try {
          await client.batch(playerBatch.slice(i, i + 50))
        } catch (err) {
          // Find the offending row
          for (const stmt of playerBatch.slice(i, i + 50)) {
            try {
              await client.execute(stmt)
            } catch (e2) {
              console.error(
                `    FK error: faction_id=${stmt.args[3]} subfaction=${stmt.args[4]} player=${stmt.args[2]}`,
              )
            }
          }
        }
      }
    }

    // Insert pairings
    const pairingBatch: Array<{ sql: string; args: unknown[] }> = []
    for (const p of pairings) {
      const p1Id = playerIdMap.get(p.p1.name)
      const p2Id = playerIdMap.get(p.p2.name)
      if (!p1Id || !p2Id) continue

      let result: string
      if (p.p1.result === 'win') result = 'p1'
      else if (p.p2.result === 'win') result = 'p2'
      else result = 'draw'

      pairingBatch.push({
        sql: `INSERT OR IGNORE INTO meta_pairings (id, event_id, round, player1_id, player2_id, player1_score, player2_score, result)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          generateId(),
          eventId,
          p.round,
          p1Id,
          p2Id,
          p.p1.score || null,
          p.p2.score || null,
          result,
        ],
      })
    }

    if (pairingBatch.length > 0) {
      for (let i = 0; i < pairingBatch.length; i += 50) {
        await client.batch(pairingBatch.slice(i, i + 50))
      }
    }

    // Win distribution
    const winCounts = new Map<number, number>()
    for (const [, r] of sortedPlayers) {
      winCounts.set(r.wins, (winCounts.get(r.wins) || 0) + 1)
    }
    const distBatch = [...winCounts.entries()].map(([wins, count]) => ({
      sql: `INSERT OR IGNORE INTO meta_event_win_distribution (id, event_id, wins, player_count, player_pct)
            VALUES (?, ?, ?, ?, ?)`,
      args: [generateId(), eventId, wins, count, count / sortedPlayers.length],
    }))
    if (distBatch.length > 0) {
      await client.batch(distBatch)
    }

    // Event placements (top 16)
    const placementBatch: Array<{ sql: string; args: unknown[] }> = []
    for (let i = 0; i < Math.min(sortedPlayers.length, 16); i++) {
      const [name, r] = sortedPlayers[i]!
      const slug = BCP_FACTION_TO_SLUG[r.faction]!
      const parentSlug = SUBFACTION_PARENT[slug]
      const factionId = parentSlug || slug

      let tier: string
      if (i === 0) tier = 'winner'
      else if (i === 1) tier = 'finalist'
      else if (i < 4) tier = 'top4'
      else if (i < 8) tier = 'top8'
      else tier = 'top16'

      placementBatch.push({
        sql: `INSERT OR IGNORE INTO meta_event_placements (id, event_id, tier, faction_id, player_name, placement)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [generateId(), eventId, tier, factionId, name, i + 1],
      })
    }
    if (placementBatch.length > 0) {
      await client.batch(placementBatch)
    }

    // Update event winner
    if (sortedPlayers.length > 0) {
      const [, winnerRec] = sortedPlayers[0]!
      const winSlug = BCP_FACTION_TO_SLUG[winnerRec.faction]!
      const winParent = SUBFACTION_PARENT[winSlug]
      await client.execute({
        sql: `UPDATE meta_events SET win_faction_id = ? WHERE id = ?`,
        args: [winParent || winSlug, eventId],
      })
    }

    totalEvents++
    totalPlayers += sortedPlayers.length
    totalPairings += pairingBatch.length
    console.log(
      `  ✓ ${event.name.substring(0, 50)} — ${sortedPlayers.length} players, ${pairingBatch.length} pairings`,
    )
  }

  console.log(`\nDone. ${totalEvents} events, ${totalPlayers} players, ${totalPairings} pairings.`)
  client.close()
}

main().catch(console.error)

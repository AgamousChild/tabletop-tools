/**
 * Seed dimension tables from Wahapedia data and known 40K taxonomy.
 *
 * Populates: dim_faction, dim_subfaction, dim_detachment,
 *            dim_for_type, dim_granularity,
 *            dim_dataslate, dim_tournament_pack, dim_edition, dim_region
 *
 * Run: TURSO_DB_URL=... TURSO_AUTH_TOKEN=... npx tsx src/meta/seed-dimensions.ts
 */

import { readFileSync } from 'node:fs'

import { createClient } from '@libsql/client'

// ── Faction taxonomy ──────────────────────────────────────────────────────────

interface WahapediaDetachment {
  id: string
  factionId: string
  name: string
}

import path from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WAHAPEDIA_DETACHMENTS_PATH = path.resolve(
  __dirname,
  '../../../data-import/client/public/wahapedia/detachments.json',
)

// Wahapedia faction ID → canonical faction info
const FACTION_MAP: Record<string, { slug: string; name: string; allegiance: string }> = {
  AC: { slug: 'adeptus-custodes', name: 'Adeptus Custodes', allegiance: 'imperium' },
  AE: { slug: 'aeldari', name: 'Aeldari', allegiance: 'xenos' },
  AM: { slug: 'astra-militarum', name: 'Astra Militarum', allegiance: 'imperium' },
  AS: { slug: 'adepta-sororitas', name: 'Adepta Sororitas', allegiance: 'imperium' },
  AdM: { slug: 'adeptus-mechanicus', name: 'Adeptus Mechanicus', allegiance: 'imperium' },
  AoI: { slug: 'imperial-agents', name: 'Imperial Agents', allegiance: 'imperium' },
  CD: { slug: 'chaos-daemons', name: 'Chaos Daemons', allegiance: 'chaos' },
  CSM: { slug: 'chaos-space-marines', name: 'Chaos Space Marines', allegiance: 'chaos' },
  DG: { slug: 'death-guard', name: 'Death Guard', allegiance: 'chaos' },
  DRU: { slug: 'drukhari', name: 'Drukhari', allegiance: 'xenos' },
  EC: { slug: 'emperors-children', name: "Emperor's Children", allegiance: 'chaos' },
  GC: { slug: 'genestealer-cults', name: 'Genestealer Cults', allegiance: 'xenos' },
  GK: { slug: 'grey-knights', name: 'Grey Knights', allegiance: 'imperium' },
  LoV: { slug: 'leagues-of-votann', name: 'Leagues of Votann', allegiance: 'xenos' },
  NEC: { slug: 'necrons', name: 'Necrons', allegiance: 'xenos' },
  ORK: { slug: 'orks', name: 'Orks', allegiance: 'xenos' },
  QI: { slug: 'imperial-knights', name: 'Imperial Knights', allegiance: 'imperium' },
  QT: { slug: 'chaos-knights', name: 'Chaos Knights', allegiance: 'chaos' },
  SM: { slug: 'space-marines', name: 'Space Marines (Astartes)', allegiance: 'imperium' },
  TAU: { slug: 'tau-empire', name: "T'au Empire", allegiance: 'xenos' },
  // Wahapedia files Titan Legions under short code `TL` with the display
  // name "Adeptus Titanicus"; the brain canonical slug is `titan-legions`
  // (Micah's directive 2026-07-05: Adeptus Titanicus IS Titan Legions).
  TL: { slug: 'titan-legions', name: 'Titan Legions', allegiance: 'imperium' },
  TS: { slug: 'thousand-sons', name: 'Thousand Sons', allegiance: 'chaos' },
  TYR: { slug: 'tyranids', name: 'Tyranids', allegiance: 'xenos' },
  WE: { slug: 'world-eaters', name: 'World Eaters', allegiance: 'chaos' },
  // Chaos Titan Legions has no Wahapedia short code — it lives entirely
  // as a code-generated variant of Titan Legions (see
  // apps/brain/server/src/lib/titan-legions-chaos-swap.ts).
  CTL: { slug: 'chaos-titan-legions', name: 'Chaos Titan Legions', allegiance: 'chaos' },
}

// BCP subfactions that map to a parent faction.
//
// SUBFACTIONS is the single source of truth for Space Marines chapters:
// every entry lands as BOTH a `dim_subfaction` row (join to the shared SM
// pool at retrieval time) AND a `dim_faction` row (so chapter-specific
// datasheets like Marneus Calgar route to `factionId=ultramarines` instead
// of generic `space-marines`). Chapters access the shared SM pool via the
// `dim_subfaction` parent walk in `expandFactionForRetrieval`.
//
// Adding a new chapter is one line here — the loop below inserts into
// dim_faction automatically. Per Micah's 2026-07-05 directive: match GW's
// official 40K app, which lists all 11 First Founding chapters as their own
// codex-supplement factions.
const SUBFACTIONS: Array<{ slug: string; name: string; factionSlug: string }> = [
  // SM chapters — First Founding.
  { slug: 'blood-angels', name: 'Blood Angels', factionSlug: 'space-marines' },
  { slug: 'dark-angels', name: 'Dark Angels', factionSlug: 'space-marines' },
  { slug: 'space-wolves', name: 'Space Wolves', factionSlug: 'space-marines' },
  { slug: 'black-templars', name: 'Black Templars', factionSlug: 'space-marines' },
  { slug: 'deathwatch', name: 'Deathwatch', factionSlug: 'space-marines' },
  { slug: 'imperial-fists', name: 'Imperial Fists', factionSlug: 'space-marines' },
  { slug: 'iron-hands', name: 'Iron Hands', factionSlug: 'space-marines' },
  { slug: 'raven-guard', name: 'Raven Guard', factionSlug: 'space-marines' },
  { slug: 'salamanders', name: 'Salamanders', factionSlug: 'space-marines' },
  { slug: 'ultramarines', name: 'Ultramarines', factionSlug: 'space-marines' },
  { slug: 'white-scars', name: 'White Scars', factionSlug: 'space-marines' },
]

// BCP_FACTION_TO_SLUG and SUBFACTION_PARENT removed — now in dim_faction_alias table.
// Use getFactionAliasMap(db) and getSubfactions(db) from @tabletop-tools/db.

// ── Known game periods ────────────────────────────────────────────────────────

const DATASLATES = [
  {
    id: 'dataslate-2024-06',
    name: '10th Edition Launch',
    effectiveDate: '2024-06-01',
    endDate: '2024-09-11',
  },
  {
    id: 'dataslate-2024-09',
    name: 'September 2024 Balance Dataslate',
    effectiveDate: '2024-09-12',
    endDate: '2025-01-19',
  },
  {
    id: 'dataslate-2025-01',
    name: 'January 2025 Balance Dataslate',
    effectiveDate: '2025-01-20',
    endDate: '2025-04-13',
  },
  {
    id: 'dataslate-2025-04',
    name: 'April 2025 Balance Dataslate',
    effectiveDate: '2025-04-14',
    endDate: null,
  },
]

const TOURNAMENT_PACKS = [
  {
    id: 'pack-pariah-nexus',
    name: 'Pariah Nexus Mission Pack',
    effectiveDate: '2024-06-01',
    endDate: '2024-12-31',
  },
  {
    id: 'pack-chapter-approved-2025',
    name: 'Chapter Approved 2025',
    effectiveDate: '2025-01-01',
    endDate: null,
  },
]

const EDITIONS = [
  { id: 'edition-10th', name: '10th Edition', startDate: '2023-06-01', endDate: null },
]

const REGIONS = [
  { id: 1, name: 'North America', country: null },
  { id: 2, name: 'Europe', country: null },
  { id: 3, name: 'Oceania', country: null },
  { id: 4, name: 'Asia', country: null },
  { id: 5, name: 'South America', country: null },
  { id: 6, name: 'Africa', country: null },
  { id: 7, name: 'Online', country: null },
]

// ── Main ──────────────────────────────────────────────────────────────────────

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

  // Create all tables
  console.log('Creating tables...\n')

  const ddl = [
    `CREATE TABLE IF NOT EXISTS dim_faction (id TEXT PRIMARY KEY, name TEXT NOT NULL, allegiance TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS dim_subfaction (id TEXT PRIMARY KEY, name TEXT NOT NULL, faction_id TEXT NOT NULL REFERENCES dim_faction(id))`,
    `CREATE TABLE IF NOT EXISTS dim_detachment (id TEXT PRIMARY KEY, name TEXT NOT NULL, faction_id TEXT NOT NULL REFERENCES dim_faction(id), subfaction_id TEXT REFERENCES dim_subfaction(id))`,
    `CREATE TABLE IF NOT EXISTS dim_for_type (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE)`,
    `CREATE TABLE IF NOT EXISTS dim_granularity (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE)`,
    `CREATE TABLE IF NOT EXISTS dim_dataslate (id TEXT PRIMARY KEY, name TEXT NOT NULL, effective_date INTEGER NOT NULL, end_date INTEGER)`,
    `CREATE TABLE IF NOT EXISTS dim_tournament_pack (id TEXT PRIMARY KEY, name TEXT NOT NULL, effective_date INTEGER NOT NULL, end_date INTEGER)`,
    `CREATE TABLE IF NOT EXISTS dim_edition (id TEXT PRIMARY KEY, name TEXT NOT NULL, start_date INTEGER NOT NULL, end_date INTEGER)`,
    `CREATE TABLE IF NOT EXISTS dim_region (id INTEGER PRIMARY KEY, name TEXT NOT NULL, country TEXT)`,
  ]
  for (const sql of ddl) {
    await client.execute(sql)
    await new Promise((r) => setTimeout(r, 200))
  }

  // Indexes
  await client.execute(
    'CREATE INDEX IF NOT EXISTS idx_dim_subfaction_faction ON dim_subfaction(faction_id)',
  )
  await client.execute(
    'CREATE INDEX IF NOT EXISTS idx_dim_detachment_faction ON dim_detachment(faction_id)',
  )
  await client.execute(
    'CREATE INDEX IF NOT EXISTS idx_dim_detachment_subfaction ON dim_detachment(subfaction_id)',
  )

  // Seed dim_for_type
  console.log('Seeding dim_for_type...')
  await client.batch([
    { sql: 'INSERT OR IGNORE INTO dim_for_type VALUES (?, ?)', args: [1, 'Event'] },
    { sql: 'INSERT OR IGNORE INTO dim_for_type VALUES (?, ?)', args: [2, 'Weekend'] },
    { sql: 'INSERT OR IGNORE INTO dim_for_type VALUES (?, ?)', args: [3, 'Month'] },
    { sql: 'INSERT OR IGNORE INTO dim_for_type VALUES (?, ?)', args: [4, 'Quarter'] },
    { sql: 'INSERT OR IGNORE INTO dim_for_type VALUES (?, ?)', args: [5, 'Year'] },
    { sql: 'INSERT OR IGNORE INTO dim_for_type VALUES (?, ?)', args: [6, 'DataSlate'] },
    { sql: 'INSERT OR IGNORE INTO dim_for_type VALUES (?, ?)', args: [7, 'TournamentPack'] },
    { sql: 'INSERT OR IGNORE INTO dim_for_type VALUES (?, ?)', args: [8, 'Edition'] },
  ])

  // Seed dim_granularity
  console.log('Seeding dim_granularity...')
  await client.batch([
    { sql: 'INSERT OR IGNORE INTO dim_granularity VALUES (?, ?)', args: [1, 'Faction'] },
    { sql: 'INSERT OR IGNORE INTO dim_granularity VALUES (?, ?)', args: [2, 'SubFaction'] },
    { sql: 'INSERT OR IGNORE INTO dim_granularity VALUES (?, ?)', args: [3, 'Detachment'] },
  ])

  // Seed dim_faction
  console.log('Seeding dim_faction...')
  // Drop retired dim_faction rows before insert so a re-seed collapses the
  // 2026-07-05 cleanup (merge adeptus-titanicus into titan-legions; retire
  // unaligned-forces/unbound-adversaries/unknown). Retirees below stay in
  // sync with LEGACY_FACTION_REWRITES + DROPPED_FACTION_IDS in
  // apps/brain/server/src/lib/faction-codes.ts.
  const RETIRED_FACTION_SLUGS = [
    'adeptus-titanicus',
    'unaligned-forces',
    'unbound-adversaries',
    'unknown',
  ]
  // FK-safe cascade: only dim_faction_alias has references to retired
  // factions in prod today (verified 2026-07-05: 0 rows in dim_subfaction/
  // dim_detachment/meta_events/*/fact_game_results/meta_top; 4 rows in
  // dim_faction_alias for `unaligned-forces`). Drop the alias rows first,
  // then the parent. Tournament-facing tables (meta_*, fact_*) stay
  // untouched — no live tournament records reference the retired factions.
  for (const slug of RETIRED_FACTION_SLUGS) {
    await client.execute({
      sql: 'DELETE FROM dim_faction_alias WHERE faction_id = ?',
      args: [slug],
    })
    await client.execute({ sql: 'DELETE FROM dim_faction WHERE id = ?', args: [slug] })
  }
  const factionBatch = Object.values(FACTION_MAP).map((f) => ({
    sql: 'INSERT OR IGNORE INTO dim_faction VALUES (?, ?, ?)',
    args: [f.slug, f.name, f.allegiance],
  }))
  // Every subfaction is ALSO its own dim_faction row — chapter-specific
  // datasheets route to `factionId=<chapter-slug>` (e.g. Marneus Calgar →
  // ultramarines) while still joining to the shared SM pool via
  // dim_subfaction. Allegiance is inherited from the parent (all SM chapters
  // are imperium today; if a subfaction ever lives under a chaos/xenos
  // parent, this lookup carries it through).
  const subfactionFactionRows = SUBFACTIONS.map((sf) => {
    const parent = Object.values(FACTION_MAP).find((f) => f.slug === sf.factionSlug)
    const allegiance = parent?.allegiance ?? 'imperium'
    return {
      sql: 'INSERT OR IGNORE INTO dim_faction VALUES (?, ?, ?)',
      args: [sf.slug, sf.name, allegiance],
    }
  })
  await client.batch([...factionBatch, ...subfactionFactionRows])
  console.log(
    `  ${factionBatch.length + subfactionFactionRows.length} factions ` +
      `(${factionBatch.length} top-level + ${subfactionFactionRows.length} chapter/subfaction; ` +
      `${RETIRED_FACTION_SLUGS.length} retired rows dropped)`,
  )

  // Seed dim_subfaction
  console.log('Seeding dim_subfaction...')
  const subfactionBatch = SUBFACTIONS.map((sf) => ({
    sql: 'INSERT OR IGNORE INTO dim_subfaction VALUES (?, ?, ?)',
    args: [sf.slug, sf.name, sf.factionSlug],
  }))
  await client.batch(subfactionBatch)
  console.log(`  ${subfactionBatch.length} subfactions`)

  // Seed dim_detachment from Wahapedia
  console.log('Seeding dim_detachment...')
  const wahapediaDetachments: WahapediaDetachment[] = JSON.parse(
    readFileSync(WAHAPEDIA_DETACHMENTS_PATH, 'utf-8'),
  )
  const detachmentBatch = wahapediaDetachments
    .filter((d) => FACTION_MAP[d.factionId]) // skip unknown factions
    .map((d) => {
      const faction = FACTION_MAP[d.factionId]!
      const slug = `${faction.slug}:${d.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')}`
      return {
        sql: 'INSERT OR IGNORE INTO dim_detachment VALUES (?, ?, ?, ?)',
        args: [slug, d.name, faction.slug, null], // subfaction_id null for now
      }
    })
  await client.batch(detachmentBatch)
  console.log(`  ${detachmentBatch.length} detachments`)

  // Seed dim_dataslate
  console.log('Seeding dim_dataslate...')
  await client.batch(
    DATASLATES.map((ds) => ({
      sql: 'INSERT OR REPLACE INTO dim_dataslate VALUES (?, ?, ?, ?)',
      args: [
        ds.id,
        ds.name,
        new Date(ds.effectiveDate).getTime(),
        ds.endDate ? new Date(ds.endDate).getTime() : null,
      ],
    })),
  )

  // Seed dim_tournament_pack
  console.log('Seeding dim_tournament_pack...')
  await client.batch(
    TOURNAMENT_PACKS.map((tp) => ({
      sql: 'INSERT OR REPLACE INTO dim_tournament_pack VALUES (?, ?, ?, ?)',
      args: [
        tp.id,
        tp.name,
        new Date(tp.effectiveDate).getTime(),
        tp.endDate ? new Date(tp.endDate).getTime() : null,
      ],
    })),
  )

  // Seed dim_edition
  console.log('Seeding dim_edition...')
  await client.batch(
    EDITIONS.map((e) => ({
      sql: 'INSERT OR REPLACE INTO dim_edition VALUES (?, ?, ?, ?)',
      args: [
        e.id,
        e.name,
        new Date(e.startDate).getTime(),
        e.endDate ? new Date(e.endDate).getTime() : null,
      ],
    })),
  )

  // Seed dim_region
  console.log('Seeding dim_region...')
  await client.batch(
    REGIONS.map((r) => ({
      sql: 'INSERT OR REPLACE INTO dim_region VALUES (?, ?, ?)',
      args: [r.id, r.name, r.country],
    })),
  )

  console.log('\nDone. All dimension tables seeded.')
  client.close()
}

// Only run when executed directly, not when imported
const isMain = process.argv[1]?.includes('seed-dimensions')
if (isMain) main().catch(console.error)

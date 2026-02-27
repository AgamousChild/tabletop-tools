/**
 * create-master-db.ts
 *
 * Creates a master SQLite database combining BSData and Wahapedia data sources
 * with proper referential integrity (foreign keys), cross-reference tables,
 * and game rules linked to units.
 *
 * Usage:
 *   npx tsx scripts/create-master-db.ts [output-path]
 *
 * Default output: scripts/.local/master.db
 *
 * Source databases:
 *   - Wahapedia: C:/R/sync-data/tools/wahapedia-sync/.local/wahapedia/data.db
 *   - BSData:    C:/R/sync-data/tools/bsdata-sync/.local/bsdata/data.db
 */

import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const WAHAPEDIA_DB = 'C:/R/sync-data/tools/wahapedia-sync/.local/wahapedia/data.db'
const BSDATA_DB = 'C:/R/sync-data/tools/bsdata-sync/.local/bsdata/data.db'
const DEFAULT_OUT = resolve(__dirname, '.local', 'master.db')
const outPath = process.argv[2] || DEFAULT_OUT

mkdirSync(dirname(outPath), { recursive: true })

// ─── Open source databases ──────────────────────────────────────────
const waha = new Database(WAHAPEDIA_DB, { readonly: true })
const bsd = new Database(BSDATA_DB, { readonly: true })
const master = new Database(outPath)

master.pragma('journal_mode = WAL')
master.pragma('foreign_keys = ON')

console.log('Creating master database...')
console.log(`  Output: ${outPath}`)
console.log()

// ─── Schema: Wahapedia tables (with FK constraints) ─────────────────
master.exec(`
  -- Factions (root table)
  CREATE TABLE IF NOT EXISTS w_factions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    link TEXT NOT NULL DEFAULT ''
  );

  -- Sources
  CREATE TABLE IF NOT EXISTS w_sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT '',
    edition TEXT NOT NULL DEFAULT '',
    version TEXT NOT NULL DEFAULT '',
    errata_date TEXT NOT NULL DEFAULT '',
    errata_link TEXT NOT NULL DEFAULT ''
  );

  -- Datasheets (units)
  CREATE TABLE IF NOT EXISTS w_datasheets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    faction_id TEXT NOT NULL REFERENCES w_factions(id),
    source_id TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT '',
    legend TEXT NOT NULL DEFAULT '',
    transport TEXT NOT NULL DEFAULT '',
    virtual TEXT NOT NULL DEFAULT '',
    loadout TEXT NOT NULL DEFAULT '',
    leader_head TEXT NOT NULL DEFAULT '',
    leader_footer TEXT NOT NULL DEFAULT '',
    damaged_w TEXT NOT NULL DEFAULT '',
    damaged_description TEXT NOT NULL DEFAULT '',
    link TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_w_datasheets_faction ON w_datasheets(faction_id);

  -- Datasheet models (stat lines)
  CREATE TABLE IF NOT EXISTS w_datasheet_models (
    id INTEGER PRIMARY KEY,
    datasheet_id TEXT NOT NULL REFERENCES w_datasheets(id) ON DELETE CASCADE,
    line TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    M TEXT NOT NULL DEFAULT '',
    T TEXT NOT NULL DEFAULT '',
    Sv TEXT NOT NULL DEFAULT '',
    W TEXT NOT NULL DEFAULT '',
    Ld TEXT NOT NULL DEFAULT '',
    OC TEXT NOT NULL DEFAULT '',
    base_size TEXT NOT NULL DEFAULT '',
    inv_sv TEXT NOT NULL DEFAULT '',
    inv_sv_descr TEXT NOT NULL DEFAULT '',
    base_size_descr TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_w_models_ds ON w_datasheet_models(datasheet_id);

  -- Datasheet models cost (point costs by model count)
  CREATE TABLE IF NOT EXISTS w_datasheet_models_cost (
    id INTEGER PRIMARY KEY,
    datasheet_id TEXT NOT NULL REFERENCES w_datasheets(id) ON DELETE CASCADE,
    line TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    cost TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_w_cost_ds ON w_datasheet_models_cost(datasheet_id);

  -- Datasheet wargear (weapons)
  CREATE TABLE IF NOT EXISTS w_datasheet_wargear (
    id INTEGER PRIMARY KEY,
    datasheet_id TEXT NOT NULL REFERENCES w_datasheets(id) ON DELETE CASCADE,
    line TEXT NOT NULL DEFAULT '',
    line_in_wargear TEXT NOT NULL DEFAULT '',
    dice TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    range TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT '',
    A TEXT NOT NULL DEFAULT '',
    BS_WS TEXT NOT NULL DEFAULT '',
    S TEXT NOT NULL DEFAULT '',
    AP TEXT NOT NULL DEFAULT '',
    D TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_w_wargear_ds ON w_datasheet_wargear(datasheet_id);

  -- Datasheet abilities
  CREATE TABLE IF NOT EXISTS w_datasheet_abilities (
    id INTEGER PRIMARY KEY,
    datasheet_id TEXT NOT NULL REFERENCES w_datasheets(id) ON DELETE CASCADE,
    line TEXT NOT NULL DEFAULT '',
    ability_id TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT '',
    parameter TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_w_abilities_ds ON w_datasheet_abilities(datasheet_id);

  -- Datasheet keywords
  CREATE TABLE IF NOT EXISTS w_datasheet_keywords (
    id INTEGER PRIMARY KEY,
    datasheet_id TEXT NOT NULL REFERENCES w_datasheets(id) ON DELETE CASCADE,
    keyword TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    is_faction_keyword TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_w_keywords_ds ON w_datasheet_keywords(datasheet_id);

  -- Datasheet leaders
  CREATE TABLE IF NOT EXISTS w_datasheet_leaders (
    id INTEGER PRIMARY KEY,
    leader_id TEXT NOT NULL REFERENCES w_datasheets(id) ON DELETE CASCADE,
    attached_id TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_w_leaders_leader ON w_datasheet_leaders(leader_id);

  -- Datasheet options
  CREATE TABLE IF NOT EXISTS w_datasheet_options (
    id INTEGER PRIMARY KEY,
    datasheet_id TEXT NOT NULL REFERENCES w_datasheets(id) ON DELETE CASCADE,
    line TEXT NOT NULL DEFAULT '',
    button TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT ''
  );

  -- Datasheet unit composition
  CREATE TABLE IF NOT EXISTS w_datasheet_unit_composition (
    id INTEGER PRIMARY KEY,
    datasheet_id TEXT NOT NULL REFERENCES w_datasheets(id) ON DELETE CASCADE,
    line TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT ''
  );

  -- Detachments
  CREATE TABLE IF NOT EXISTS w_detachments (
    id TEXT PRIMARY KEY,
    faction_id TEXT NOT NULL DEFAULT '' REFERENCES w_factions(id),
    name TEXT NOT NULL,
    legend TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_w_detachments_faction ON w_detachments(faction_id);

  -- Detachment abilities
  CREATE TABLE IF NOT EXISTS w_detachment_abilities (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    legend TEXT NOT NULL DEFAULT '',
    faction_id TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    detachment_id TEXT NOT NULL DEFAULT '' REFERENCES w_detachments(id) ON DELETE CASCADE,
    detachment TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_w_det_abilities_det ON w_detachment_abilities(detachment_id);

  -- Enhancements
  CREATE TABLE IF NOT EXISTS w_enhancements (
    rowid INTEGER PRIMARY KEY,
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    faction_id TEXT NOT NULL DEFAULT '',
    detachment_id TEXT NOT NULL DEFAULT '',
    cost TEXT NOT NULL DEFAULT '',
    legend TEXT NOT NULL DEFAULT '',
    detachment TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_w_enhancements_det ON w_enhancements(detachment_id);
  CREATE INDEX IF NOT EXISTS idx_w_enhancements_faction ON w_enhancements(faction_id);

  -- Stratagems
  CREATE TABLE IF NOT EXISTS w_stratagems (
    rowid INTEGER PRIMARY KEY,
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT '',
    cp_cost TEXT NOT NULL DEFAULT '',
    legend TEXT NOT NULL DEFAULT '',
    turn TEXT NOT NULL DEFAULT '',
    phase TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    faction_id TEXT NOT NULL DEFAULT '',
    detachment_id TEXT NOT NULL DEFAULT '',
    detachment TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_w_stratagems_det ON w_stratagems(detachment_id);
  CREATE INDEX IF NOT EXISTS idx_w_stratagems_faction ON w_stratagems(faction_id);

  -- Abilities (shared/faction)
  CREATE TABLE IF NOT EXISTS w_abilities (
    rowid INTEGER PRIMARY KEY,
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    legend TEXT NOT NULL DEFAULT '',
    faction_id TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT ''
  );

  -- Junction tables
  CREATE TABLE IF NOT EXISTS w_datasheet_stratagems (
    id INTEGER PRIMARY KEY,
    datasheet_id TEXT NOT NULL REFERENCES w_datasheets(id) ON DELETE CASCADE,
    stratagem_id TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_w_ds_strat_ds ON w_datasheet_stratagems(datasheet_id);

  CREATE TABLE IF NOT EXISTS w_datasheet_enhancements (
    id INTEGER PRIMARY KEY,
    datasheet_id TEXT NOT NULL REFERENCES w_datasheets(id) ON DELETE CASCADE,
    enhancement_id TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_w_ds_enh_ds ON w_datasheet_enhancements(datasheet_id);

  CREATE TABLE IF NOT EXISTS w_datasheet_detachment_abilities (
    id INTEGER PRIMARY KEY,
    datasheet_id TEXT NOT NULL REFERENCES w_datasheets(id) ON DELETE CASCADE,
    detachment_ability_id TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_w_ds_detab_ds ON w_datasheet_detachment_abilities(datasheet_id);
`)

// ─── Schema: BSData tables (with FK constraints) ────────────────────
master.exec(`
  CREATE TABLE IF NOT EXISTS b_units (
    id TEXT PRIMARY KEY,
    faction TEXT NOT NULL,
    name TEXT NOT NULL,
    move INTEGER NOT NULL DEFAULT 0,
    toughness INTEGER NOT NULL DEFAULT 0,
    save INTEGER NOT NULL DEFAULT 0,
    wounds INTEGER NOT NULL DEFAULT 1,
    leadership INTEGER NOT NULL DEFAULT 6,
    oc INTEGER NOT NULL DEFAULT 1,
    points INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_b_units_faction ON b_units(faction);

  CREATE TABLE IF NOT EXISTS b_weapons (
    id INTEGER PRIMARY KEY,
    unit_id TEXT NOT NULL REFERENCES b_units(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'ranged',
    range_value TEXT NOT NULL DEFAULT '0',
    attacks TEXT NOT NULL DEFAULT '1',
    skill INTEGER NOT NULL DEFAULT 4,
    strength INTEGER NOT NULL DEFAULT 4,
    ap INTEGER NOT NULL DEFAULT 0,
    damage TEXT NOT NULL DEFAULT '1'
  );
  CREATE INDEX IF NOT EXISTS idx_b_weapons_unit ON b_weapons(unit_id);

  CREATE TABLE IF NOT EXISTS b_weapon_abilities (
    id INTEGER PRIMARY KEY,
    weapon_id INTEGER NOT NULL REFERENCES b_weapons(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    value INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_b_wa_weapon ON b_weapon_abilities(weapon_id);

  CREATE TABLE IF NOT EXISTS b_abilities (
    id INTEGER PRIMARY KEY,
    unit_id TEXT NOT NULL REFERENCES b_units(id) ON DELETE CASCADE,
    name TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_b_abilities_unit ON b_abilities(unit_id);
`)

// ─── Schema: Cross-reference tables ─────────────────────────────────
master.exec(`
  -- Faction mapping: BSData faction name <-> Wahapedia faction id
  CREATE TABLE IF NOT EXISTS xref_factions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bsdata_faction TEXT NOT NULL,
    wahapedia_faction_id TEXT NOT NULL REFERENCES w_factions(id),
    UNIQUE(bsdata_faction, wahapedia_faction_id)
  );

  -- Unit mapping: BSData unit id <-> Wahapedia datasheet id
  CREATE TABLE IF NOT EXISTS xref_units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bsdata_unit_id TEXT NOT NULL REFERENCES b_units(id),
    wahapedia_datasheet_id TEXT NOT NULL REFERENCES w_datasheets(id),
    match_method TEXT NOT NULL DEFAULT 'name',
    match_score REAL NOT NULL DEFAULT 1.0,
    UNIQUE(bsdata_unit_id, wahapedia_datasheet_id)
  );
  CREATE INDEX IF NOT EXISTS idx_xref_units_bs ON xref_units(bsdata_unit_id);
  CREATE INDEX IF NOT EXISTS idx_xref_units_wa ON xref_units(wahapedia_datasheet_id);

  -- Game rules: standard rules that can be linked to units
  CREATE TABLE IF NOT EXISTS game_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT ''
  );

  -- Unit rules: links game_rules to datasheets/units
  CREATE TABLE IF NOT EXISTS unit_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_id INTEGER NOT NULL REFERENCES game_rules(id) ON DELETE CASCADE,
    wahapedia_datasheet_id TEXT REFERENCES w_datasheets(id) ON DELETE CASCADE,
    bsdata_unit_id TEXT REFERENCES b_units(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_unit_rules_rule ON unit_rules(rule_id);
  CREATE INDEX IF NOT EXISTS idx_unit_rules_wa ON unit_rules(wahapedia_datasheet_id);
  CREATE INDEX IF NOT EXISTS idx_unit_rules_bs ON unit_rules(bsdata_unit_id);
`)

// ─── Import Wahapedia data ──────────────────────────────────────────
console.log('Importing Wahapedia data...')

function importTable(srcDb: Database.Database, srcTable: string, destTable: string) {
  const rows = srcDb.prepare(`SELECT * FROM ${srcTable}`).all() as Record<string, unknown>[]
  if (rows.length === 0) return 0

  const cols = Object.keys(rows[0]!)
  const placeholders = cols.map(() => '?').join(', ')
  const colNames = cols.join(', ')
  const insert = master.prepare(`INSERT OR REPLACE INTO ${destTable} (${colNames}) VALUES (${placeholders})`)

  const tx = master.transaction((data: Record<string, unknown>[]) => {
    for (const row of data) {
      try {
        insert.run(...cols.map(c => row[c]))
      } catch {
        // Skip orphaned rows that violate FK constraints
      }
    }
  })
  tx(rows)
  return rows.length
}

// Import in FK-dependency order
const wahaImports: [string, string][] = [
  ['factions', 'w_factions'],
  ['sources', 'w_sources'],
  ['datasheets', 'w_datasheets'],
  ['datasheet_models', 'w_datasheet_models'],
  ['datasheet_models_cost', 'w_datasheet_models_cost'],
  ['datasheet_wargear', 'w_datasheet_wargear'],
  ['datasheet_abilities', 'w_datasheet_abilities'],
  ['datasheet_keywords', 'w_datasheet_keywords'],
  ['datasheet_leaders', 'w_datasheet_leaders'],
  ['datasheet_options', 'w_datasheet_options'],
  ['datasheet_unit_composition', 'w_datasheet_unit_composition'],
  ['detachments', 'w_detachments'],
  ['detachment_abilities', 'w_detachment_abilities'],
  ['enhancements', 'w_enhancements'],
  ['stratagems', 'w_stratagems'],
  ['abilities', 'w_abilities'],
  ['datasheet_stratagems', 'w_datasheet_stratagems'],
  ['datasheet_enhancements', 'w_datasheet_enhancements'],
  ['datasheet_detachment_abilities', 'w_datasheet_detachment_abilities'],
]

for (const [src, dest] of wahaImports) {
  const count = importTable(waha, src, dest)
  console.log(`  ${dest}: ${count} rows`)
}

// ─── Import BSData data ─────────────────────────────────────────────
console.log()
console.log('Importing BSData data...')

for (const [src, dest] of [
  ['units', 'b_units'],
  ['weapons', 'b_weapons'],
  ['weapon_abilities', 'b_weapon_abilities'],
  ['abilities', 'b_abilities'],
] as [string, string][]) {
  const count = importTable(bsd, src, dest)
  console.log(`  ${dest}: ${count} rows`)
}

// ─── Build faction cross-references ─────────────────────────────────
console.log()
console.log('Building faction cross-references...')

// Get unique BSData factions
const bsFactions = master.prepare('SELECT DISTINCT faction FROM b_units ORDER BY faction').all() as { faction: string }[]
const waFactions = master.prepare('SELECT id, name FROM w_factions').all() as { id: string; name: string }[]

// Manual faction name mappings: BSData faction → Wahapedia faction ID
// BSData factions have prefixes like "Imperium   Space Marines", "Chaos   Death Guard"
// Space Marine chapters in BSData map to "SM" (Space Marines) in Wahapedia
const MANUAL_FACTION_MAP: Record<string, string> = {
  'Imperium   Black Templars': 'SM',
  'Imperium   Blood Angels': 'SM',
  'Imperium   Dark Angels': 'SM',
  'Imperium   Deathwatch': 'SM',
  'Imperium   Imperial Fists': 'SM',
  'Imperium   Iron Hands': 'SM',
  'Imperium   Raven Guard': 'SM',
  'Imperium   Salamanders': 'SM',
  'Imperium   Space Wolves': 'SM',
  'Imperium   Ultramarines': 'SM',
  'Imperium   White Scars': 'SM',
  'Imperium   Agents of the Imperium': 'AoI',
  'Chaos   Emperor\'s Children': 'EC',
  "T'au Empire": 'TAU',
  'Library   Astartes Heresy Legends': 'SM',
  'Library   Titans': 'TL',
  'Library   Tyranids': 'TYR',
}

function normalizeFactionName(bsFaction: string): string {
  return bsFaction
    .replace(/^Imperium\s+/, '')
    .replace(/^Chaos\s+/, '')
    .replace(/^Aeldari\s+/, '')
    .replace(/^Library\s+/, '')
    .replace(/\s+Library$/, '')
    .trim()
}

const insertXrefFaction = master.prepare(
  'INSERT OR IGNORE INTO xref_factions (bsdata_faction, wahapedia_faction_id) VALUES (?, ?)'
)

let factionMatches = 0
for (const { faction: bsFaction } of bsFactions) {
  // Try manual map first
  const manualMatch = MANUAL_FACTION_MAP[bsFaction]
  if (manualMatch) {
    insertXrefFaction.run(bsFaction, manualMatch)
    factionMatches++
    continue
  }

  // Auto-match by normalized name
  const normalized = normalizeFactionName(bsFaction).toLowerCase()
  const match = waFactions.find(wf => wf.name.toLowerCase() === normalized)
  if (match) {
    insertXrefFaction.run(bsFaction, match.id)
    factionMatches++
  }
}
console.log(`  Matched ${factionMatches}/${bsFactions.length} BSData factions to Wahapedia`)

// Show unmatched factions (only truly unmatched)
const unmatchedFactions = bsFactions.filter(f => {
  if (MANUAL_FACTION_MAP[f.faction]) return false
  const normalized = normalizeFactionName(f.faction).toLowerCase()
  return !waFactions.find(wf => wf.name.toLowerCase() === normalized)
})
if (unmatchedFactions.length > 0) {
  console.log('  Unmatched BSData factions:')
  for (const { faction } of unmatchedFactions) {
    console.log(`    - "${faction}" (normalized: "${normalizeFactionName(faction)}")`)
  }
}

// ─── Build unit cross-references (name matching within faction) ─────
console.log()
console.log('Building unit cross-references...')

const insertXrefUnit = master.prepare(
  'INSERT OR IGNORE INTO xref_units (bsdata_unit_id, wahapedia_datasheet_id, match_method, match_score) VALUES (?, ?, ?, ?)'
)

const xrefFactions = master.prepare('SELECT bsdata_faction, wahapedia_faction_id FROM xref_factions').all() as {
  bsdata_faction: string
  wahapedia_faction_id: string
}[]

let unitMatches = 0
let unitTotal = 0

for (const { bsdata_faction, wahapedia_faction_id } of xrefFactions) {
  const bsUnits = master.prepare('SELECT id, name FROM b_units WHERE faction = ?').all(bsdata_faction) as {
    id: string
    name: string
  }[]
  const waDatasheets = master.prepare('SELECT id, name FROM w_datasheets WHERE faction_id = ?').all(wahapedia_faction_id) as {
    id: string
    name: string
  }[]

  // Build lookup: normalized name -> wahapedia datasheet
  const waLookup = new Map<string, { id: string; name: string }>()
  for (const ds of waDatasheets) {
    waLookup.set(ds.name.toLowerCase().trim(), ds)
  }

  for (const unit of bsUnits) {
    unitTotal++
    const normalizedName = unit.name.toLowerCase().trim()

    // Exact match
    const exactMatch = waLookup.get(normalizedName)
    if (exactMatch) {
      insertXrefUnit.run(unit.id, exactMatch.id, 'exact', 1.0)
      unitMatches++
      continue
    }

    // Try without trailing suffixes (e.g., " (Legends)")
    const withoutSuffix = normalizedName.replace(/\s*\(.*?\)\s*$/, '').trim()
    const suffixMatch = waLookup.get(withoutSuffix)
    if (suffixMatch) {
      insertXrefUnit.run(unit.id, suffixMatch.id, 'suffix-strip', 0.9)
      unitMatches++
      continue
    }

    // Try with common variations
    const variations = [
      normalizedName.replace(/'/, "'"),
      normalizedName.replace(/'/, "'"),
      normalizedName.replace(/ - /, ' '),
    ]
    let found = false
    for (const v of variations) {
      const varMatch = waLookup.get(v)
      if (varMatch) {
        insertXrefUnit.run(unit.id, varMatch.id, 'variation', 0.8)
        unitMatches++
        found = true
        break
      }
    }
    if (found) continue
  }
}

console.log(`  Matched ${unitMatches}/${unitTotal} BSData units to Wahapedia datasheets`)

// ─── Extract game rules from weapon abilities ───────────────────────
console.log()
console.log('Extracting game rules...')

const ruleTypes = [
  'SUSTAINED_HITS', 'LETHAL_HITS', 'DEVASTATING_WOUNDS', 'TORRENT',
  'TWIN_LINKED', 'BLAST', 'REROLL_HITS_OF_1', 'REROLL_HITS',
  'REROLL_WOUNDS', 'HIT_MOD', 'WOUND_MOD', 'STRENGTH_MOD', 'ATTACKS_MOD',
  'ANTI', 'HAZARDOUS', 'MELTA', 'RAPID_FIRE', 'ASSAULT', 'HEAVY',
  'INDIRECT_FIRE', 'IGNORES_COVER', 'PRECISION', 'PISTOL',
  'LANCE', 'EXTRA_ATTACKS', 'ONE_SHOT',
]

const insertRule = master.prepare('INSERT OR IGNORE INTO game_rules (name, description, source) VALUES (?, ?, ?)')

for (const rule of ruleTypes) {
  insertRule.run(rule, `Weapon ability: ${rule}`, 'weapon_ability')
}

// Core abilities from Wahapedia
const coreAbilities = master.prepare(
  "SELECT DISTINCT name FROM w_datasheet_abilities WHERE type = 'Core'"
).all() as { name: string }[]

for (const { name } of coreAbilities) {
  insertRule.run(name, `Core ability`, 'core_ability')
}

// Faction abilities
const factionAbilities = master.prepare(
  "SELECT DISTINCT name FROM w_datasheet_abilities WHERE type = 'Faction'"
).all() as { name: string }[]

for (const { name } of factionAbilities) {
  insertRule.run(name, `Faction ability`, 'faction_ability')
}

const ruleCount = (master.prepare('SELECT COUNT(*) as c FROM game_rules').get() as { c: number }).c
console.log(`  ${ruleCount} game rules extracted`)

// ─── Link game rules to units ───────────────────────────────────────
console.log()
console.log('Linking game rules to units...')

const insertUnitRule = master.prepare(
  'INSERT INTO unit_rules (rule_id, wahapedia_datasheet_id, bsdata_unit_id) VALUES (?, ?, ?)'
)

// Link Wahapedia abilities to datasheets
const waAbilityLinks = master.prepare(`
  SELECT da.datasheet_id, gr.id as rule_id
  FROM w_datasheet_abilities da
  JOIN game_rules gr ON gr.name = da.name
  WHERE da.type IN ('Core', 'Faction')
`).all() as { datasheet_id: string; rule_id: number }[]

const linkTx = master.transaction(() => {
  for (const { datasheet_id, rule_id } of waAbilityLinks) {
    insertUnitRule.run(rule_id, datasheet_id, null)
  }
})
linkTx()
console.log(`  ${waAbilityLinks.length} Wahapedia ability-to-unit links`)

// Link BSData weapon abilities to units
const bsWeaponAbilityLinks = master.prepare(`
  SELECT DISTINCT bu.id as unit_id, gr.id as rule_id
  FROM b_weapon_abilities bwa
  JOIN b_weapons bw ON bw.id = bwa.weapon_id
  JOIN b_units bu ON bu.id = bw.unit_id
  JOIN game_rules gr ON gr.name = bwa.type
`).all() as { unit_id: string; rule_id: number }[]

const bsLinkTx = master.transaction(() => {
  for (const { unit_id, rule_id } of bsWeaponAbilityLinks) {
    insertUnitRule.run(rule_id, null, unit_id)
  }
})
bsLinkTx()
console.log(`  ${bsWeaponAbilityLinks.length} BSData weapon-ability-to-unit links`)

// ─── Validation report ──────────────────────────────────────────────
console.log()
console.log('═══════════════════════════════════════════')
console.log('  VALIDATION REPORT')
console.log('═══════════════════════════════════════════')
console.log()

// Count tables
const tables = master.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
).all() as { name: string }[]
console.log(`Tables: ${tables.length}`)
for (const { name } of tables) {
  const count = (master.prepare(`SELECT COUNT(*) as c FROM "${name}"`).get() as { c: number }).c
  console.log(`  ${name}: ${count} rows`)
}

// FK integrity checks
console.log()
console.log('Foreign key integrity:')
const fkViolations = master.pragma('foreign_key_check') as { table: string; rowid: number; parent: string; fkid: number }[]
if (fkViolations.length === 0) {
  console.log('  ✓ No foreign key violations')
} else {
  console.log(`  ✗ ${fkViolations.length} foreign key violations:`)
  const grouped = new Map<string, number>()
  for (const v of fkViolations) {
    const key = `${v.table} -> ${v.parent}`
    grouped.set(key, (grouped.get(key) || 0) + 1)
  }
  for (const [key, count] of grouped) {
    console.log(`    ${key}: ${count} violations`)
  }
}

// Cross-reference coverage
console.log()
console.log('Cross-reference coverage:')
const totalBsUnits = (master.prepare('SELECT COUNT(*) as c FROM b_units').get() as { c: number }).c
const matchedBsUnits = (master.prepare('SELECT COUNT(DISTINCT bsdata_unit_id) as c FROM xref_units').get() as { c: number }).c
const totalWaDatasheets = (master.prepare('SELECT COUNT(*) as c FROM w_datasheets').get() as { c: number }).c
const matchedWaDatasheets = (master.prepare('SELECT COUNT(DISTINCT wahapedia_datasheet_id) as c FROM xref_units').get() as { c: number }).c
console.log(`  BSData units matched: ${matchedBsUnits}/${totalBsUnits} (${(matchedBsUnits / totalBsUnits * 100).toFixed(1)}%)`)
console.log(`  Wahapedia datasheets matched: ${matchedWaDatasheets}/${totalWaDatasheets} (${(matchedWaDatasheets / totalWaDatasheets * 100).toFixed(1)}%)`)

// Per-faction validation: can we find everything for each faction?
console.log()
console.log('Per-faction data completeness (Wahapedia):')
const waFactionList = master.prepare('SELECT id, name FROM w_factions ORDER BY name').all() as { id: string; name: string }[]
let completeCount = 0
for (const { id, name } of waFactionList) {
  const ds = (master.prepare('SELECT COUNT(*) as c FROM w_datasheets WHERE faction_id = ?').get(id) as { c: number }).c
  const det = (master.prepare('SELECT COUNT(*) as c FROM w_detachments WHERE faction_id = ?').get(id) as { c: number }).c
  const strat = (master.prepare('SELECT COUNT(*) as c FROM w_stratagems WHERE faction_id = ?').get(id) as { c: number }).c
  const enh = (master.prepare('SELECT COUNT(*) as c FROM w_enhancements WHERE faction_id = ?').get(id) as { c: number }).c
  const wargear = (master.prepare(`
    SELECT COUNT(*) as c FROM w_datasheet_wargear dw
    JOIN w_datasheets d ON d.id = dw.datasheet_id
    WHERE d.faction_id = ?
  `).get(id) as { c: number }).c
  const models = (master.prepare(`
    SELECT COUNT(*) as c FROM w_datasheet_models dm
    JOIN w_datasheets d ON d.id = dm.datasheet_id
    WHERE d.faction_id = ?
  `).get(id) as { c: number }).c
  const costs = (master.prepare(`
    SELECT COUNT(*) as c FROM w_datasheet_models_cost dc
    JOIN w_datasheets d ON d.id = dc.datasheet_id
    WHERE d.faction_id = ?
  `).get(id) as { c: number }).c
  const leaders = (master.prepare(`
    SELECT COUNT(*) as c FROM w_datasheet_leaders dl
    JOIN w_datasheets d ON d.id = dl.leader_id
    WHERE d.faction_id = ?
  `).get(id) as { c: number }).c

  const complete = ds > 0 && det > 0 && wargear > 0 && models > 0 && costs > 0
  if (complete) completeCount++

  const status = complete ? '✓' : '✗'
  console.log(`  ${status} ${name}: ${ds} units, ${det} detachments, ${strat} stratagems, ${enh} enhancements, ${wargear} weapons, ${models} models, ${costs} costs, ${leaders} leaders`)
}
console.log(`  ${completeCount}/${waFactionList.length} factions have complete data`)

// Game rules coverage
console.log()
console.log('Game rules:')
const totalRules = (master.prepare('SELECT COUNT(*) as c FROM game_rules').get() as { c: number }).c
const linkedRules = (master.prepare('SELECT COUNT(DISTINCT rule_id) as c FROM unit_rules').get() as { c: number }).c
const totalUnitRuleLinks = (master.prepare('SELECT COUNT(*) as c FROM unit_rules').get() as { c: number }).c
console.log(`  Total rules: ${totalRules}`)
console.log(`  Rules linked to units: ${linkedRules}`)
console.log(`  Total unit-rule links: ${totalUnitRuleLinks}`)

console.log()
console.log('Master database created successfully!')

// Close databases
waha.close()
bsd.close()
master.close()

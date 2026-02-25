import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import Database from 'better-sqlite3'
import { eq, sql } from 'drizzle-orm'
import type {
  Faction,
  Datasheet,
  DatasheetModel,
  Ability,
  Stratagem,
  DetachmentAbility,
  Enhancement,
  WargearItem,
  DatasheetAbility,
  DatasheetUnitComposition,
  DatasheetWargear,
  SourceEntry,
  ParsedData,
} from './types'

// --- Drizzle schema ---

export const factions = sqliteTable('factions', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  link: text('link').notNull().default(''),
})

export const datasheets = sqliteTable('datasheets', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  faction_id: text('faction_id').notNull(),
  source_id: text('source_id').notNull().default(''),
  role: text('role').notNull().default(''),
  unit_composition: text('unit_composition').notNull().default(''),
  transport: text('transport').notNull().default(''),
  virtual: text('virtual').notNull().default(''),
  cost: text('cost').notNull().default(''),
  cost_per_unit: text('cost_per_unit').notNull().default(''),
})

export const datasheetModels = sqliteTable('datasheet_models', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  datasheet_id: text('datasheet_id').notNull(),
  line: text('line').notNull().default(''),
  name: text('name').notNull(),
  M: text('M').notNull().default(''),
  T: text('T').notNull().default(''),
  SV: text('SV').notNull().default(''),
  W: text('W').notNull().default(''),
  LD: text('LD').notNull().default(''),
  OC: text('OC').notNull().default(''),
  base_size: text('base_size').notNull().default(''),
  invul_save: text('invul_save').notNull().default(''),
})

export const abilities = sqliteTable('abilities', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  legend: text('legend').notNull().default(''),
  faction_id: text('faction_id').notNull().default(''),
  description: text('description').notNull().default(''),
  type: text('type').notNull().default(''),
  parameter: text('parameter').notNull().default(''),
})

export const datasheetAbilities = sqliteTable('datasheet_abilities', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  datasheet_id: text('datasheet_id').notNull(),
  line: text('line').notNull().default(''),
  ability_id: text('ability_id').notNull(),
  is_index_key: text('is_index_key').notNull().default(''),
  cost: text('cost').notNull().default(''),
  model_id: text('model_id').notNull().default(''),
})

export const datasheetUnitComposition = sqliteTable('datasheet_unit_composition', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  datasheet_id: text('datasheet_id').notNull(),
  line: text('line').notNull().default(''),
  description: text('description').notNull().default(''),
})

export const datasheetWargear = sqliteTable('datasheet_wargear', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  datasheet_id: text('datasheet_id').notNull(),
  line: text('line').notNull().default(''),
  wargear_id: text('wargear_id').notNull(),
  is_index_key: text('is_index_key').notNull().default(''),
  model_id: text('model_id').notNull().default(''),
  cost: text('cost').notNull().default(''),
})

export const stratagems = sqliteTable('stratagems', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull().default(''),
  cp_cost: text('cp_cost').notNull().default(''),
  legend: text('legend').notNull().default(''),
  turn: text('turn').notNull().default(''),
  phase: text('phase').notNull().default(''),
  description: text('description').notNull().default(''),
  faction_id: text('faction_id').notNull().default(''),
  detachment_id: text('detachment_id').notNull().default(''),
  source_id: text('source_id').notNull().default(''),
})

export const detachmentAbilities = sqliteTable('detachment_abilities', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  legend: text('legend').notNull().default(''),
  faction_id: text('faction_id').notNull().default(''),
  description: text('description').notNull().default(''),
  detachment_id: text('detachment_id').notNull().default(''),
  type: text('type').notNull().default(''),
})

export const enhancements = sqliteTable('enhancements', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  faction_id: text('faction_id').notNull().default(''),
  detachment_id: text('detachment_id').notNull().default(''),
  cost: text('cost').notNull().default(''),
  source_id: text('source_id').notNull().default(''),
  is_index_key: text('is_index_key').notNull().default(''),
})

export const wargearList = sqliteTable('wargear_list', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull().default(''),
  faction_id: text('faction_id').notNull().default(''),
  description: text('description').notNull().default(''),
  range: text('range').notNull().default(''),
  A: text('A').notNull().default(''),
  BS_WS: text('BS_WS').notNull().default(''),
  S: text('S').notNull().default(''),
  AP: text('AP').notNull().default(''),
  D: text('D').notNull().default(''),
  is_index_key: text('is_index_key').notNull().default(''),
  source_id: text('source_id').notNull().default(''),
})

export const sources = sqliteTable('sources', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull().default(''),
  edition: text('edition').notNull().default(''),
})

const schema = {
  factions,
  datasheets,
  datasheetModels,
  abilities,
  datasheetAbilities,
  datasheetUnitComposition,
  datasheetWargear,
  stratagems,
  detachmentAbilities,
  enhancements,
  wargearList,
  sources,
}

export type WahapediaDb = ReturnType<typeof createWahapediaDb>

export function createWahapediaDb(dbPath: string) {
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  return drizzle(sqlite, { schema })
}

export function createTables(dbPath: string): void {
  const sqlite = new Database(dbPath)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS factions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      link TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS datasheets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      faction_id TEXT NOT NULL,
      source_id TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT '',
      unit_composition TEXT NOT NULL DEFAULT '',
      transport TEXT NOT NULL DEFAULT '',
      virtual TEXT NOT NULL DEFAULT '',
      cost TEXT NOT NULL DEFAULT '',
      cost_per_unit TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS datasheet_models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      datasheet_id TEXT NOT NULL,
      line TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      M TEXT NOT NULL DEFAULT '',
      T TEXT NOT NULL DEFAULT '',
      SV TEXT NOT NULL DEFAULT '',
      W TEXT NOT NULL DEFAULT '',
      LD TEXT NOT NULL DEFAULT '',
      OC TEXT NOT NULL DEFAULT '',
      base_size TEXT NOT NULL DEFAULT '',
      invul_save TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS abilities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      legend TEXT NOT NULL DEFAULT '',
      faction_id TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT '',
      parameter TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS datasheet_abilities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      datasheet_id TEXT NOT NULL,
      line TEXT NOT NULL DEFAULT '',
      ability_id TEXT NOT NULL,
      is_index_key TEXT NOT NULL DEFAULT '',
      cost TEXT NOT NULL DEFAULT '',
      model_id TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS datasheet_unit_composition (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      datasheet_id TEXT NOT NULL,
      line TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS datasheet_wargear (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      datasheet_id TEXT NOT NULL,
      line TEXT NOT NULL DEFAULT '',
      wargear_id TEXT NOT NULL,
      is_index_key TEXT NOT NULL DEFAULT '',
      model_id TEXT NOT NULL DEFAULT '',
      cost TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS stratagems (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT '',
      cp_cost TEXT NOT NULL DEFAULT '',
      legend TEXT NOT NULL DEFAULT '',
      turn TEXT NOT NULL DEFAULT '',
      phase TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      faction_id TEXT NOT NULL DEFAULT '',
      detachment_id TEXT NOT NULL DEFAULT '',
      source_id TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS detachment_abilities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      legend TEXT NOT NULL DEFAULT '',
      faction_id TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      detachment_id TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS enhancements (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      faction_id TEXT NOT NULL DEFAULT '',
      detachment_id TEXT NOT NULL DEFAULT '',
      cost TEXT NOT NULL DEFAULT '',
      source_id TEXT NOT NULL DEFAULT '',
      is_index_key TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS wargear_list (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT '',
      faction_id TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      range TEXT NOT NULL DEFAULT '',
      A TEXT NOT NULL DEFAULT '',
      BS_WS TEXT NOT NULL DEFAULT '',
      S TEXT NOT NULL DEFAULT '',
      AP TEXT NOT NULL DEFAULT '',
      D TEXT NOT NULL DEFAULT '',
      is_index_key TEXT NOT NULL DEFAULT '',
      source_id TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT '',
      edition TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_datasheets_faction ON datasheets(faction_id);
    CREATE INDEX IF NOT EXISTS idx_datasheet_models_ds ON datasheet_models(datasheet_id);
    CREATE INDEX IF NOT EXISTS idx_datasheet_abilities_ds ON datasheet_abilities(datasheet_id);
    CREATE INDEX IF NOT EXISTS idx_datasheet_uc_ds ON datasheet_unit_composition(datasheet_id);
    CREATE INDEX IF NOT EXISTS idx_datasheet_wargear_ds ON datasheet_wargear(datasheet_id);
    CREATE INDEX IF NOT EXISTS idx_abilities_faction ON abilities(faction_id);
    CREATE INDEX IF NOT EXISTS idx_stratagems_faction ON stratagems(faction_id);
    CREATE INDEX IF NOT EXISTS idx_detachment_abilities_faction ON detachment_abilities(faction_id);
    CREATE INDEX IF NOT EXISTS idx_enhancements_faction ON enhancements(faction_id);
    CREATE INDEX IF NOT EXISTS idx_wargear_faction ON wargear_list(faction_id);
  `)
  sqlite.close()
}

/**
 * Drop all rows and re-insert from parsed data.
 * Uses a transaction for atomicity.
 */
export function importData(dbPath: string, data: ParsedData): void {
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')

  const tables = [
    'factions', 'datasheets', 'datasheet_models', 'abilities',
    'datasheet_abilities', 'datasheet_unit_composition', 'datasheet_wargear',
    'stratagems', 'detachment_abilities', 'enhancements', 'wargear_list', 'sources',
  ]

  const insertMany = sqlite.transaction(() => {
    // Drop all rows
    for (const table of tables) {
      sqlite.exec(`DELETE FROM ${table}`)
    }

    // Insert factions
    const insertFaction = sqlite.prepare(
      'INSERT INTO factions (id, name, link) VALUES (?, ?, ?)',
    )
    for (const row of data.factions) {
      insertFaction.run(row.id, row.name, row.link ?? '')
    }

    // Insert datasheets
    const insertDatasheet = sqlite.prepare(
      'INSERT INTO datasheets (id, name, faction_id, source_id, role, unit_composition, transport, virtual, cost, cost_per_unit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    for (const row of data.datasheets) {
      insertDatasheet.run(
        row.id, row.name, row.faction_id, row.source_id ?? '', row.role ?? '',
        row.unit_composition ?? '', row.transport ?? '', row.virtual ?? '',
        row.cost ?? '', row.cost_per_unit ?? '',
      )
    }

    // Insert datasheet models
    const insertModel = sqlite.prepare(
      'INSERT INTO datasheet_models (datasheet_id, line, name, M, T, SV, W, LD, OC, base_size, invul_save) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    for (const row of data.datasheetModels) {
      insertModel.run(
        row.datasheet_id, row.line ?? '', row.name, row.M ?? '', row.T ?? '',
        row.SV ?? '', row.W ?? '', row.LD ?? '', row.OC ?? '',
        row.base_size ?? '', row.invul_save ?? '',
      )
    }

    // Insert abilities
    const insertAbility = sqlite.prepare(
      'INSERT INTO abilities (id, name, legend, faction_id, description, type, parameter) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    for (const row of data.abilities) {
      insertAbility.run(
        row.id, row.name, row.legend ?? '', row.faction_id ?? '',
        row.description ?? '', row.type ?? '', row.parameter ?? '',
      )
    }

    // Insert datasheet abilities
    const insertDsAbility = sqlite.prepare(
      'INSERT INTO datasheet_abilities (datasheet_id, line, ability_id, is_index_key, cost, model_id) VALUES (?, ?, ?, ?, ?, ?)',
    )
    for (const row of data.datasheetAbilities) {
      insertDsAbility.run(
        row.datasheet_id, row.line ?? '', row.ability_id,
        row.is_index_key ?? '', row.cost ?? '', row.model_id ?? '',
      )
    }

    // Insert datasheet unit composition
    const insertUc = sqlite.prepare(
      'INSERT INTO datasheet_unit_composition (datasheet_id, line, description) VALUES (?, ?, ?)',
    )
    for (const row of data.datasheetUnitComposition) {
      insertUc.run(row.datasheet_id, row.line ?? '', row.description ?? '')
    }

    // Insert datasheet wargear
    const insertDsWargear = sqlite.prepare(
      'INSERT INTO datasheet_wargear (datasheet_id, line, wargear_id, is_index_key, model_id, cost) VALUES (?, ?, ?, ?, ?, ?)',
    )
    for (const row of data.datasheetWargear) {
      insertDsWargear.run(
        row.datasheet_id, row.line ?? '', row.wargear_id,
        row.is_index_key ?? '', row.model_id ?? '', row.cost ?? '',
      )
    }

    // Insert stratagems
    const insertStrat = sqlite.prepare(
      'INSERT INTO stratagems (id, name, type, cp_cost, legend, turn, phase, description, faction_id, detachment_id, source_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    for (const row of data.stratagems) {
      insertStrat.run(
        row.id, row.name, row.type ?? '', row.cp_cost ?? '', row.legend ?? '',
        row.turn ?? '', row.phase ?? '', row.description ?? '',
        row.faction_id ?? '', row.detachment_id ?? '', row.source_id ?? '',
      )
    }

    // Insert detachment abilities
    const insertDetach = sqlite.prepare(
      'INSERT INTO detachment_abilities (id, name, legend, faction_id, description, detachment_id, type) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    for (const row of data.detachmentAbilities) {
      insertDetach.run(
        row.id, row.name, row.legend ?? '', row.faction_id ?? '',
        row.description ?? '', row.detachment_id ?? '', row.type ?? '',
      )
    }

    // Insert enhancements
    const insertEnh = sqlite.prepare(
      'INSERT INTO enhancements (id, name, description, faction_id, detachment_id, cost, source_id, is_index_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    for (const row of data.enhancements) {
      insertEnh.run(
        row.id, row.name, row.description ?? '', row.faction_id ?? '',
        row.detachment_id ?? '', row.cost ?? '', row.source_id ?? '',
        row.is_index_key ?? '',
      )
    }

    // Insert wargear list
    const insertWargear = sqlite.prepare(
      'INSERT INTO wargear_list (id, name, type, faction_id, description, range, A, BS_WS, S, AP, D, is_index_key, source_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    for (const row of data.wargearList) {
      insertWargear.run(
        row.id, row.name, row.type ?? '', row.faction_id ?? '',
        row.description ?? '', row.range ?? '', row.A ?? '', row.BS_WS ?? '',
        row.S ?? '', row.AP ?? '', row.D ?? '', row.is_index_key ?? '',
        row.source_id ?? '',
      )
    }

    // Insert sources
    const insertSource = sqlite.prepare(
      'INSERT INTO sources (id, name, type, edition) VALUES (?, ?, ?, ?)',
    )
    for (const row of data.sources) {
      insertSource.run(row.id, row.name, row.type ?? '', row.edition ?? '')
    }
  })

  insertMany()
  sqlite.close()
}

/**
 * Query helpers for reading data back out.
 */
export function getFactions(dbPath: string): Faction[] {
  const sqlite = new Database(dbPath, { readonly: true })
  const rows = sqlite.prepare('SELECT * FROM factions ORDER BY name').all() as Faction[]
  sqlite.close()
  return rows
}

export function getDatasheetsByFaction(dbPath: string, factionId: string): Datasheet[] {
  const sqlite = new Database(dbPath, { readonly: true })
  const rows = sqlite
    .prepare('SELECT * FROM datasheets WHERE faction_id = ? ORDER BY name')
    .all(factionId) as Datasheet[]
  sqlite.close()
  return rows
}

export function getModelsForDatasheet(dbPath: string, datasheetId: string): DatasheetModel[] {
  const sqlite = new Database(dbPath, { readonly: true })
  const rows = sqlite
    .prepare('SELECT * FROM datasheet_models WHERE datasheet_id = ? ORDER BY line')
    .all(datasheetId) as DatasheetModel[]
  sqlite.close()
  return rows
}

export function getAbilitiesForDatasheet(
  dbPath: string,
  datasheetId: string,
): (DatasheetAbility & { ability_name?: string; ability_description?: string })[] {
  const sqlite = new Database(dbPath, { readonly: true })
  const rows = sqlite
    .prepare(`
      SELECT da.*, a.name as ability_name, a.description as ability_description
      FROM datasheet_abilities da
      LEFT JOIN abilities a ON da.ability_id = a.id
      WHERE da.datasheet_id = ?
      ORDER BY da.line
    `)
    .all(datasheetId) as (DatasheetAbility & { ability_name?: string; ability_description?: string })[]
  sqlite.close()
  return rows
}

export function getWargearForDatasheet(
  dbPath: string,
  datasheetId: string,
): (DatasheetWargear & { wargear_name?: string; wargear_type?: string; range?: string; A?: string; BS_WS?: string; S?: string; AP?: string; D?: string })[] {
  const sqlite = new Database(dbPath, { readonly: true })
  const rows = sqlite
    .prepare(`
      SELECT dw.*, w.name as wargear_name, w.type as wargear_type,
             w.range, w.A, w.BS_WS, w.S, w.AP, w.D
      FROM datasheet_wargear dw
      LEFT JOIN wargear_list w ON dw.wargear_id = w.id
      WHERE dw.datasheet_id = ?
      ORDER BY dw.line
    `)
    .all(datasheetId) as (DatasheetWargear & { wargear_name?: string })[]
  sqlite.close()
  return rows
}

export function getStratagemsByFaction(dbPath: string, factionId: string): Stratagem[] {
  const sqlite = new Database(dbPath, { readonly: true })
  const rows = sqlite
    .prepare('SELECT * FROM stratagems WHERE faction_id = ? ORDER BY name')
    .all(factionId) as Stratagem[]
  sqlite.close()
  return rows
}

export function getEnhancementsByFaction(dbPath: string, factionId: string): Enhancement[] {
  const sqlite = new Database(dbPath, { readonly: true })
  const rows = sqlite
    .prepare('SELECT * FROM enhancements WHERE faction_id = ? ORDER BY name')
    .all(factionId) as Enhancement[]
  sqlite.close()
  return rows
}

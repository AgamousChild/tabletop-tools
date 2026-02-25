/** Known Wahapedia CSV file names */
export const CSV_FILES = [
  'Last_update',
  'Factions',
  'Datasheets',
  'Datasheets_models',
  'Datasheets_abilities',
  'Datasheets_unit_composition',
  'Datasheets_wargear',
  'Abilities',
  'Stratagems',
  'Detachment_abilities',
  'Enhancements',
  'Wargear_list',
  'Source',
] as const

export type CsvFileName = (typeof CSV_FILES)[number]

export const WAHAPEDIA_BASE_URL = 'https://wahapedia.ru/wh40k10ed'

/** Shape of each CSV file's rows */
export interface Faction {
  id: string
  name: string
  link: string
}

export interface Datasheet {
  id: string
  name: string
  faction_id: string
  source_id: string
  role: string
  unit_composition: string
  transport: string
  virtual: string
  cost: string
  cost_per_unit: string
}

export interface DatasheetModel {
  datasheet_id: string
  line: string
  name: string
  M: string
  T: string
  SV: string
  W: string
  LD: string
  OC: string
  base_size: string
  invul_save: string
}

export interface DatasheetAbility {
  datasheet_id: string
  line: string
  ability_id: string
  is_index_key: string
  cost: string
  model_id: string
}

export interface DatasheetUnitComposition {
  datasheet_id: string
  line: string
  description: string
}

export interface DatasheetWargear {
  datasheet_id: string
  line: string
  wargear_id: string
  is_index_key: string
  model_id: string
  cost: string
}

export interface Ability {
  id: string
  name: string
  legend: string
  faction_id: string
  description: string
  type: string
  parameter: string
}

export interface Stratagem {
  id: string
  name: string
  type: string
  cp_cost: string
  legend: string
  turn: string
  phase: string
  description: string
  faction_id: string
  detachment_id: string
  source_id: string
}

export interface DetachmentAbility {
  id: string
  name: string
  legend: string
  faction_id: string
  description: string
  detachment_id: string
  type: string
}

export interface Enhancement {
  id: string
  name: string
  description: string
  faction_id: string
  detachment_id: string
  cost: string
  source_id: string
  is_index_key: string
}

export interface WargearItem {
  id: string
  name: string
  type: string
  faction_id: string
  description: string
  range: string
  A: string
  BS_WS: string
  S: string
  AP: string
  D: string
  is_index_key: string
  source_id: string
}

export interface SourceEntry {
  id: string
  name: string
  type: string
  edition: string
}

export interface LastUpdate {
  last_update: string
}

export interface SyncMetadata {
  lastUpdate: string | null
  lastSyncedAt: string | null
  csvFiles: Record<string, { downloadedAt: string; rowCount: number }>
}

export interface ParsedData {
  factions: Faction[]
  datasheets: Datasheet[]
  datasheetModels: DatasheetModel[]
  datasheetAbilities: DatasheetAbility[]
  datasheetUnitComposition: DatasheetUnitComposition[]
  datasheetWargear: DatasheetWargear[]
  abilities: Ability[]
  stratagems: Stratagem[]
  detachmentAbilities: DetachmentAbility[]
  enhancements: Enhancement[]
  wargearList: WargearItem[]
  sources: SourceEntry[]
}

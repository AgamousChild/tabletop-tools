import type { UnitProfile } from '@tabletop-tools/game-content'

const DB_NAME = 'tabletop-tools-game-data'
const DB_VERSION = 7
const UNITS_STORE = 'units'
const META_STORE = 'meta'
const LISTS_STORE = 'lists'
const LIST_UNITS_STORE = 'list_units'
const DETACHMENTS_STORE = 'detachments'
const DETACHMENT_ABILITIES_STORE = 'detachment_abilities'
const STRATAGEMS_STORE = 'stratagems'
const ENHANCEMENTS_STORE = 'enhancements'
const LEADER_ATTACHMENTS_STORE = 'leader_attachments'
const UNIT_COMPOSITIONS_STORE = 'unit_compositions'
const UNIT_COSTS_STORE = 'unit_costs'
const WARGEAR_OPTIONS_STORE = 'wargear_options'
const UNIT_KEYWORDS_STORE = 'unit_keywords'
const UNIT_ABILITIES_STORE = 'unit_abilities'
const MISSIONS_STORE = 'missions'
const DATASHEETS_STORE = 'datasheets'
const DATASHEET_WARGEAR_STORE = 'datasheet_wargear'
const DATASHEET_MODELS_STORE = 'datasheet_models'
const ABILITIES_STORE = 'abilities'
const DATASHEET_STRATAGEMS_STORE = 'datasheet_stratagems'
const DATASHEET_ENHANCEMENTS_STORE = 'datasheet_enhancements'
const DATASHEET_DETACHMENT_ABILITIES_STORE = 'datasheet_detachment_abilities'

const ALL_STORES = [
  UNITS_STORE, META_STORE, LISTS_STORE, LIST_UNITS_STORE,
  DETACHMENTS_STORE, DETACHMENT_ABILITIES_STORE, STRATAGEMS_STORE,
  ENHANCEMENTS_STORE, LEADER_ATTACHMENTS_STORE, UNIT_COMPOSITIONS_STORE,
  UNIT_COSTS_STORE, WARGEAR_OPTIONS_STORE, UNIT_KEYWORDS_STORE,
  UNIT_ABILITIES_STORE, MISSIONS_STORE, DATASHEETS_STORE,
  DATASHEET_WARGEAR_STORE, DATASHEET_MODELS_STORE,
  ABILITIES_STORE, DATASHEET_STRATAGEMS_STORE,
  DATASHEET_ENHANCEMENTS_STORE, DATASHEET_DETACHMENT_ABILITIES_STORE,
]

const GAME_RULES_STORES = [
  DETACHMENTS_STORE, DETACHMENT_ABILITIES_STORE, STRATAGEMS_STORE,
  ENHANCEMENTS_STORE, LEADER_ATTACHMENTS_STORE, UNIT_COMPOSITIONS_STORE,
  UNIT_COSTS_STORE, WARGEAR_OPTIONS_STORE, UNIT_KEYWORDS_STORE,
  UNIT_ABILITIES_STORE, MISSIONS_STORE, DATASHEETS_STORE,
  DATASHEET_WARGEAR_STORE, DATASHEET_MODELS_STORE,
  ABILITIES_STORE, DATASHEET_STRATAGEMS_STORE,
  DATASHEET_ENHANCEMENTS_STORE, DATASHEET_DETACHMENT_ABILITIES_STORE,
]

// ── Types ────────────────────────────────────────────────────────────────────

export interface ImportMeta {
  lastImport: number
  factions: string[]
  totalUnits: number
  parserVersion?: number
  commitSha?: string
}

export interface RulesImportMeta {
  lastImport: number
  counts: {
    detachments: number
    stratagems: number
    enhancements: number
    leaderAttachments: number
    unitCompositions: number
    unitCosts: number
    wargearOptions: number
    unitKeywords: number
    unitAbilities: number
    missions: number
    abilities: number
    datasheetStratagems: number
    datasheetEnhancements: number
    datasheetDetachmentAbilities: number
  }
}

export interface LocalList {
  id: string
  faction: string
  name: string
  description?: string
  detachment?: string
  battleSize?: number
  totalPts: number
  createdAt: number
  updatedAt: number
}

export interface LocalListUnit {
  id: string
  listId: string
  unitContentId: string
  unitName: string
  unitPoints: number
  modelCount?: number
  count: number
  isWarlord?: boolean
  enhancementId?: string
  enhancementName?: string
  enhancementCost?: number
}

export interface Detachment {
  id: string
  factionId: string
  name: string
  legend: string
  type: string
}

export interface DetachmentAbility {
  id: string
  detachmentId: string
  factionId: string
  name: string
  legend: string
  description: string
}

export interface Stratagem {
  id: string
  factionId: string
  detachmentId: string
  name: string
  type: string
  cpCost: string
  turn: string
  phase: string
  legend: string
  description: string
}

export interface Enhancement {
  id: string
  factionId: string
  detachmentId: string
  name: string
  legend: string
  description: string
  cost: string
}

export interface LeaderAttachment {
  id: string
  leaderId: string
  attachedId: string
}

export interface UnitComposition {
  id: string
  datasheetId: string
  line: string
  description: string
}

export interface UnitCost {
  id: string
  datasheetId: string
  line: string
  description: string
  cost: string
}

export interface WargearOption {
  id: string
  datasheetId: string
  line: string
  description: string
}

export interface UnitKeyword {
  id: string
  datasheetId: string
  keyword: string
  isFactionKeyword: boolean
}

export interface UnitAbility {
  id: string
  datasheetId: string
  name: string
  description: string
  type: string
  abilityId?: string
  parameter?: string
}

export interface Mission {
  id: string
  name: string
  type: string
  description: string
}

export interface Datasheet {
  id: string
  name: string
  factionId: string
  role: string
  legend: string
  transport: string
  loadout: string
  damagedW: string
  damagedDescription: string
}

export interface DatasheetWargear {
  id: number
  datasheetId: string
  name: string
  description: string
  range: string
  type: string
  attacks: string
  skill: string
  strength: string
  ap: string
  damage: string
}

export interface DatasheetModel {
  id: number
  datasheetId: string
  name: string
  move: string
  toughness: string
  save: string
  wounds: string
  leadership: string
  oc: string
  invSv: string
  invSvDescription: string
  baseSize: string
}

export interface Ability {
  id: string
  name: string
  legend: string
  factionId: string
  description: string
}

export interface DatasheetStratagem {
  id: number
  datasheetId: string
  stratagemId: string
}

export interface DatasheetEnhancement {
  id: number
  datasheetId: string
  enhancementId: string
}

export interface DatasheetDetachmentAbility {
  id: number
  datasheetId: string
  detachmentAbilityId: string
}

// ── Database ─────────────────────────────────────────────────────────────────

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      // V1 stores
      if (!db.objectStoreNames.contains(UNITS_STORE)) {
        const store = db.createObjectStore(UNITS_STORE, { keyPath: 'id' })
        store.createIndex('faction', 'faction', { unique: false })
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE)
      }
      // V2 stores
      if (!db.objectStoreNames.contains(LISTS_STORE)) {
        db.createObjectStore(LISTS_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(LIST_UNITS_STORE)) {
        const luStore = db.createObjectStore(LIST_UNITS_STORE, { keyPath: 'id' })
        luStore.createIndex('listId', 'listId', { unique: false })
      }
      // V3 stores — game rules data
      if (!db.objectStoreNames.contains(DETACHMENTS_STORE)) {
        const s = db.createObjectStore(DETACHMENTS_STORE, { keyPath: 'id' })
        s.createIndex('factionId', 'factionId', { unique: false })
      }
      if (!db.objectStoreNames.contains(DETACHMENT_ABILITIES_STORE)) {
        const s = db.createObjectStore(DETACHMENT_ABILITIES_STORE, { keyPath: 'id' })
        s.createIndex('detachmentId', 'detachmentId', { unique: false })
      }
      if (!db.objectStoreNames.contains(STRATAGEMS_STORE)) {
        const s = db.createObjectStore(STRATAGEMS_STORE, { keyPath: 'id' })
        s.createIndex('factionId', 'factionId', { unique: false })
        s.createIndex('detachmentId', 'detachmentId', { unique: false })
      }
      if (!db.objectStoreNames.contains(ENHANCEMENTS_STORE)) {
        const s = db.createObjectStore(ENHANCEMENTS_STORE, { keyPath: 'id' })
        s.createIndex('detachmentId', 'detachmentId', { unique: false })
      }
      if (!db.objectStoreNames.contains(LEADER_ATTACHMENTS_STORE)) {
        const s = db.createObjectStore(LEADER_ATTACHMENTS_STORE, { keyPath: 'id' })
        s.createIndex('leaderId', 'leaderId', { unique: false })
        s.createIndex('attachedId', 'attachedId', { unique: false })
      } else {
        // V5 upgrade: add attachedId index for reverse lookup
        const tx = req.transaction
        if (tx) {
          const s = tx.objectStore(LEADER_ATTACHMENTS_STORE)
          if (!s.indexNames.contains('attachedId')) {
            s.createIndex('attachedId', 'attachedId', { unique: false })
          }
        }
      }
      if (!db.objectStoreNames.contains(UNIT_COMPOSITIONS_STORE)) {
        const s = db.createObjectStore(UNIT_COMPOSITIONS_STORE, { keyPath: 'id' })
        s.createIndex('datasheetId', 'datasheetId', { unique: false })
      }
      if (!db.objectStoreNames.contains(UNIT_COSTS_STORE)) {
        const s = db.createObjectStore(UNIT_COSTS_STORE, { keyPath: 'id' })
        s.createIndex('datasheetId', 'datasheetId', { unique: false })
      }
      if (!db.objectStoreNames.contains(WARGEAR_OPTIONS_STORE)) {
        const s = db.createObjectStore(WARGEAR_OPTIONS_STORE, { keyPath: 'id' })
        s.createIndex('datasheetId', 'datasheetId', { unique: false })
      }
      if (!db.objectStoreNames.contains(UNIT_KEYWORDS_STORE)) {
        const s = db.createObjectStore(UNIT_KEYWORDS_STORE, { keyPath: 'id' })
        s.createIndex('datasheetId', 'datasheetId', { unique: false })
      }
      if (!db.objectStoreNames.contains(UNIT_ABILITIES_STORE)) {
        const s = db.createObjectStore(UNIT_ABILITIES_STORE, { keyPath: 'id' })
        s.createIndex('datasheetId', 'datasheetId', { unique: false })
      }
      if (!db.objectStoreNames.contains(MISSIONS_STORE)) {
        db.createObjectStore(MISSIONS_STORE, { keyPath: 'id' })
      }
      // V6 stores — datasheets, wargear profiles, model stats
      if (!db.objectStoreNames.contains(DATASHEETS_STORE)) {
        const s = db.createObjectStore(DATASHEETS_STORE, { keyPath: 'id' })
        s.createIndex('factionId', 'factionId', { unique: false })
        s.createIndex('name', 'name', { unique: false })
      }
      if (!db.objectStoreNames.contains(DATASHEET_WARGEAR_STORE)) {
        const s = db.createObjectStore(DATASHEET_WARGEAR_STORE, { keyPath: 'id' })
        s.createIndex('datasheetId', 'datasheetId', { unique: false })
      }
      if (!db.objectStoreNames.contains(DATASHEET_MODELS_STORE)) {
        const s = db.createObjectStore(DATASHEET_MODELS_STORE, { keyPath: 'id' })
        s.createIndex('datasheetId', 'datasheetId', { unique: false })
      }
      // V7 stores — global abilities + junction tables
      if (!db.objectStoreNames.contains(ABILITIES_STORE)) {
        db.createObjectStore(ABILITIES_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(DATASHEET_STRATAGEMS_STORE)) {
        const s = db.createObjectStore(DATASHEET_STRATAGEMS_STORE, { keyPath: 'id' })
        s.createIndex('datasheetId', 'datasheetId', { unique: false })
        s.createIndex('stratagemId', 'stratagemId', { unique: false })
      }
      if (!db.objectStoreNames.contains(DATASHEET_ENHANCEMENTS_STORE)) {
        const s = db.createObjectStore(DATASHEET_ENHANCEMENTS_STORE, { keyPath: 'id' })
        s.createIndex('datasheetId', 'datasheetId', { unique: false })
        s.createIndex('enhancementId', 'enhancementId', { unique: false })
      }
      if (!db.objectStoreNames.contains(DATASHEET_DETACHMENT_ABILITIES_STORE)) {
        const s = db.createObjectStore(DATASHEET_DETACHMENT_ABILITIES_STORE, { keyPath: 'id' })
        s.createIndex('datasheetId', 'datasheetId', { unique: false })
        s.createIndex('detachmentAbilityId', 'detachmentAbilityId', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// ── Internal helpers ─────────────────────────────────────────────────────────

async function batchSave<T>(storeName: string, items: T[]): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    for (const item of items) store.put(item)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

async function getAllFromStore<T>(storeName: string): Promise<T[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const req = tx.objectStore(storeName).getAll()
    req.onsuccess = () => resolve(req.result as T[])
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

async function getByIndex<T>(storeName: string, indexName: string, key: string): Promise<T[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const index = tx.objectStore(storeName).index(indexName)
    const req = index.getAll(IDBKeyRange.only(key))
    req.onsuccess = () => resolve(req.result as T[])
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

async function getOne<T>(storeName: string, id: string): Promise<T | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const req = tx.objectStore(storeName).get(id)
    req.onsuccess = () => resolve((req.result as T | undefined) ?? null)
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

// ── Unit store ───────────────────────────────────────────────────────────────

export async function saveUnits(units: UnitProfile[]): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(UNITS_STORE, 'readwrite')
    const store = tx.objectStore(UNITS_STORE)
    for (const unit of units) {
      store.put(unit)
    }
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
  })
}

export async function getUnit(id: string): Promise<UnitProfile | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(UNITS_STORE, 'readonly')
    const req = tx.objectStore(UNITS_STORE).get(id)
    req.onsuccess = () => resolve((req.result as UnitProfile | undefined) ?? null)
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

export async function searchUnits(query: { faction?: string; name?: string }): Promise<UnitProfile[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(UNITS_STORE, 'readonly')
    const store = tx.objectStore(UNITS_STORE)
    const results: UnitProfile[] = []

    let source: IDBRequest
    if (query.faction) {
      const index = store.index('faction')
      source = index.openCursor(IDBKeyRange.only(query.faction))
    } else {
      source = store.openCursor()
    }

    source.onsuccess = () => {
      const cursor = source.result as IDBCursorWithValue | null
      if (cursor) {
        const unit = cursor.value as UnitProfile
        if (!query.name || unit.name.toLowerCase().includes(query.name.toLowerCase())) {
          results.push(unit)
        }
        cursor.continue()
      }
    }

    tx.oncomplete = () => {
      db.close()
      resolve(results)
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
  })
}

export async function listFactions(): Promise<string[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(UNITS_STORE, 'readonly')
    const index = tx.objectStore(UNITS_STORE).index('faction')
    const req = index.openKeyCursor(null, 'nextunique')
    const factions: string[] = []

    req.onsuccess = () => {
      const cursor = req.result
      if (cursor) {
        factions.push(cursor.key as string)
        cursor.continue()
      }
    }

    tx.oncomplete = () => {
      db.close()
      resolve(factions)
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
  })
}

export async function clearFaction(faction: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(UNITS_STORE, 'readwrite')
    const store = tx.objectStore(UNITS_STORE)
    const index = store.index('faction')
    const req = index.openCursor(IDBKeyRange.only(faction))

    req.onsuccess = () => {
      const cursor = req.result as IDBCursorWithValue | null
      if (cursor) {
        cursor.delete()
        cursor.continue()
      }
    }

    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
  })
}

export async function clearAll(): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALL_STORES, 'readwrite')
    for (const name of ALL_STORES) {
      tx.objectStore(name).clear()
    }
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
  })
}

export async function clearGameRules(): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(GAME_RULES_STORES, 'readwrite')
    for (const name of GAME_RULES_STORES) {
      tx.objectStore(name).clear()
    }
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
  })
}

// ── Import meta ──────────────────────────────────────────────────────────────

export async function getImportMeta(): Promise<ImportMeta | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readonly')
    const req = tx.objectStore(META_STORE).get('importMeta')
    req.onsuccess = () => resolve((req.result as ImportMeta | undefined) ?? null)
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

export async function setImportMeta(meta: ImportMeta): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readwrite')
    tx.objectStore(META_STORE).put(meta, 'importMeta')
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
  })
}

export async function getRulesImportMeta(): Promise<RulesImportMeta | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readonly')
    const req = tx.objectStore(META_STORE).get('rulesImportMeta')
    req.onsuccess = () => resolve((req.result as RulesImportMeta | undefined) ?? null)
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

export async function setRulesImportMeta(meta: RulesImportMeta): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readwrite')
    tx.objectStore(META_STORE).put(meta, 'rulesImportMeta')
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
  })
}

// ── Settings ─────────────────────────────────────────────────────────────────

export async function getIncludeLegends(): Promise<boolean> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readonly')
    const req = tx.objectStore(META_STORE).get('includeLegends')
    req.onsuccess = () => {
      db.close()
      resolve(req.result === true)
    }
    req.onerror = () => {
      db.close()
      reject(req.error)
    }
  })
}

export async function setIncludeLegends(value: boolean): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readwrite')
    tx.objectStore(META_STORE).put(value, 'includeLegends')
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
  })
}

// ── List CRUD ────────────────────────────────────────────────────────────────

export async function createList(list: LocalList): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LISTS_STORE, 'readwrite')
    tx.objectStore(LISTS_STORE).put(list)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

export async function getLists(): Promise<LocalList[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LISTS_STORE, 'readonly')
    const req = tx.objectStore(LISTS_STORE).getAll()
    req.onsuccess = () => resolve(req.result as LocalList[])
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

export async function getList(id: string): Promise<LocalList | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LISTS_STORE, 'readonly')
    const req = tx.objectStore(LISTS_STORE).get(id)
    req.onsuccess = () => resolve((req.result as LocalList | undefined) ?? null)
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

export async function updateList(id: string, updates: Partial<Omit<LocalList, 'id'>>): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LISTS_STORE, 'readwrite')
    const store = tx.objectStore(LISTS_STORE)
    const getReq = store.get(id)
    getReq.onsuccess = () => {
      const existing = getReq.result as LocalList | undefined
      if (!existing) return // no-op for unknown id, transaction completes normally
      store.put({ ...existing, ...updates, id })
    }
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

export async function deleteList(id: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction([LISTS_STORE, LIST_UNITS_STORE], 'readwrite')
    // Delete all list_units for this list
    const luStore = tx.objectStore(LIST_UNITS_STORE)
    const index = luStore.index('listId')
    const cursorReq = index.openCursor(IDBKeyRange.only(id))
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result as IDBCursorWithValue | null
      if (cursor) {
        cursor.delete()
        cursor.continue()
      }
    }
    // Delete the list itself
    tx.objectStore(LISTS_STORE).delete(id)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

// ── List Unit CRUD ───────────────────────────────────────────────────────────

export async function addListUnit(unit: LocalListUnit): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LIST_UNITS_STORE, 'readwrite')
    tx.objectStore(LIST_UNITS_STORE).put(unit)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

export async function getListUnits(listId: string): Promise<LocalListUnit[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LIST_UNITS_STORE, 'readonly')
    const index = tx.objectStore(LIST_UNITS_STORE).index('listId')
    const req = index.getAll(IDBKeyRange.only(listId))
    req.onsuccess = () => resolve(req.result as LocalListUnit[])
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

export async function updateListUnit(id: string, updates: Partial<Pick<LocalListUnit, 'isWarlord' | 'enhancementId' | 'enhancementName' | 'enhancementCost'>>): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LIST_UNITS_STORE, 'readwrite')
    const store = tx.objectStore(LIST_UNITS_STORE)
    const getReq = store.get(id)
    getReq.onsuccess = () => {
      const existing = getReq.result as LocalListUnit | undefined
      if (!existing) {
        db.close()
        reject(new Error(`List unit ${id} not found`))
        return
      }
      store.put({ ...existing, ...updates })
    }
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

export async function removeListUnit(id: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LIST_UNITS_STORE, 'readwrite')
    tx.objectStore(LIST_UNITS_STORE).delete(id)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

// ── Detachments ──────────────────────────────────────────────────────────────

export const saveDetachments = (items: Detachment[]) => batchSave(DETACHMENTS_STORE, items)
export const getDetachmentsByFaction = (factionId: string) => getByIndex<Detachment>(DETACHMENTS_STORE, 'factionId', factionId)
export const getDetachment = (id: string) => getOne<Detachment>(DETACHMENTS_STORE, id)

// ── Detachment Abilities ─────────────────────────────────────────────────────

export const saveDetachmentAbilities = (items: DetachmentAbility[]) => batchSave(DETACHMENT_ABILITIES_STORE, items)
export const getDetachmentAbilities = (detachmentId: string) => getByIndex<DetachmentAbility>(DETACHMENT_ABILITIES_STORE, 'detachmentId', detachmentId)

// ── Stratagems ───────────────────────────────────────────────────────────────

export const saveStratagems = (items: Stratagem[]) => batchSave(STRATAGEMS_STORE, items)

export async function getStratagems(filter: { factionId: string; detachmentId?: string }): Promise<Stratagem[]> {
  const results = await getByIndex<Stratagem>(STRATAGEMS_STORE, 'factionId', filter.factionId)
  if (filter.detachmentId) {
    return results.filter(s => s.detachmentId === filter.detachmentId)
  }
  return results
}

// ── Enhancements ─────────────────────────────────────────────────────────────

export const saveEnhancements = (items: Enhancement[]) => batchSave(ENHANCEMENTS_STORE, items)
export const getEnhancements = (detachmentId: string) => getByIndex<Enhancement>(ENHANCEMENTS_STORE, 'detachmentId', detachmentId)

// ── Leader Attachments ───────────────────────────────────────────────────────

export const saveLeaderAttachments = (items: LeaderAttachment[]) => batchSave(LEADER_ATTACHMENTS_STORE, items)
export const getLeaderAttachments = (leaderId: string) => getByIndex<LeaderAttachment>(LEADER_ATTACHMENTS_STORE, 'leaderId', leaderId)
export const getLeadersForUnit = (attachedId: string) => getByIndex<LeaderAttachment>(LEADER_ATTACHMENTS_STORE, 'attachedId', attachedId)

// ── Unit Compositions ────────────────────────────────────────────────────────

export const saveUnitCompositions = (items: UnitComposition[]) => batchSave(UNIT_COMPOSITIONS_STORE, items)
export const getUnitCompositions = (datasheetId: string) => getByIndex<UnitComposition>(UNIT_COMPOSITIONS_STORE, 'datasheetId', datasheetId)

// ── Unit Costs ───────────────────────────────────────────────────────────────

export const saveUnitCosts = (items: UnitCost[]) => batchSave(UNIT_COSTS_STORE, items)
export const getUnitCosts = (datasheetId: string) => getByIndex<UnitCost>(UNIT_COSTS_STORE, 'datasheetId', datasheetId)
export const getAllUnitCosts = () => getAllFromStore<UnitCost>(UNIT_COSTS_STORE)

// ── Wargear Options ──────────────────────────────────────────────────────────

export const saveWargearOptions = (items: WargearOption[]) => batchSave(WARGEAR_OPTIONS_STORE, items)
export const getWargearOptions = (datasheetId: string) => getByIndex<WargearOption>(WARGEAR_OPTIONS_STORE, 'datasheetId', datasheetId)

// ── Unit Keywords ────────────────────────────────────────────────────────────

export const saveUnitKeywords = (items: UnitKeyword[]) => batchSave(UNIT_KEYWORDS_STORE, items)
export const getUnitKeywords = (datasheetId: string) => getByIndex<UnitKeyword>(UNIT_KEYWORDS_STORE, 'datasheetId', datasheetId)
export const getAllUnitKeywords = () => getAllFromStore<UnitKeyword>(UNIT_KEYWORDS_STORE)

// ── Unit Abilities ───────────────────────────────────────────────────────────

export const saveUnitAbilities = (items: UnitAbility[]) => batchSave(UNIT_ABILITIES_STORE, items)
export const getUnitAbilities = (datasheetId: string) => getByIndex<UnitAbility>(UNIT_ABILITIES_STORE, 'datasheetId', datasheetId)

// ── Missions ─────────────────────────────────────────────────────────────────

export const saveMissions = (items: Mission[]) => batchSave(MISSIONS_STORE, items)
export const getMissions = () => getAllFromStore<Mission>(MISSIONS_STORE)

// ── Datasheets ───────────────────────────────────────────────────────────────

export const saveDatasheets = (items: Datasheet[]) => batchSave(DATASHEETS_STORE, items)
export const getAllDatasheets = () => getAllFromStore<Datasheet>(DATASHEETS_STORE)
export const getDatasheet = (id: string) => getOne<Datasheet>(DATASHEETS_STORE, id)
export const getDatasheetsByFaction = (factionId: string) => getByIndex<Datasheet>(DATASHEETS_STORE, 'factionId', factionId)

// ── Datasheet Wargear (weapon profiles) ─────────────────────────────────────

export const saveDatasheetWargear = (items: DatasheetWargear[]) => batchSave(DATASHEET_WARGEAR_STORE, items)
export const getDatasheetWargear = (datasheetId: string) => getByIndex<DatasheetWargear>(DATASHEET_WARGEAR_STORE, 'datasheetId', datasheetId)

// ── Datasheet Models (stat lines) ───────────────────────────────────────────

export const saveDatasheetModels = (items: DatasheetModel[]) => batchSave(DATASHEET_MODELS_STORE, items)
export const getDatasheetModels = (datasheetId: string) => getByIndex<DatasheetModel>(DATASHEET_MODELS_STORE, 'datasheetId', datasheetId)

// ── Global Abilities ────────────────────────────────────────────────────────

export const saveAbilities = (items: Ability[]) => batchSave(ABILITIES_STORE, items)
export const getAllAbilities = () => getAllFromStore<Ability>(ABILITIES_STORE)
export const getAbility = (id: string) => getOne<Ability>(ABILITIES_STORE, id)

// ── Datasheet Stratagems (junction) ─────────────────────────────────────────

export const saveDatasheetStratagems = (items: DatasheetStratagem[]) => batchSave(DATASHEET_STRATAGEMS_STORE, items)
export const getDatasheetStratagems = (datasheetId: string) => getByIndex<DatasheetStratagem>(DATASHEET_STRATAGEMS_STORE, 'datasheetId', datasheetId)

// ── Datasheet Enhancements (junction) ───────────────────────────────────────

export const saveDatasheetEnhancements = (items: DatasheetEnhancement[]) => batchSave(DATASHEET_ENHANCEMENTS_STORE, items)
export const getDatasheetEnhancements = (datasheetId: string) => getByIndex<DatasheetEnhancement>(DATASHEET_ENHANCEMENTS_STORE, 'datasheetId', datasheetId)

// ── Datasheet Detachment Abilities (junction) ───────────────────────────────

export const saveDatasheetDetachmentAbilities = (items: DatasheetDetachmentAbility[]) => batchSave(DATASHEET_DETACHMENT_ABILITIES_STORE, items)
export const getDatasheetDetachmentAbilities = (datasheetId: string) => getByIndex<DatasheetDetachmentAbility>(DATASHEET_DETACHMENT_ABILITIES_STORE, 'datasheetId', datasheetId)

// ── Wahapedia-primary unit access ───────────────────────────────────────────
// These functions use Wahapedia datasheets as the primary data source,
// joining with datasheet_models, datasheet_wargear, and unit_costs to
// produce UnitProfile-compatible objects.

export function parseStat(val: string): number {
  if (!val || val === '-' || val === '\u2013') return 0
  const n = parseInt(val.replace(/[+"'″"]/g, ''), 10)
  return isNaN(n) ? 0 : n
}

export function parseDiceOrNum(val: string): number | string {
  const s = val.trim().replace(/\s+/g, '').toUpperCase()
  if (/^\d+$/.test(s)) return parseInt(s, 10)
  if (s === '' || s === '-' || s === '\u2013') return 1
  return s
}

export function parseWeaponAbilities(desc: string): import('@tabletop-tools/game-content').WeaponAbility[] {
  if (!desc || desc === '-') return []
  type WA = import('@tabletop-tools/game-content').WeaponAbility
  const abilities: WA[] = []
  const parts = desc.split(/,\s*/)
  for (const raw of parts) {
    const part = raw.trim().toLowerCase()
    if (!part) continue
    if (part === 'lethal hits') { abilities.push({ type: 'LETHAL_HITS' }); continue }
    if (part === 'devastating wounds') { abilities.push({ type: 'DEVASTATING_WOUNDS' }); continue }
    if (part === 'torrent') { abilities.push({ type: 'TORRENT' }); continue }
    if (part === 'twin-linked') { abilities.push({ type: 'TWIN_LINKED' }); continue }
    if (part === 'ignores cover') { abilities.push({ type: 'IGNORES_COVER' }); continue }
    if (part === 'hazardous') { abilities.push({ type: 'HAZARDOUS' }); continue }
    if (part === 'precision') { abilities.push({ type: 'PRECISION' }); continue }
    if (part === 'indirect fire') { abilities.push({ type: 'INDIRECT_FIRE' }); continue }
    if (part === 'assault') { abilities.push({ type: 'ASSAULT' }); continue }
    if (part === 'pistol') { abilities.push({ type: 'PISTOL' }); continue }
    if (part === 'one shot') { abilities.push({ type: 'ONE_SHOT' }); continue }
    if (part === 'psychic') { abilities.push({ type: 'PSYCHIC' }); continue }
    if (part === 'extra attacks') { abilities.push({ type: 'ATTACKS_MOD', value: 0 }); continue }
    if (part === 'blast') { abilities.push({ type: 'BLAST' }); continue }
    const sustained = part.match(/sustained hits\s*(\d+)/)
    if (sustained) { abilities.push({ type: 'SUSTAINED_HITS', value: parseInt(sustained[1]!, 10) }); continue }
    const anti = part.match(/anti-(.+?)\s+(\d+)\+/)
    if (anti) { abilities.push({ type: 'ANTI', keyword: anti[1]!, value: parseInt(anti[2]!, 10) }); continue }
    const melta = part.match(/melta\s*(\d+)/)
    if (melta) { abilities.push({ type: 'MELTA', value: parseInt(melta[1]!, 10) }); continue }
    const rapidFire = part.match(/rapid fire\s*(\d+)/)
    if (rapidFire) { abilities.push({ type: 'ATTACKS_MOD', value: parseInt(rapidFire[1]!, 10) }); continue }
    if (/^heavy$/.test(part)) { abilities.push({ type: 'HIT_MOD', value: 1 }); continue }
  }
  return abilities
}

/** List unique factions from the datasheets store. */
export async function listDatasheetFactions(): Promise<string[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DATASHEETS_STORE, 'readonly')
    const index = tx.objectStore(DATASHEETS_STORE).index('factionId')
    const req = index.openKeyCursor(null, 'nextunique')
    const factions: string[] = []
    req.onsuccess = () => {
      const cursor = req.result
      if (cursor) {
        factions.push(cursor.key as string)
        cursor.continue()
      }
    }
    tx.oncomplete = () => { db.close(); resolve(factions.sort()) }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

/** Search datasheets by faction/name (mirrors searchUnits API). */
export async function searchDatasheets(query: { faction?: string; name?: string }): Promise<Datasheet[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DATASHEETS_STORE, 'readonly')
    const store = tx.objectStore(DATASHEETS_STORE)
    const results: Datasheet[] = []
    let source: IDBRequest
    if (query.faction) {
      source = store.index('factionId').openCursor(IDBKeyRange.only(query.faction))
    } else {
      source = store.openCursor()
    }
    source.onsuccess = () => {
      const cursor = source.result as IDBCursorWithValue | null
      if (cursor) {
        const ds = cursor.value as Datasheet
        if (!query.name || ds.name.toLowerCase().includes(query.name.toLowerCase())) {
          results.push(ds)
        }
        cursor.continue()
      }
    }
    tx.oncomplete = () => { db.close(); resolve(results) }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

/**
 * Load a single Wahapedia datasheet as a UnitProfile by joining
 * datasheet + models + wargear + costs + abilities.
 */
export async function getDatasheetAsUnit(datasheetId: string): Promise<UnitProfile | null> {
  const ds = await getDatasheet(datasheetId)
  if (!ds) return null

  const [models, wargear, costs, abilities] = await Promise.all([
    getDatasheetModels(datasheetId),
    getDatasheetWargear(datasheetId),
    getUnitCosts(datasheetId),
    getByIndex<UnitAbility>(UNIT_ABILITIES_STORE, 'datasheetId', datasheetId),
  ])

  const primaryModel = models[0]
  const invSvVal = primaryModel?.invSv ? parseStat(primaryModel.invSv) : undefined

  // Parse points from first cost entry (format: "X models ... Xpts" or just a number)
  let points = 0
  if (costs.length > 0) {
    const costStr = costs[0].cost || costs[0].description || ''
    const m = costStr.match(/(\d+)\s*pts?/i)
    if (m) points = parseInt(m[1], 10)
    else {
      const n = parseInt(costStr, 10)
      if (!isNaN(n)) points = n
    }
  }

  const weapons: import('@tabletop-tools/game-content').WeaponProfile[] = wargear
    .filter(w => w.name && w.name !== '-')
    .map(w => ({
      name: w.name,
      range: w.type === 'Melee' || w.range === 'Melee' ? 'melee' as const : parseStat(w.range),
      attacks: parseDiceOrNum(w.attacks),
      skill: parseStat(w.skill),
      strength: parseStat(w.strength),
      ap: parseStat(w.ap),
      damage: parseDiceOrNum(w.damage),
      abilities: parseWeaponAbilities(w.description),
    }))

  const abilityNames = abilities.map(a => a.name).filter(Boolean)
  const abilityDescs: Record<string, string> = {}
  for (const a of abilities) {
    if (a.name && a.description) abilityDescs[a.name] = a.description
  }

  return {
    id: ds.id,
    faction: ds.factionId,
    name: ds.name,
    move: primaryModel ? parseStat(primaryModel.move) : 0,
    toughness: primaryModel ? parseStat(primaryModel.toughness) : 0,
    save: primaryModel ? parseStat(primaryModel.save) : 0,
    wounds: primaryModel ? parseStat(primaryModel.wounds) : 0,
    leadership: primaryModel ? parseStat(primaryModel.leadership) : 0,
    oc: primaryModel ? parseStat(primaryModel.oc) : 0,
    invulnSave: invSvVal && invSvVal > 0 ? invSvVal : undefined,
    weapons,
    abilities: abilityNames,
    abilityDescriptions: Object.keys(abilityDescs).length > 0 ? abilityDescs : undefined,
    points,
  }
}

/** Check if Wahapedia datasheets are available (any records in the store). */
export async function hasDatasheets(): Promise<boolean> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DATASHEETS_STORE, 'readonly')
    const req = tx.objectStore(DATASHEETS_STORE).count()
    req.onsuccess = () => resolve(req.result > 0)
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  })
}

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  createTables,
  importData,
  getFactions,
  getDatasheetsByFaction,
  getModelsForDatasheet,
  getAbilitiesForDatasheet,
  getWargearForDatasheet,
  getStratagemsByFaction,
  getEnhancementsByFaction,
} from './db'
import type { ParsedData } from './types'

function emptyData(): ParsedData {
  return {
    factions: [],
    datasheets: [],
    datasheetModels: [],
    datasheetAbilities: [],
    datasheetUnitComposition: [],
    datasheetWargear: [],
    abilities: [],
    stratagems: [],
    detachmentAbilities: [],
    enhancements: [],
    wargearList: [],
    sources: [],
  }
}

function sampleData(): ParsedData {
  return {
    factions: [
      { id: 'SM', name: 'Space Marines', link: '/sm' },
      { id: 'ORK', name: 'Orks', link: '/ork' },
    ],
    datasheets: [
      {
        id: 'ds1', name: 'Intercessors', faction_id: 'SM', source_id: 'src1',
        role: 'Troops', unit_composition: '5-10', transport: '', virtual: '',
        cost: '80', cost_per_unit: '',
      },
      {
        id: 'ds2', name: 'Boyz', faction_id: 'ORK', source_id: 'src1',
        role: 'Troops', unit_composition: '10-20', transport: '', virtual: '',
        cost: '70', cost_per_unit: '',
      },
    ],
    datasheetModels: [
      {
        datasheet_id: 'ds1', line: '1', name: 'Intercessor',
        M: '6"', T: '4', SV: '3+', W: '2', LD: '6+', OC: '2',
        base_size: '32mm', invul_save: '',
      },
    ],
    datasheetAbilities: [
      { datasheet_id: 'ds1', line: '1', ability_id: 'ab1', is_index_key: '', cost: '', model_id: '' },
    ],
    datasheetUnitComposition: [
      { datasheet_id: 'ds1', line: '1', description: '5-10 Intercessors' },
    ],
    datasheetWargear: [
      { datasheet_id: 'ds1', line: '1', wargear_id: 'wg1', is_index_key: '', model_id: '', cost: '' },
    ],
    abilities: [
      { id: 'ab1', name: 'Oath of Moment', legend: '', faction_id: 'SM', description: 'Re-roll hits', type: 'Faction', parameter: '' },
    ],
    stratagems: [
      {
        id: 'st1', name: 'Armour of Contempt', type: 'Battle Tactic', cp_cost: '1',
        legend: '', turn: 'Either', phase: 'Shooting', description: 'Improve AP',
        faction_id: 'SM', detachment_id: '', source_id: '',
      },
    ],
    detachmentAbilities: [
      { id: 'da1', name: 'Gladius Task Force', legend: '', faction_id: 'SM', description: 'Oath bonus', detachment_id: 'det1', type: 'Detachment Rule' },
    ],
    enhancements: [
      { id: 'en1', name: 'Artificer Armour', description: '+1W', faction_id: 'SM', detachment_id: 'det1', cost: '10', source_id: '', is_index_key: '' },
    ],
    wargearList: [
      { id: 'wg1', name: 'Bolt Rifle', type: 'Ranged', faction_id: 'SM', description: '', range: '30"', A: '2', BS_WS: '3+', S: '4', AP: '-1', D: '1', is_index_key: '', source_id: '' },
    ],
    sources: [
      { id: 'src1', name: 'Index', type: 'Index', edition: '10th' },
    ],
  }
}

describe('database', () => {
  let tempDir: string
  let dbPath: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'wahapedia-db-'))
    dbPath = join(tempDir, 'data.db')
    createTables(dbPath)
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  describe('createTables', () => {
    it('creates all tables', () => {
      const Database = require('better-sqlite3')
      const db = new Database(dbPath, { readonly: true })
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        .all()
        .map((r: { name: string }) => r.name)
        .sort()
      db.close()

      expect(tables).toEqual([
        'abilities',
        'datasheet_abilities',
        'datasheet_models',
        'datasheet_unit_composition',
        'datasheet_wargear',
        'datasheets',
        'detachment_abilities',
        'enhancements',
        'factions',
        'sources',
        'stratagems',
        'wargear_list',
      ])
    })
  })

  describe('importData', () => {
    it('imports all data types', () => {
      importData(dbPath, sampleData())

      expect(getFactions(dbPath)).toHaveLength(2)
      expect(getDatasheetsByFaction(dbPath, 'SM')).toHaveLength(1)
      expect(getDatasheetsByFaction(dbPath, 'ORK')).toHaveLength(1)
      expect(getModelsForDatasheet(dbPath, 'ds1')).toHaveLength(1)
    })

    it('replaces data on re-import', () => {
      importData(dbPath, sampleData())
      expect(getFactions(dbPath)).toHaveLength(2)

      const updated = emptyData()
      updated.factions = [{ id: 'TAU', name: "T'au Empire", link: '/tau' }]
      importData(dbPath, updated)

      const factions = getFactions(dbPath)
      expect(factions).toHaveLength(1)
      expect(factions[0].name).toBe("T'au Empire")
    })

    it('handles empty data', () => {
      importData(dbPath, emptyData())
      expect(getFactions(dbPath)).toHaveLength(0)
    })
  })

  describe('query helpers', () => {
    beforeEach(() => {
      importData(dbPath, sampleData())
    })

    it('getFactions returns all factions sorted by name', () => {
      const factions = getFactions(dbPath)
      expect(factions[0].name).toBe('Orks')
      expect(factions[1].name).toBe('Space Marines')
    })

    it('getDatasheetsByFaction filters by faction', () => {
      const sm = getDatasheetsByFaction(dbPath, 'SM')
      expect(sm).toHaveLength(1)
      expect(sm[0].name).toBe('Intercessors')
    })

    it('getModelsForDatasheet returns model stats', () => {
      const models = getModelsForDatasheet(dbPath, 'ds1')
      expect(models).toHaveLength(1)
      expect(models[0].M).toBe('6"')
      expect(models[0].T).toBe('4')
    })

    it('getAbilitiesForDatasheet joins ability details', () => {
      const abs = getAbilitiesForDatasheet(dbPath, 'ds1')
      expect(abs).toHaveLength(1)
      expect(abs[0].ability_name).toBe('Oath of Moment')
      expect(abs[0].ability_description).toBe('Re-roll hits')
    })

    it('getWargearForDatasheet joins wargear details', () => {
      const wg = getWargearForDatasheet(dbPath, 'ds1')
      expect(wg).toHaveLength(1)
      expect(wg[0].wargear_name).toBe('Bolt Rifle')
    })

    it('getStratagemsByFaction filters by faction', () => {
      const strats = getStratagemsByFaction(dbPath, 'SM')
      expect(strats).toHaveLength(1)
      expect(strats[0].name).toBe('Armour of Contempt')
    })

    it('getEnhancementsByFaction filters by faction', () => {
      const enhs = getEnhancementsByFaction(dbPath, 'SM')
      expect(enhs).toHaveLength(1)
      expect(enhs[0].name).toBe('Artificer Armour')
    })
  })
})

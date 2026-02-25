import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createTables, importData } from './db'
import { generateFactionMarkdown, generateAllMarkdown } from './markdown'
import type { ParsedData } from './types'

function sampleData(): ParsedData {
  return {
    factions: [
      { id: 'SM', name: 'Space Marines', link: '/sm' },
      { id: 'ORK', name: 'Orks', link: '/ork' },
    ],
    datasheets: [
      {
        id: 'ds1', name: 'Intercessors', faction_id: 'SM', source_id: '',
        role: 'Battleline', unit_composition: '', transport: '', virtual: '',
        cost: '80', cost_per_unit: '',
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
    datasheetUnitComposition: [],
    datasheetWargear: [
      { datasheet_id: 'ds1', line: '1', wargear_id: 'wg1', is_index_key: '', model_id: '', cost: '' },
    ],
    abilities: [
      { id: 'ab1', name: 'Oath of Moment', legend: '', faction_id: 'SM', description: 'Re-roll <b>all</b> hit rolls', type: 'Faction', parameter: '' },
    ],
    stratagems: [
      {
        id: 'st1', name: 'Armour of Contempt', type: 'Battle Tactic', cp_cost: '1',
        legend: '', turn: 'Either', phase: 'Shooting', description: 'Worsen AP by 1',
        faction_id: 'SM', detachment_id: '', source_id: '',
      },
    ],
    detachmentAbilities: [],
    enhancements: [
      { id: 'en1', name: 'Artificer Armour', description: '+1 to save', faction_id: 'SM', detachment_id: '', cost: '10', source_id: '', is_index_key: '' },
    ],
    wargearList: [
      { id: 'wg1', name: 'Bolt Rifle', type: 'Ranged', faction_id: 'SM', description: '', range: '30"', A: '2', BS_WS: '3+', S: '4', AP: '-1', D: '1', is_index_key: '', source_id: '' },
    ],
    sources: [],
  }
}

describe('markdown generation', () => {
  let tempDir: string
  let dbPath: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'wahapedia-md-'))
    dbPath = join(tempDir, 'data.db')
    createTables(dbPath)
    importData(dbPath, sampleData())
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  describe('generateFactionMarkdown', () => {
    it('generates markdown with faction heading', () => {
      const md = generateFactionMarkdown(dbPath, 'SM', 'Space Marines')
      expect(md).toContain('# Space Marines')
    })

    it('includes datasheet stat blocks', () => {
      const md = generateFactionMarkdown(dbPath, 'SM', 'Space Marines')
      expect(md).toContain('### Intercessors')
      expect(md).toContain('| Intercessor | 6" | 4 | 3+ | 2 | 6+ | 2 |')
    })

    it('includes ranged weapons table', () => {
      const md = generateFactionMarkdown(dbPath, 'SM', 'Space Marines')
      expect(md).toContain('**Ranged Weapons**')
      expect(md).toContain('| Bolt Rifle | 30" | 2 | 3+ | 4 | -1 | 1 |')
    })

    it('includes abilities with HTML stripped', () => {
      const md = generateFactionMarkdown(dbPath, 'SM', 'Space Marines')
      expect(md).toContain('**Oath of Moment**')
      expect(md).toContain('Re-roll all hit rolls')
      expect(md).not.toContain('<b>')
    })

    it('includes stratagems', () => {
      const md = generateFactionMarkdown(dbPath, 'SM', 'Space Marines')
      expect(md).toContain('### Armour of Contempt (1 CP)')
      expect(md).toContain('**Phase:** Shooting')
    })

    it('includes enhancements', () => {
      const md = generateFactionMarkdown(dbPath, 'SM', 'Space Marines')
      expect(md).toContain('### Artificer Armour (10 pts)')
    })

    it('returns empty sections for faction with no data', () => {
      const md = generateFactionMarkdown(dbPath, 'ORK', 'Orks')
      expect(md).toContain('# Orks')
      expect(md).not.toContain('## Datasheets')
    })
  })

  describe('generateAllMarkdown', () => {
    it('creates per-faction markdown files', () => {
      const outputDir = join(tempDir, 'markdown')
      const result = generateAllMarkdown(dbPath, outputDir)

      expect(result.factionCount).toBe(2)
      expect(existsSync(join(outputDir, 'space-marines.md'))).toBe(true)
      expect(existsSync(join(outputDir, 'orks.md'))).toBe(true)
    })

    it('creates INDEX.md with links', () => {
      const outputDir = join(tempDir, 'markdown')
      generateAllMarkdown(dbPath, outputDir)

      const index = readFileSync(join(outputDir, 'INDEX.md'), 'utf-8')
      expect(index).toContain('# Wahapedia 40K 10th Edition Data')
      expect(index).toContain('[Space Marines](./space-marines.md)')
      expect(index).toContain('[Orks](./orks.md)')
    })

    it('creates output directory if missing', () => {
      const outputDir = join(tempDir, 'deep', 'nested', 'md')
      generateAllMarkdown(dbPath, outputDir)
      expect(existsSync(outputDir)).toBe(true)
    })
  })
})

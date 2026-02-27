import { describe, it, expect, vi, beforeEach } from 'vitest'
import { importWahapediaRules, isWahapediaAvailable } from './wahapedia'
import type { RulesImportProgress } from './wahapedia'

// Mock game-data-store save functions
const mockSaveDetachments = vi.fn().mockResolvedValue(undefined)
const mockSaveDetachmentAbilities = vi.fn().mockResolvedValue(undefined)
const mockSaveStratagems = vi.fn().mockResolvedValue(undefined)
const mockSaveEnhancements = vi.fn().mockResolvedValue(undefined)
const mockSaveLeaderAttachments = vi.fn().mockResolvedValue(undefined)
const mockSaveUnitCompositions = vi.fn().mockResolvedValue(undefined)
const mockSaveUnitCosts = vi.fn().mockResolvedValue(undefined)
const mockSaveWargearOptions = vi.fn().mockResolvedValue(undefined)
const mockSaveUnitKeywords = vi.fn().mockResolvedValue(undefined)
const mockSaveUnitAbilities = vi.fn().mockResolvedValue(undefined)
const mockSaveDatasheets = vi.fn().mockResolvedValue(undefined)
const mockSaveDatasheetWargear = vi.fn().mockResolvedValue(undefined)
const mockSaveDatasheetModels = vi.fn().mockResolvedValue(undefined)
const mockSaveMissions = vi.fn().mockResolvedValue(undefined)
const mockSaveAbilities = vi.fn().mockResolvedValue(undefined)
const mockSaveDatasheetStratagems = vi.fn().mockResolvedValue(undefined)
const mockSaveDatasheetEnhancements = vi.fn().mockResolvedValue(undefined)
const mockSaveDatasheetDetachmentAbilities = vi.fn().mockResolvedValue(undefined)
const mockSetRulesImportMeta = vi.fn().mockResolvedValue(undefined)
const mockSearchUnits = vi.fn().mockResolvedValue([])

vi.mock('@tabletop-tools/game-data-store', () => ({
  saveDetachments: (...args: unknown[]) => mockSaveDetachments(...args),
  saveDetachmentAbilities: (...args: unknown[]) => mockSaveDetachmentAbilities(...args),
  saveStratagems: (...args: unknown[]) => mockSaveStratagems(...args),
  saveEnhancements: (...args: unknown[]) => mockSaveEnhancements(...args),
  saveLeaderAttachments: (...args: unknown[]) => mockSaveLeaderAttachments(...args),
  saveUnitCompositions: (...args: unknown[]) => mockSaveUnitCompositions(...args),
  saveUnitCosts: (...args: unknown[]) => mockSaveUnitCosts(...args),
  saveWargearOptions: (...args: unknown[]) => mockSaveWargearOptions(...args),
  saveUnitKeywords: (...args: unknown[]) => mockSaveUnitKeywords(...args),
  saveUnitAbilities: (...args: unknown[]) => mockSaveUnitAbilities(...args),
  saveDatasheets: (...args: unknown[]) => mockSaveDatasheets(...args),
  saveDatasheetWargear: (...args: unknown[]) => mockSaveDatasheetWargear(...args),
  saveDatasheetModels: (...args: unknown[]) => mockSaveDatasheetModels(...args),
  saveMissions: (...args: unknown[]) => mockSaveMissions(...args),
  saveAbilities: (...args: unknown[]) => mockSaveAbilities(...args),
  saveDatasheetStratagems: (...args: unknown[]) => mockSaveDatasheetStratagems(...args),
  saveDatasheetEnhancements: (...args: unknown[]) => mockSaveDatasheetEnhancements(...args),
  saveDatasheetDetachmentAbilities: (...args: unknown[]) => mockSaveDatasheetDetachmentAbilities(...args),
  setRulesImportMeta: (...args: unknown[]) => mockSetRulesImportMeta(...args),
  searchUnits: (...args: unknown[]) => mockSearchUnits(...args),
}))

// ── Test data matching real Wahapedia JSON shapes ──────────────────────────

const FACTIONS = [
  { id: 'AC', name: 'Adeptus Custodes' },
  { id: 'SM', name: 'Space Marines' },
  { id: 'ORK', name: 'Orks' },
]

const DATASHEETS = [
  { id: '000001453', name: 'Allarus Custodians', factionId: 'AC', role: 'Other', legend: '', transport: '', loadout: 'balistus grenade launcher; guardian spear.', damagedW: '', damagedDescription: '' },
  { id: '000000100', name: 'Intercessor Squad', factionId: 'SM', role: 'Battleline', legend: '', transport: '', loadout: 'bolt pistol; bolt rifle.', damagedW: '', damagedDescription: '' },
  { id: '000000001', name: 'Warboss', factionId: 'ORK', role: 'Characters', legend: '', transport: '', loadout: 'big choppa; kombi-weapon.', damagedW: '', damagedDescription: '' },
]

const BSDATA_UNITS = [
  { id: 'bs-allarus-001', name: 'Allarus Custodians', faction: 'Adeptus Custodes' },
  { id: 'bs-intercessor-001', name: 'Intercessor Squad', faction: 'Space Marines' },
  { id: 'bs-warboss-001', name: 'Warboss', faction: 'Orks' },
  { id: 'bs-boyz-001', name: 'Boyz', faction: 'Orks' },
]

const DETACHMENTS = [
  { id: '000000863', factionId: 'AC', name: 'Auric Champions', legend: '', type: '' },
  { id: '000000765', factionId: 'AC', name: 'Shield Host', legend: '', type: '' },
]

const DETACHMENT_ABILITIES = [
  { id: 'da-001', detachmentId: '000000863', factionId: 'AC', name: 'Martial Ka\'tah', legend: '', description: 'Re-roll one Hit roll...' },
]

const STRATAGEMS = [
  { id: 'str-001', factionId: 'AC', detachmentId: '000000863', name: 'Arcane Genetic Alchemy', type: 'Battle Tactic', cpCost: '1', turn: 'Either', phase: 'Fight Phase', legend: '', description: 'Improve AP by 1' },
]

const ENHANCEMENTS = [
  { id: 'enh-001', factionId: 'AC', detachmentId: '000000863', name: 'Veiled Blade', legend: '', description: 'This model gains Stealth.', cost: '25' },
]

const LEADER_ATTACHMENTS = [
  { id: 'la-001', leaderId: '000001453', attachedId: '000000100' },
]

const UNIT_COMPOSITIONS = [
  { id: 'uc-001', datasheetId: '000001453', line: '3 models', description: '3 Allarus Custodians' },
  { id: 'uc-002', datasheetId: '000000100', line: '5-10 models', description: '5-10 Intercessors' },
]

const UNIT_COSTS = [
  { id: 'cost-001', datasheetId: '000001453', line: '3 models', description: '3 Allarus Custodians', cost: '195' },
  { id: 'cost-002', datasheetId: '000000100', line: '5 models', description: '5 Intercessors', cost: '90' },
]

const WARGEAR_OPTIONS = [
  { id: 'wo-001', datasheetId: '000001453', line: 'Any number', description: 'Replace guardian spear with castellan axe' },
]

const UNIT_KEYWORDS = [
  { id: 'kw-001', datasheetId: '000001453', keyword: 'Infantry', isFactionKeyword: false },
  { id: 'kw-002', datasheetId: '000001453', keyword: 'Adeptus Custodes', isFactionKeyword: true },
]

const UNIT_ABILITIES = [
  { id: 'ua-001', datasheetId: '000001453', name: 'Slayers of Tyrants', description: '+1 to wound vs Characters', type: 'Other', abilityId: '', parameter: '' },
]

const DATASHEET_WARGEAR = [
  { id: 9001, datasheetId: '000001453', name: 'Balistus grenade launcher', description: 'blast', range: '18', type: 'Ranged', attacks: 'D6', skill: '2', strength: '4', ap: '-1', damage: '1' },
  { id: 9002, datasheetId: '000001453', name: 'Guardian spear', description: '', range: 'Melee', type: 'Melee', attacks: '5', skill: '2', strength: '7', ap: '-2', damage: '2' },
  { id: 9003, datasheetId: '000000001', name: 'Big choppa', description: '', range: 'Melee', type: 'Melee', attacks: '5', skill: '2', strength: '8', ap: '-1', damage: '2' },
]

const DATASHEET_MODELS = [
  { id: 1001, datasheetId: '000001453', name: 'Allarus Custodian', move: '5', toughness: '7', save: '2+', wounds: '4', leadership: '6+', oc: '2', invSv: '4+', invSvDescription: '', baseSize: '40mm' },
  { id: 1002, datasheetId: '000000100', name: 'Intercessor', move: '6', toughness: '4', save: '3+', wounds: '2', leadership: '6+', oc: '2', invSv: '', invSvDescription: '', baseSize: '32mm' },
]

const MISSIONS = [
  { id: 'mission-001', name: 'Supply Drop', type: 'Primary', description: 'Control objectives...' },
]

const ABILITIES = [
  { id: 'ability-001', name: 'Leader', legend: '', factionId: '', description: 'While this model is leading a unit...' },
  { id: 'ability-002', name: 'Deadly Demise D3', legend: '', factionId: '', description: 'Roll D3 when destroyed...' },
]

const DATASHEET_STRATAGEMS = [
  { id: 1, datasheetId: '000001453', stratagemId: 'str-001' },
]

const DATASHEET_ENHANCEMENTS = [
  { id: 1, datasheetId: '000001453', enhancementId: 'enh-001' },
]

const DATASHEET_DETACHMENT_ABILITIES = [
  { id: 1, datasheetId: '000001453', detachmentAbilityId: 'da-001' },
]

// ── Helpers ────────────────────────────────────────────────────────────────

const mockFetch = vi.fn()

function jsonResponse(data: unknown) {
  return { ok: true, json: async () => data }
}

function headResponse(ok: boolean) {
  return { ok }
}

/** Set up fetch mock to respond to all 19 Wahapedia JSON fetches in order */
function setupFetchMocks() {
  // The import pipeline fetches in this order:
  // 1. factions.json
  // 2. datasheets.json
  // 3. (buildIdMapping calls searchUnits — already mocked)
  // 4-13: detachments, detachment_abilities, stratagems, enhancements,
  //        leader_attachments, unit_compositions, unit_costs, wargear_options,
  //        unit_keywords, unit_abilities
  // 14: datasheet_wargear.json
  // 15: datasheet_models.json
  // 16: missions.json
  // 17: abilities.json
  // 18: datasheet_stratagems.json
  // 19: datasheet_enhancements.json
  // 20: datasheet_detachment_abilities.json

  mockFetch
    .mockResolvedValueOnce(jsonResponse(FACTIONS))                       // 1: factions
    .mockResolvedValueOnce(jsonResponse(DATASHEETS))                     // 2: datasheets
    .mockResolvedValueOnce(jsonResponse(DETACHMENTS))                    // 4: detachments
    .mockResolvedValueOnce(jsonResponse(DETACHMENT_ABILITIES))           // 5: detachment_abilities
    .mockResolvedValueOnce(jsonResponse(STRATAGEMS))                     // 6: stratagems
    .mockResolvedValueOnce(jsonResponse(ENHANCEMENTS))                   // 7: enhancements
    .mockResolvedValueOnce(jsonResponse(LEADER_ATTACHMENTS))             // 8: leader_attachments
    .mockResolvedValueOnce(jsonResponse(UNIT_COMPOSITIONS))              // 9: unit_compositions
    .mockResolvedValueOnce(jsonResponse(UNIT_COSTS))                     // 10: unit_costs
    .mockResolvedValueOnce(jsonResponse(WARGEAR_OPTIONS))                // 11: wargear_options
    .mockResolvedValueOnce(jsonResponse(UNIT_KEYWORDS))                  // 12: unit_keywords
    .mockResolvedValueOnce(jsonResponse(UNIT_ABILITIES))                 // 13: unit_abilities
    .mockResolvedValueOnce(jsonResponse(DATASHEET_WARGEAR))              // 14: datasheet_wargear
    .mockResolvedValueOnce(jsonResponse(DATASHEET_MODELS))               // 15: datasheet_models
    .mockResolvedValueOnce(jsonResponse(MISSIONS))                       // 16: missions
    .mockResolvedValueOnce(jsonResponse(ABILITIES))                      // 17: abilities
    .mockResolvedValueOnce(jsonResponse(DATASHEET_STRATAGEMS))           // 18: datasheet_stratagems
    .mockResolvedValueOnce(jsonResponse(DATASHEET_ENHANCEMENTS))         // 19: datasheet_enhancements
    .mockResolvedValueOnce(jsonResponse(DATASHEET_DETACHMENT_ABILITIES)) // 20: datasheet_det_abilities
}

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
  mockFetch.mockReset()
  mockSearchUnits.mockReset().mockResolvedValue(BSDATA_UNITS)
  mockSaveDetachments.mockReset().mockResolvedValue(undefined)
  mockSaveDetachmentAbilities.mockReset().mockResolvedValue(undefined)
  mockSaveStratagems.mockReset().mockResolvedValue(undefined)
  mockSaveEnhancements.mockReset().mockResolvedValue(undefined)
  mockSaveLeaderAttachments.mockReset().mockResolvedValue(undefined)
  mockSaveUnitCompositions.mockReset().mockResolvedValue(undefined)
  mockSaveUnitCosts.mockReset().mockResolvedValue(undefined)
  mockSaveWargearOptions.mockReset().mockResolvedValue(undefined)
  mockSaveUnitKeywords.mockReset().mockResolvedValue(undefined)
  mockSaveUnitAbilities.mockReset().mockResolvedValue(undefined)
  mockSaveDatasheets.mockReset().mockResolvedValue(undefined)
  mockSaveDatasheetWargear.mockReset().mockResolvedValue(undefined)
  mockSaveDatasheetModels.mockReset().mockResolvedValue(undefined)
  mockSaveMissions.mockReset().mockResolvedValue(undefined)
  mockSaveAbilities.mockReset().mockResolvedValue(undefined)
  mockSaveDatasheetStratagems.mockReset().mockResolvedValue(undefined)
  mockSaveDatasheetEnhancements.mockReset().mockResolvedValue(undefined)
  mockSaveDatasheetDetachmentAbilities.mockReset().mockResolvedValue(undefined)
  mockSetRulesImportMeta.mockReset().mockResolvedValue(undefined)
})

describe('importWahapediaRules', () => {
  it('completes all 20 steps and returns correct counts', async () => {
    setupFetchMocks()
    const progress: RulesImportProgress[] = []

    const result = await importWahapediaRules(p => progress.push({ ...p }))

    expect(result.errors).toEqual([])
    expect(result.counts.datasheets).toBe(3)
    expect(result.counts.detachments).toBe(2)
    expect(result.counts.stratagems).toBe(1)
    expect(result.counts.enhancements).toBe(1)
    expect(result.counts.leaderAttachments).toBe(1)
    expect(result.counts.unitCompositions).toBe(2)
    expect(result.counts.unitCosts).toBe(2)
    expect(result.counts.wargearOptions).toBe(1)
    expect(result.counts.unitKeywords).toBe(2)
    expect(result.counts.unitAbilities).toBe(1)
    expect(result.counts.datasheetWargear).toBe(3)
    expect(result.counts.datasheetModels).toBe(2)
    expect(result.counts.missions).toBe(1)
    expect(result.counts.abilities).toBe(2)
    expect(result.counts.datasheetStratagems).toBe(1)
    expect(result.counts.datasheetEnhancements).toBe(1)
    expect(result.counts.datasheetDetachmentAbilities).toBe(1)
  })

  it('reports progress for all 20 steps', async () => {
    setupFetchMocks()
    const progress: RulesImportProgress[] = []

    await importWahapediaRules(p => progress.push({ ...p }))

    expect(progress).toHaveLength(20)
    expect(progress[0]).toEqual({ current: 1, total: 20, currentStep: 'Factions' })
    expect(progress[1]).toEqual({ current: 2, total: 20, currentStep: 'Datasheets' })
    expect(progress[2]).toEqual({ current: 3, total: 20, currentStep: 'Building ID mapping' })
    expect(progress[19]).toEqual({ current: 20, total: 20, currentStep: 'Datasheet Detachment Abilities' })
  })

  it('re-keys datasheet IDs from Wahapedia to BSData', async () => {
    setupFetchMocks()

    await importWahapediaRules(() => {})

    // Datasheets are saved with BSData IDs where matched
    const savedDatasheets = mockSaveDatasheets.mock.calls[0]![0]
    const allarus = savedDatasheets.find((d: { name: string }) => d.name === 'Allarus Custodians')
    expect(allarus.id).toBe('bs-allarus-001')

    const intercessors = savedDatasheets.find((d: { name: string }) => d.name === 'Intercessor Squad')
    expect(intercessors.id).toBe('bs-intercessor-001')

    const warboss = savedDatasheets.find((d: { name: string }) => d.name === 'Warboss')
    expect(warboss.id).toBe('bs-warboss-001')
  })

  it('re-keys faction IDs from short codes to full names', async () => {
    setupFetchMocks()

    await importWahapediaRules(() => {})

    // Datasheets should have full faction names
    const savedDatasheets = mockSaveDatasheets.mock.calls[0]![0]
    const allarus = savedDatasheets.find((d: { name: string }) => d.name === 'Allarus Custodians')
    expect(allarus.factionId).toBe('Adeptus Custodes')

    // Detachments should have full faction names
    const savedDetachments = mockSaveDetachments.mock.calls[0]![0]
    expect(savedDetachments[0].factionId).toBe('Adeptus Custodes')

    // Stratagems should have full faction names
    const savedStratagems = mockSaveStratagems.mock.calls[0]![0]
    expect(savedStratagems[0].factionId).toBe('Adeptus Custodes')

    // Enhancements should have full faction names
    const savedEnhancements = mockSaveEnhancements.mock.calls[0]![0]
    expect(savedEnhancements[0].factionId).toBe('Adeptus Custodes')
  })

  it('re-keys leader attachment IDs (both leaderId and attachedId)', async () => {
    setupFetchMocks()

    await importWahapediaRules(() => {})

    const savedLeaderAttachments = mockSaveLeaderAttachments.mock.calls[0]![0]
    expect(savedLeaderAttachments[0].leaderId).toBe('bs-allarus-001')
    expect(savedLeaderAttachments[0].attachedId).toBe('bs-intercessor-001')
  })

  it('re-keys datasheetId in unit compositions', async () => {
    setupFetchMocks()

    await importWahapediaRules(() => {})

    const saved = mockSaveUnitCompositions.mock.calls[0]![0]
    expect(saved[0].datasheetId).toBe('bs-allarus-001')
    expect(saved[1].datasheetId).toBe('bs-intercessor-001')
  })

  it('re-keys datasheetId in unit costs', async () => {
    setupFetchMocks()

    await importWahapediaRules(() => {})

    const saved = mockSaveUnitCosts.mock.calls[0]![0]
    expect(saved[0].datasheetId).toBe('bs-allarus-001')
    expect(saved[1].datasheetId).toBe('bs-intercessor-001')
  })

  it('re-keys datasheetId in datasheet_wargear', async () => {
    setupFetchMocks()

    await importWahapediaRules(() => {})

    const saved = mockSaveDatasheetWargear.mock.calls[0]![0]
    const allarusWeapons = saved.filter((w: { datasheetId: string }) => w.datasheetId === 'bs-allarus-001')
    expect(allarusWeapons).toHaveLength(2)
    const orkWeapon = saved.find((w: { datasheetId: string }) => w.datasheetId === 'bs-warboss-001')
    expect(orkWeapon.name).toBe('Big choppa')
  })

  it('re-keys datasheetId in datasheet_models', async () => {
    setupFetchMocks()

    await importWahapediaRules(() => {})

    const saved = mockSaveDatasheetModels.mock.calls[0]![0]
    expect(saved[0].datasheetId).toBe('bs-allarus-001')
    expect(saved[1].datasheetId).toBe('bs-intercessor-001')
  })

  it('re-keys datasheetId in junction tables', async () => {
    setupFetchMocks()

    await importWahapediaRules(() => {})

    const savedStrat = mockSaveDatasheetStratagems.mock.calls[0]![0]
    expect(savedStrat[0].datasheetId).toBe('bs-allarus-001')

    const savedEnh = mockSaveDatasheetEnhancements.mock.calls[0]![0]
    expect(savedEnh[0].datasheetId).toBe('bs-allarus-001')

    const savedDa = mockSaveDatasheetDetachmentAbilities.mock.calls[0]![0]
    expect(savedDa[0].datasheetId).toBe('bs-allarus-001')
  })

  it('does not re-key missions (no datasheetId)', async () => {
    setupFetchMocks()

    await importWahapediaRules(() => {})

    const saved = mockSaveMissions.mock.calls[0]![0]
    expect(saved).toEqual(MISSIONS)
  })

  it('does not re-key abilities (no datasheetId)', async () => {
    setupFetchMocks()

    await importWahapediaRules(() => {})

    const saved = mockSaveAbilities.mock.calls[0]![0]
    expect(saved).toEqual(ABILITIES)
  })

  it('returns ID mapping stats', async () => {
    setupFetchMocks()

    const result = await importWahapediaRules(() => {})

    expect(result.idMappingStats).toBeDefined()
    // All 3 datasheets should match because we have corresponding BSData units
    expect(result.idMappingStats!.matched).toBe(3)
    expect(result.idMappingStats!.unmatched).toBe(0)
  })

  it('stores rules import metadata with correct counts', async () => {
    setupFetchMocks()

    await importWahapediaRules(() => {})

    expect(mockSetRulesImportMeta).toHaveBeenCalledOnce()
    const meta = mockSetRulesImportMeta.mock.calls[0]![0]
    expect(meta.lastImport).toBeGreaterThan(0)
    expect(meta.counts.detachments).toBe(2)
    expect(meta.counts.stratagems).toBe(1)
    expect(meta.counts.enhancements).toBe(1)
    expect(meta.counts.missions).toBe(1)
    expect(meta.counts.abilities).toBe(2)
  })

  it('calls all 18 save functions', async () => {
    setupFetchMocks()

    await importWahapediaRules(() => {})

    expect(mockSaveDatasheets).toHaveBeenCalledOnce()
    expect(mockSaveDetachments).toHaveBeenCalledOnce()
    expect(mockSaveDetachmentAbilities).toHaveBeenCalledOnce()
    expect(mockSaveStratagems).toHaveBeenCalledOnce()
    expect(mockSaveEnhancements).toHaveBeenCalledOnce()
    expect(mockSaveLeaderAttachments).toHaveBeenCalledOnce()
    expect(mockSaveUnitCompositions).toHaveBeenCalledOnce()
    expect(mockSaveUnitCosts).toHaveBeenCalledOnce()
    expect(mockSaveWargearOptions).toHaveBeenCalledOnce()
    expect(mockSaveUnitKeywords).toHaveBeenCalledOnce()
    expect(mockSaveUnitAbilities).toHaveBeenCalledOnce()
    expect(mockSaveDatasheetWargear).toHaveBeenCalledOnce()
    expect(mockSaveDatasheetModels).toHaveBeenCalledOnce()
    expect(mockSaveMissions).toHaveBeenCalledOnce()
    expect(mockSaveAbilities).toHaveBeenCalledOnce()
    expect(mockSaveDatasheetStratagems).toHaveBeenCalledOnce()
    expect(mockSaveDatasheetEnhancements).toHaveBeenCalledOnce()
    expect(mockSaveDatasheetDetachmentAbilities).toHaveBeenCalledOnce()
  })

  it('handles unmatched datasheets gracefully (keeps Wahapedia ID)', async () => {
    // Only provide one BSData unit — others will be unmatched
    mockSearchUnits.mockResolvedValue([
      { id: 'bs-warboss-001', name: 'Warboss', faction: 'Orks' },
    ])
    setupFetchMocks()

    const result = await importWahapediaRules(() => {})

    expect(result.idMappingStats!.matched).toBe(1)
    expect(result.idMappingStats!.unmatched).toBe(2)

    // Matched unit gets BSData ID
    const savedDatasheets = mockSaveDatasheets.mock.calls[0]![0]
    const warboss = savedDatasheets.find((d: { name: string }) => d.name === 'Warboss')
    expect(warboss.id).toBe('bs-warboss-001')

    // Unmatched units keep Wahapedia IDs
    const allarus = savedDatasheets.find((d: { name: string }) => d.name === 'Allarus Custodians')
    expect(allarus.id).toBe('000001453')
  })

  it('prefers same-faction match when multiple units have the same name', async () => {
    // Two "Warboss" units in different factions
    mockSearchUnits.mockResolvedValue([
      { id: 'bs-warboss-sm', name: 'Warboss', faction: 'Space Marines' },
      { id: 'bs-warboss-ork', name: 'Warboss', faction: 'Orks' },
      { id: 'bs-allarus-001', name: 'Allarus Custodians', faction: 'Adeptus Custodes' },
      { id: 'bs-intercessor-001', name: 'Intercessor Squad', faction: 'Space Marines' },
    ])
    setupFetchMocks()

    await importWahapediaRules(() => {})

    const savedDatasheets = mockSaveDatasheets.mock.calls[0]![0]
    const warboss = savedDatasheets.find((d: { name: string }) => d.name === 'Warboss')
    // Should pick the Orks faction match, not Space Marines
    expect(warboss.id).toBe('bs-warboss-ork')
  })

  it('handles fetch errors gracefully and reports them', async () => {
    // Factions succeeds, datasheets fails
    mockFetch
      .mockResolvedValueOnce(jsonResponse(FACTIONS))
      .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Server Error' })
    // Remaining 17 fetches succeed
    for (let i = 0; i < 17; i++) {
      mockFetch.mockResolvedValueOnce(jsonResponse([]))
    }

    const result = await importWahapediaRules(() => {})

    expect(result.errors).toContain('Datasheets: HTTP 500')
    expect(result.counts.datasheets).toBe(0)
  })

  it('handles non-array response gracefully', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(FACTIONS))
      .mockResolvedValueOnce(jsonResponse({ error: 'not an array' }))
    // Remaining fetches
    for (let i = 0; i < 17; i++) {
      mockFetch.mockResolvedValueOnce(jsonResponse([]))
    }

    const result = await importWahapediaRules(() => {})

    expect(result.errors).toContain('Datasheets: datasheets.json is not an array')
  })

  it('handles save function errors gracefully', async () => {
    setupFetchMocks()
    mockSaveDatasheets.mockRejectedValueOnce(new Error('IndexedDB write failed'))

    const result = await importWahapediaRules(() => {})

    expect(result.errors).toContain('Save datasheets: IndexedDB write failed')
    // Other saves should still succeed
    expect(mockSaveDetachments).toHaveBeenCalledOnce()
  })

  it('preserves weapon profile numeric fields through re-keying', async () => {
    setupFetchMocks()

    await importWahapediaRules(() => {})

    const saved = mockSaveDatasheetWargear.mock.calls[0]![0]
    const grenadeLauncher = saved.find((w: { name: string }) => w.name === 'Balistus grenade launcher')
    expect(grenadeLauncher.range).toBe('18')
    expect(grenadeLauncher.attacks).toBe('D6')
    expect(grenadeLauncher.skill).toBe('2')
    expect(grenadeLauncher.strength).toBe('4')
    expect(grenadeLauncher.ap).toBe('-1')
    expect(grenadeLauncher.damage).toBe('1')
    expect(grenadeLauncher.type).toBe('Ranged')
    expect(grenadeLauncher.description).toBe('blast')
  })

  it('preserves model stat fields through re-keying', async () => {
    setupFetchMocks()

    await importWahapediaRules(() => {})

    const saved = mockSaveDatasheetModels.mock.calls[0]![0]
    const custodian = saved.find((m: { name: string }) => m.name === 'Allarus Custodian')
    expect(custodian.move).toBe('5')
    expect(custodian.toughness).toBe('7')
    expect(custodian.save).toBe('2+')
    expect(custodian.wounds).toBe('4')
    expect(custodian.invSv).toBe('4+')
    expect(custodian.oc).toBe('2')
  })

  it('fetches all 19 JSON files', async () => {
    setupFetchMocks()

    await importWahapediaRules(() => {})

    // 19 fetch calls (factions + datasheets + 10 steps + wargear + models + missions + abilities + 3 junctions)
    expect(mockFetch).toHaveBeenCalledTimes(19)

    const urls = mockFetch.mock.calls.map((c: unknown[]) => c[0])
    expect(urls).toContain('/wahapedia/factions.json')
    expect(urls).toContain('/wahapedia/datasheets.json')
    expect(urls).toContain('/wahapedia/detachments.json')
    expect(urls).toContain('/wahapedia/stratagems.json')
    expect(urls).toContain('/wahapedia/datasheet_wargear.json')
    expect(urls).toContain('/wahapedia/datasheet_models.json')
    expect(urls).toContain('/wahapedia/missions.json')
    expect(urls).toContain('/wahapedia/abilities.json')
    expect(urls).toContain('/wahapedia/datasheet_stratagems.json')
    expect(urls).toContain('/wahapedia/datasheet_enhancements.json')
    expect(urls).toContain('/wahapedia/datasheet_detachment_abilities.json')
  })

  it('handles no BSData units loaded (empty searchUnits result)', async () => {
    mockSearchUnits.mockResolvedValue([])
    setupFetchMocks()

    const result = await importWahapediaRules(() => {})

    // All datasheets are unmatched but import still completes
    expect(result.idMappingStats!.matched).toBe(0)
    expect(result.idMappingStats!.unmatched).toBe(3)
    expect(result.errors).toEqual([])

    // Datasheets keep Wahapedia IDs
    const saved = mockSaveDatasheets.mock.calls[0]![0]
    expect(saved[0].id).toBe('000001453')
  })
})

describe('isWahapediaAvailable', () => {
  it('returns true when factions.json is accessible', async () => {
    mockFetch.mockResolvedValueOnce(headResponse(true))

    const result = await isWahapediaAvailable()

    expect(result).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith('/wahapedia/factions.json', { method: 'HEAD' })
  })

  it('returns false when factions.json is not accessible', async () => {
    mockFetch.mockResolvedValueOnce(headResponse(false))

    const result = await isWahapediaAvailable()

    expect(result).toBe(false)
  })

  it('returns false on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const result = await isWahapediaAvailable()

    expect(result).toBe(false)
  })
})

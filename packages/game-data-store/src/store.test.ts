import { describe, it, expect, beforeEach } from 'vitest'
import type { UnitProfile } from '@tabletop-tools/game-content'
import {
  saveUnits,
  getUnit,
  searchUnits,
  listFactions,
  clearFaction,
  clearAll,
  clearGameRules,
  getImportMeta,
  setImportMeta,
  getRulesImportMeta,
  setRulesImportMeta,
  createList,
  getLists,
  getList,
  updateList,
  deleteList,
  addListUnit,
  getListUnits,
  removeListUnit,
  saveDetachments,
  getDetachmentsByFaction,
  getDetachment,
  saveDetachmentAbilities,
  getDetachmentAbilities,
  saveStratagems,
  getStratagems,
  saveEnhancements,
  getEnhancements,
  saveLeaderAttachments,
  getLeaderAttachments,
  getLeadersForUnit,
  saveUnitCompositions,
  getUnitCompositions,
  saveUnitCosts,
  getUnitCosts,
  saveWargearOptions,
  getWargearOptions,
  saveUnitKeywords,
  getUnitKeywords,
  saveUnitAbilities,
  getUnitAbilities,
  saveMissions,
  getMissions,
} from './store'
import type {
  LocalList, LocalListUnit, Detachment, DetachmentAbility,
  Stratagem, Enhancement, LeaderAttachment, UnitComposition,
  UnitCost, WargearOption, UnitKeyword, UnitAbility, Mission,
} from './store'

function makeUnit(overrides: Partial<UnitProfile> & { id: string; name: string; faction: string }): UnitProfile {
  return {
    move: 6,
    toughness: 4,
    save: 3,
    wounds: 2,
    leadership: 6,
    oc: 1,
    weapons: [],
    abilities: [],
    points: 100,
    ...overrides,
  }
}

// fake-indexeddb resets between test files but not between tests,
// so we clear manually before each test.
beforeEach(async () => {
  await clearAll().catch(() => {
    // DB may not exist yet on first run — ignore
  })
  // Delete and recreate the database to ensure clean state
  const dbs = await indexedDB.databases()
  for (const db of dbs) {
    if (db.name) indexedDB.deleteDatabase(db.name)
  }
})

describe('saveUnits + getUnit', () => {
  it('saves and retrieves a unit by id', async () => {
    const unit = makeUnit({ id: 'u1', name: 'Intercessors', faction: 'Space Marines' })
    await saveUnits([unit])
    const result = await getUnit('u1')
    expect(result).toEqual(unit)
  })

  it('returns null for unknown id', async () => {
    const result = await getUnit('nonexistent')
    expect(result).toBeNull()
  })

  it('overwrites existing unit with same id', async () => {
    const v1 = makeUnit({ id: 'u1', name: 'Intercessors', faction: 'Space Marines', points: 100 })
    const v2 = makeUnit({ id: 'u1', name: 'Intercessors', faction: 'Space Marines', points: 120 })
    await saveUnits([v1])
    await saveUnits([v2])
    const result = await getUnit('u1')
    expect(result?.points).toBe(120)
  })

  it('saves multiple units in one call', async () => {
    const units = [
      makeUnit({ id: 'u1', name: 'Intercessors', faction: 'Space Marines' }),
      makeUnit({ id: 'u2', name: 'Hellblasters', faction: 'Space Marines' }),
      makeUnit({ id: 'u3', name: 'Boyz', faction: 'Orks' }),
    ]
    await saveUnits(units)
    expect(await getUnit('u1')).not.toBeNull()
    expect(await getUnit('u2')).not.toBeNull()
    expect(await getUnit('u3')).not.toBeNull()
  })
})

describe('searchUnits', () => {
  const units = [
    makeUnit({ id: 'u1', name: 'Intercessors', faction: 'Space Marines' }),
    makeUnit({ id: 'u2', name: 'Hellblasters', faction: 'Space Marines' }),
    makeUnit({ id: 'u3', name: 'Boyz', faction: 'Orks' }),
    makeUnit({ id: 'u4', name: 'Nobz', faction: 'Orks' }),
  ]

  beforeEach(async () => {
    await saveUnits(units)
  })

  it('returns all units when no query provided', async () => {
    const results = await searchUnits({})
    expect(results).toHaveLength(4)
  })

  it('filters by faction', async () => {
    const results = await searchUnits({ faction: 'Orks' })
    expect(results).toHaveLength(2)
    expect(results.every(u => u.faction === 'Orks')).toBe(true)
  })

  it('filters by name substring (case-insensitive)', async () => {
    const results = await searchUnits({ name: 'inter' })
    expect(results).toHaveLength(1)
    expect(results[0]!.name).toBe('Intercessors')
  })

  it('filters by both faction and name', async () => {
    const results = await searchUnits({ faction: 'Space Marines', name: 'hell' })
    expect(results).toHaveLength(1)
    expect(results[0]!.name).toBe('Hellblasters')
  })

  it('returns empty for non-matching faction', async () => {
    const results = await searchUnits({ faction: 'Tyranids' })
    expect(results).toHaveLength(0)
  })

  it('returns empty for non-matching name', async () => {
    const results = await searchUnits({ name: 'zzzzz' })
    expect(results).toHaveLength(0)
  })
})

describe('listFactions', () => {
  it('returns unique faction names', async () => {
    await saveUnits([
      makeUnit({ id: 'u1', name: 'Intercessors', faction: 'Space Marines' }),
      makeUnit({ id: 'u2', name: 'Hellblasters', faction: 'Space Marines' }),
      makeUnit({ id: 'u3', name: 'Boyz', faction: 'Orks' }),
    ])
    const factions = await listFactions()
    expect(factions.sort()).toEqual(['Orks', 'Space Marines'])
  })

  it('returns empty array when no units stored', async () => {
    const factions = await listFactions()
    expect(factions).toEqual([])
  })
})

describe('clearFaction', () => {
  it('removes all units of a specific faction', async () => {
    await saveUnits([
      makeUnit({ id: 'u1', name: 'Intercessors', faction: 'Space Marines' }),
      makeUnit({ id: 'u2', name: 'Boyz', faction: 'Orks' }),
    ])
    await clearFaction('Space Marines')
    expect(await getUnit('u1')).toBeNull()
    expect(await getUnit('u2')).not.toBeNull()
  })
})

describe('clearAll', () => {
  it('removes all units and meta', async () => {
    await saveUnits([
      makeUnit({ id: 'u1', name: 'Intercessors', faction: 'Space Marines' }),
    ])
    await setImportMeta({ lastImport: Date.now(), factions: ['Space Marines'], totalUnits: 1 })
    await clearAll()
    expect(await getUnit('u1')).toBeNull()
    expect(await getImportMeta()).toBeNull()
  })

  it('clears game rules stores too', async () => {
    await saveDetachments([{ id: 'd1', factionId: 'SM', name: 'Gladius', legend: '', type: '' }])
    await saveStratagems([{ id: 's1', factionId: 'SM', detachmentId: 'd1', name: 'Test', type: '', cpCost: '1', turn: '', phase: '', legend: '', description: '' }])
    await clearAll()
    expect(await getDetachmentsByFaction('SM')).toEqual([])
    expect(await getStratagems({ factionId: 'SM' })).toEqual([])
  })
})

describe('importMeta', () => {
  it('returns null when no meta set', async () => {
    expect(await getImportMeta()).toBeNull()
  })

  it('saves and retrieves import metadata', async () => {
    const meta = { lastImport: 1700000000000, factions: ['Orks', 'Space Marines'], totalUnits: 42 }
    await setImportMeta(meta)
    expect(await getImportMeta()).toEqual(meta)
  })

  it('overwrites existing meta', async () => {
    await setImportMeta({ lastImport: 1, factions: ['A'], totalUnits: 1 })
    await setImportMeta({ lastImport: 2, factions: ['B', 'C'], totalUnits: 10 })
    const meta = await getImportMeta()
    expect(meta?.lastImport).toBe(2)
    expect(meta?.totalUnits).toBe(10)
  })

  it('round-trips parserVersion', async () => {
    await setImportMeta({ lastImport: 1, factions: ['Orks'], totalUnits: 5, parserVersion: 2 })
    const meta = await getImportMeta()
    expect(meta?.parserVersion).toBe(2)
  })
})

describe('rulesImportMeta', () => {
  it('returns null when no rules meta set', async () => {
    expect(await getRulesImportMeta()).toBeNull()
  })

  it('saves and retrieves rules import metadata', async () => {
    const meta = {
      lastImport: 1700000000000,
      counts: {
        detachments: 246, stratagems: 1397, enhancements: 869,
        leaderAttachments: 1899, unitCompositions: 2138, unitCosts: 2104,
        wargearOptions: 2790, unitKeywords: 15685, unitAbilities: 7031,
        missions: 0, abilities: 0, datasheetStratagems: 0,
        datasheetEnhancements: 0, datasheetDetachmentAbilities: 0,
      },
    }
    await setRulesImportMeta(meta)
    expect(await getRulesImportMeta()).toEqual(meta)
  })

  it('is independent of unit import meta', async () => {
    await setImportMeta({ lastImport: 1, factions: ['A'], totalUnits: 1 })
    await setRulesImportMeta({
      lastImport: 2,
      counts: { detachments: 1, stratagems: 0, enhancements: 0, leaderAttachments: 0, unitCompositions: 0, unitCosts: 0, wargearOptions: 0, unitKeywords: 0, unitAbilities: 0, missions: 0, abilities: 0, datasheetStratagems: 0, datasheetEnhancements: 0, datasheetDetachmentAbilities: 0 },
    })
    expect((await getImportMeta())?.lastImport).toBe(1)
    expect((await getRulesImportMeta())?.lastImport).toBe(2)
  })
})

// ── List CRUD ────────────────────────────────────────────────────────────────

function makeList(overrides: Partial<LocalList> & { id: string }): LocalList {
  return {
    faction: 'Space Marines',
    name: 'My List',
    totalPts: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

function makeListUnit(overrides: Partial<LocalListUnit> & { id: string; listId: string }): LocalListUnit {
  return {
    unitContentId: 'unit-1',
    unitName: 'Intercessors',
    unitPoints: 90,
    count: 1,
    ...overrides,
  }
}

describe('createList + getLists', () => {
  it('creates and retrieves a list', async () => {
    const list = makeList({ id: 'l1' })
    await createList(list)
    const lists = await getLists()
    expect(lists).toHaveLength(1)
    expect(lists[0]!.id).toBe('l1')
    expect(lists[0]!.name).toBe('My List')
  })

  it('returns empty when no lists', async () => {
    const lists = await getLists()
    expect(lists).toEqual([])
  })
})

describe('getList', () => {
  it('returns a list by id', async () => {
    await createList(makeList({ id: 'l1', name: 'Test' }))
    const list = await getList('l1')
    expect(list).not.toBeNull()
    expect(list!.name).toBe('Test')
  })

  it('returns null for unknown id', async () => {
    const list = await getList('nonexistent')
    expect(list).toBeNull()
  })
})

describe('updateList', () => {
  it('updates list fields', async () => {
    await createList(makeList({ id: 'l1', totalPts: 0 }))
    await updateList('l1', { totalPts: 200, name: 'Updated' })
    const list = await getList('l1')
    expect(list!.totalPts).toBe(200)
    expect(list!.name).toBe('Updated')
  })

  it('is a no-op for unknown id', async () => {
    // Should not throw
    await updateList('nonexistent', { totalPts: 100 })
    const list = await getList('nonexistent')
    expect(list).toBeNull()
  })
})

describe('deleteList', () => {
  it('deletes a list and its units', async () => {
    await createList(makeList({ id: 'l1' }))
    await addListUnit(makeListUnit({ id: 'lu1', listId: 'l1' }))
    await deleteList('l1')
    expect(await getList('l1')).toBeNull()
    expect(await getListUnits('l1')).toEqual([])
  })
})

describe('addListUnit + getListUnits', () => {
  it('adds and retrieves list units', async () => {
    await createList(makeList({ id: 'l1' }))
    await addListUnit(makeListUnit({ id: 'lu1', listId: 'l1', unitName: 'Intercessors' }))
    await addListUnit(makeListUnit({ id: 'lu2', listId: 'l1', unitName: 'Hellblasters' }))
    const units = await getListUnits('l1')
    expect(units).toHaveLength(2)
  })

  it('returns only units for the specified list', async () => {
    await createList(makeList({ id: 'l1' }))
    await createList(makeList({ id: 'l2' }))
    await addListUnit(makeListUnit({ id: 'lu1', listId: 'l1' }))
    await addListUnit(makeListUnit({ id: 'lu2', listId: 'l2' }))
    expect(await getListUnits('l1')).toHaveLength(1)
    expect(await getListUnits('l2')).toHaveLength(1)
  })

  it('returns empty for a list with no units', async () => {
    await createList(makeList({ id: 'l1' }))
    expect(await getListUnits('l1')).toEqual([])
  })
})

describe('removeListUnit', () => {
  it('removes a specific list unit', async () => {
    await createList(makeList({ id: 'l1' }))
    await addListUnit(makeListUnit({ id: 'lu1', listId: 'l1' }))
    await addListUnit(makeListUnit({ id: 'lu2', listId: 'l1' }))
    await removeListUnit('lu1')
    const units = await getListUnits('l1')
    expect(units).toHaveLength(1)
    expect(units[0]!.id).toBe('lu2')
  })
})

// ── Detachments ──────────────────────────────────────────────────────────────

describe('detachments', () => {
  const detachments: Detachment[] = [
    { id: 'd1', factionId: 'SM', name: 'Gladius Task Force', legend: 'A versatile force', type: '' },
    { id: 'd2', factionId: 'SM', name: 'Firestorm Assault', legend: 'Aggressive tactics', type: '' },
    { id: 'd3', factionId: 'ORK', name: 'Waaagh! Tribe', legend: 'Green tide', type: '' },
  ]

  it('saves and retrieves by faction', async () => {
    await saveDetachments(detachments)
    const sm = await getDetachmentsByFaction('SM')
    expect(sm).toHaveLength(2)
    expect(sm.map(d => d.name).sort()).toEqual(['Firestorm Assault', 'Gladius Task Force'])
  })

  it('returns empty for unknown faction', async () => {
    await saveDetachments(detachments)
    expect(await getDetachmentsByFaction('TYR')).toEqual([])
  })

  it('retrieves single detachment by id', async () => {
    await saveDetachments(detachments)
    const d = await getDetachment('d1')
    expect(d).not.toBeNull()
    expect(d!.name).toBe('Gladius Task Force')
  })

  it('returns null for unknown detachment id', async () => {
    expect(await getDetachment('nonexistent')).toBeNull()
  })

  it('overwrites on re-save', async () => {
    await saveDetachments([{ id: 'd1', factionId: 'SM', name: 'Old Name', legend: '', type: '' }])
    await saveDetachments([{ id: 'd1', factionId: 'SM', name: 'New Name', legend: '', type: '' }])
    const d = await getDetachment('d1')
    expect(d!.name).toBe('New Name')
  })
})

// ── Detachment Abilities ─────────────────────────────────────────────────────

describe('detachmentAbilities', () => {
  it('saves and retrieves by detachment', async () => {
    const abilities: DetachmentAbility[] = [
      { id: 'da1', detachmentId: 'd1', factionId: 'SM', name: 'Combat Doctrines', legend: '', description: 'Re-roll hits' },
      { id: 'da2', detachmentId: 'd1', factionId: 'SM', name: 'Oath of Moment', legend: '', description: 'Re-roll wounds' },
      { id: 'da3', detachmentId: 'd2', factionId: 'SM', name: 'Other', legend: '', description: 'Something' },
    ]
    await saveDetachmentAbilities(abilities)
    const result = await getDetachmentAbilities('d1')
    expect(result).toHaveLength(2)
  })

  it('returns empty for unknown detachment', async () => {
    expect(await getDetachmentAbilities('nonexistent')).toEqual([])
  })
})

// ── Stratagems ───────────────────────────────────────────────────────────────

describe('stratagems', () => {
  const stratagems: Stratagem[] = [
    { id: 's1', factionId: 'SM', detachmentId: 'd1', name: 'Fire Discipline', type: 'Battle Tactic', cpCost: '1', turn: 'Your turn', phase: 'Shooting', legend: '', description: 'Re-roll hits' },
    { id: 's2', factionId: 'SM', detachmentId: 'd1', name: 'Armour of Contempt', type: 'Strategic Ploy', cpCost: '1', turn: 'Either', phase: 'Shooting', legend: '', description: 'Improve save' },
    { id: 's3', factionId: 'SM', detachmentId: 'd2', name: 'Firestorm', type: 'Battle Tactic', cpCost: '2', turn: 'Your turn', phase: 'Shooting', legend: '', description: 'Extra attacks' },
    { id: 's4', factionId: 'ORK', detachmentId: 'd3', name: 'Waaagh!', type: 'Epic Deed', cpCost: '1', turn: 'Your turn', phase: 'Command', legend: '', description: 'Charge bonus' },
  ]

  beforeEach(async () => {
    await saveStratagems(stratagems)
  })

  it('retrieves by faction', async () => {
    const result = await getStratagems({ factionId: 'SM' })
    expect(result).toHaveLength(3)
  })

  it('filters by faction + detachment', async () => {
    const result = await getStratagems({ factionId: 'SM', detachmentId: 'd1' })
    expect(result).toHaveLength(2)
    expect(result.every(s => s.detachmentId === 'd1')).toBe(true)
  })

  it('returns empty for unknown faction', async () => {
    expect(await getStratagems({ factionId: 'TYR' })).toEqual([])
  })

  it('returns empty when detachment filter matches nothing', async () => {
    expect(await getStratagems({ factionId: 'SM', detachmentId: 'nonexistent' })).toEqual([])
  })
})

// ── Enhancements ─────────────────────────────────────────────────────────────

describe('enhancements', () => {
  it('saves and retrieves by detachment', async () => {
    const items: Enhancement[] = [
      { id: 'e1', factionId: 'SM', detachmentId: 'd1', name: 'Artificer Armour', legend: '', description: '+1 save', cost: '25' },
      { id: 'e2', factionId: 'SM', detachmentId: 'd1', name: 'Master-crafted Weapon', legend: '', description: '+1 damage', cost: '15' },
      { id: 'e3', factionId: 'SM', detachmentId: 'd2', name: 'Other', legend: '', description: 'Something', cost: '10' },
    ]
    await saveEnhancements(items)
    const result = await getEnhancements('d1')
    expect(result).toHaveLength(2)
  })

  it('returns empty for unknown detachment', async () => {
    expect(await getEnhancements('nonexistent')).toEqual([])
  })
})

// ── Leader Attachments ───────────────────────────────────────────────────────

describe('leaderAttachments', () => {
  it('saves and retrieves by leader', async () => {
    const items: LeaderAttachment[] = [
      { id: 'la1', leaderId: 'captain', attachedId: 'intercessors' },
      { id: 'la2', leaderId: 'captain', attachedId: 'hellblasters' },
      { id: 'la3', leaderId: 'chaplain', attachedId: 'assault-intercessors' },
    ]
    await saveLeaderAttachments(items)
    const result = await getLeaderAttachments('captain')
    expect(result).toHaveLength(2)
    expect(result.map(la => la.attachedId).sort()).toEqual(['hellblasters', 'intercessors'])
  })

  it('returns empty for unknown leader', async () => {
    expect(await getLeaderAttachments('nonexistent')).toEqual([])
  })

  it('reverse lookup: retrieves leaders for a unit', async () => {
    const items: LeaderAttachment[] = [
      { id: 'la4', leaderId: 'captain', attachedId: 'intercessors' },
      { id: 'la5', leaderId: 'chaplain', attachedId: 'intercessors' },
      { id: 'la6', leaderId: 'captain', attachedId: 'hellblasters' },
    ]
    await saveLeaderAttachments(items)
    const result = await getLeadersForUnit('intercessors')
    expect(result).toHaveLength(2)
    expect(result.map(la => la.leaderId).sort()).toEqual(['captain', 'chaplain'])
  })

  it('reverse lookup returns empty for unknown unit', async () => {
    expect(await getLeadersForUnit('nonexistent')).toEqual([])
  })
})

// ── Unit Compositions ────────────────────────────────────────────────────────

describe('unitCompositions', () => {
  it('saves and retrieves by datasheet', async () => {
    const items: UnitComposition[] = [
      { id: 'uc1', datasheetId: 'ds1', line: '1', description: '5-10 Intercessor Marines' },
      { id: 'uc2', datasheetId: 'ds1', line: '2', description: '1 Intercessor Sergeant' },
      { id: 'uc3', datasheetId: 'ds2', line: '1', description: '1 Captain' },
    ]
    await saveUnitCompositions(items)
    expect(await getUnitCompositions('ds1')).toHaveLength(2)
    expect(await getUnitCompositions('ds2')).toHaveLength(1)
  })
})

// ── Unit Costs ───────────────────────────────────────────────────────────────

describe('unitCosts', () => {
  it('saves and retrieves by datasheet', async () => {
    const items: UnitCost[] = [
      { id: 'cost1', datasheetId: 'ds1', line: '1', description: '5 models', cost: '90' },
      { id: 'cost2', datasheetId: 'ds1', line: '2', description: '10 models', cost: '180' },
    ]
    await saveUnitCosts(items)
    const result = await getUnitCosts('ds1')
    expect(result).toHaveLength(2)
    expect(result.find(c => c.line === '1')!.cost).toBe('90')
  })
})

// ── Wargear Options ──────────────────────────────────────────────────────────

describe('wargearOptions', () => {
  it('saves and retrieves by datasheet', async () => {
    const items: WargearOption[] = [
      { id: 'wo1', datasheetId: 'ds1', line: '1', description: 'Replace bolt rifle with stalker bolt rifle' },
      { id: 'wo2', datasheetId: 'ds1', line: '2', description: 'Replace bolt pistol with plasma pistol' },
    ]
    await saveWargearOptions(items)
    expect(await getWargearOptions('ds1')).toHaveLength(2)
    expect(await getWargearOptions('ds2')).toEqual([])
  })
})

// ── Unit Keywords ────────────────────────────────────────────────────────────

describe('unitKeywords', () => {
  it('saves and retrieves by datasheet', async () => {
    const items: UnitKeyword[] = [
      { id: 'kw1', datasheetId: 'ds1', keyword: 'Infantry', isFactionKeyword: false },
      { id: 'kw2', datasheetId: 'ds1', keyword: 'Imperium', isFactionKeyword: true },
      { id: 'kw3', datasheetId: 'ds1', keyword: 'Battleline', isFactionKeyword: false },
      { id: 'kw4', datasheetId: 'ds2', keyword: 'Vehicle', isFactionKeyword: false },
    ]
    await saveUnitKeywords(items)
    const result = await getUnitKeywords('ds1')
    expect(result).toHaveLength(3)
    expect(result.filter(k => k.isFactionKeyword)).toHaveLength(1)
  })
})

// ── Unit Abilities ───────────────────────────────────────────────────────────

describe('unitAbilities', () => {
  it('saves and retrieves by datasheet', async () => {
    const items: UnitAbility[] = [
      { id: 'ab1', datasheetId: 'ds1', name: 'Oath of Moment', description: 'Re-roll hits against target', type: 'Faction' },
      { id: 'ab2', datasheetId: 'ds1', name: 'Bolter Discipline', description: 'Rapid fire bonus', type: 'Core' },
    ]
    await saveUnitAbilities(items)
    expect(await getUnitAbilities('ds1')).toHaveLength(2)
    expect(await getUnitAbilities('ds2')).toEqual([])
  })
})

// ── Missions ─────────────────────────────────────────────────────────────────

describe('missions', () => {
  it('saves and retrieves all missions', async () => {
    const items: Mission[] = [
      { id: 'm1', name: 'Take and Hold', type: 'primary', description: 'Score VP for objectives held' },
      { id: 'm2', name: 'Supply Drop', type: 'primary', description: 'New objectives appear mid-game' },
      { id: 'm3', name: 'Hammer and Anvil', type: 'deployment_zone', description: 'Long deployment zones' },
    ]
    await saveMissions(items)
    const result = await getMissions()
    expect(result).toHaveLength(3)
  })

  it('returns empty when no missions stored', async () => {
    expect(await getMissions()).toEqual([])
  })

  it('overwrites missions on re-save', async () => {
    await saveMissions([{ id: 'm1', name: 'Old', type: 'primary', description: '' }])
    await saveMissions([{ id: 'm1', name: 'New', type: 'primary', description: '' }])
    const result = await getMissions()
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('New')
  })
})

// ── clearGameRules ───────────────────────────────────────────────────────────

describe('clearGameRules', () => {
  it('clears game rules stores but preserves units and lists', async () => {
    // Save units and lists
    await saveUnits([makeUnit({ id: 'u1', name: 'Intercessors', faction: 'Space Marines' })])
    await createList(makeList({ id: 'l1' }))

    // Save game rules data
    await saveDetachments([{ id: 'd1', factionId: 'SM', name: 'Gladius', legend: '', type: '' }])
    await saveStratagems([{ id: 's1', factionId: 'SM', detachmentId: 'd1', name: 'Test', type: '', cpCost: '1', turn: '', phase: '', legend: '', description: '' }])
    await saveEnhancements([{ id: 'e1', factionId: 'SM', detachmentId: 'd1', name: 'Test', legend: '', description: '', cost: '10' }])
    await saveMissions([{ id: 'm1', name: 'Test', type: 'primary', description: '' }])

    // Clear only game rules
    await clearGameRules()

    // Game rules should be gone
    expect(await getDetachmentsByFaction('SM')).toEqual([])
    expect(await getStratagems({ factionId: 'SM' })).toEqual([])
    expect(await getEnhancements('d1')).toEqual([])
    expect(await getMissions()).toEqual([])

    // Units and lists should still exist
    expect(await getUnit('u1')).not.toBeNull()
    expect(await getList('l1')).not.toBeNull()
  })
})

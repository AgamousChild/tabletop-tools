import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import type { UnitProfile } from '@tabletop-tools/game-content'
import {
  saveUnits, clearAll, setImportMeta, createList, addListUnit,
  saveDetachments, saveDetachmentAbilities, saveStratagems,
  saveEnhancements, saveLeaderAttachments, saveUnitCompositions,
  saveUnitCosts, saveWargearOptions, saveUnitKeywords,
  saveUnitAbilities, saveMissions, setRulesImportMeta,
} from './store'
import type { LocalList, LocalListUnit } from './store'
import {
  useUnit, useUnitSearch, useFactions, useGameDataAvailable, useLists, useList,
  useDetachments, useDetachment, useDetachmentAbilities,
  useStratagems, useEnhancements, useLeaderAttachments, useLeadersForUnit,
  useUnitCompositions, useUnitCosts, useWargearOptions,
  useUnitKeywords, useUnitAbilities, useMissions, useRulesImportMeta,
} from './hooks'

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

beforeEach(async () => {
  await clearAll().catch(() => {})
  const dbs = await indexedDB.databases()
  for (const db of dbs) {
    if (db.name) indexedDB.deleteDatabase(db.name)
  }
})

describe('useUnit', () => {
  it('returns null for unknown id', async () => {
    const { result } = renderHook(() => useUnit('nonexistent'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toBeNull()
  })

  it('returns a saved unit', async () => {
    const unit = makeUnit({ id: 'u1', name: 'Intercessors', faction: 'Space Marines' })
    await saveUnits([unit])
    const { result } = renderHook(() => useUnit('u1'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toEqual(unit)
  })
})

describe('useUnitSearch', () => {
  beforeEach(async () => {
    await saveUnits([
      makeUnit({ id: 'u1', name: 'Intercessors', faction: 'Space Marines' }),
      makeUnit({ id: 'u2', name: 'Boyz', faction: 'Orks' }),
    ])
  })

  it('returns all units with empty query', async () => {
    const { result } = renderHook(() => useUnitSearch({}))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toHaveLength(2)
  })

  it('filters by faction', async () => {
    const { result } = renderHook(() => useUnitSearch({ faction: 'Orks' }))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toHaveLength(1)
    expect(result.current.data[0]!.name).toBe('Boyz')
  })
})

describe('useFactions', () => {
  it('returns empty array initially', async () => {
    const { result } = renderHook(() => useFactions())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toEqual([])
  })

  it('returns faction names after save', async () => {
    await saveUnits([
      makeUnit({ id: 'u1', name: 'Intercessors', faction: 'Space Marines' }),
      makeUnit({ id: 'u2', name: 'Boyz', faction: 'Orks' }),
    ])
    const { result } = renderHook(() => useFactions())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data.sort()).toEqual(['Orks', 'Space Marines'])
  })
})

describe('useGameDataAvailable', () => {
  it('returns false when no meta', async () => {
    const { result } = renderHook(() => useGameDataAvailable())
    await waitFor(() => expect(result.current).toBe(false))
  })

  it('returns true when units are imported', async () => {
    await setImportMeta({ lastImport: Date.now(), factions: ['Orks'], totalUnits: 5 })
    const { result } = renderHook(() => useGameDataAvailable())
    await waitFor(() => expect(result.current).toBe(true))
  })

  it('returns false when totalUnits is 0', async () => {
    await setImportMeta({ lastImport: Date.now(), factions: [], totalUnits: 0 })
    const { result } = renderHook(() => useGameDataAvailable())
    await waitFor(() => expect(result.current).toBe(false))
  })
})

// ── List hooks ──────────────────────────────────────────────────────────────

function makeLocalList(overrides: Partial<LocalList> & { id: string }): LocalList {
  return {
    faction: 'Space Marines',
    name: 'My List',
    totalPts: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

describe('useLists', () => {
  it('returns empty array when no lists', async () => {
    const { result } = renderHook(() => useLists())
    await waitFor(() => expect(result.current.data).toEqual([]))
  })

  it('returns saved lists', async () => {
    await createList(makeLocalList({ id: 'l1', name: 'Alpha' }))
    await createList(makeLocalList({ id: 'l2', name: 'Beta' }))
    const { result } = renderHook(() => useLists())
    await waitFor(() => expect(result.current.data).toHaveLength(2))
  })

  it('refetch updates the data', async () => {
    const { result } = renderHook(() => useLists())
    await waitFor(() => expect(result.current.data).toEqual([]))

    await createList(makeLocalList({ id: 'l1' }))
    act(() => result.current.refetch())
    await waitFor(() => expect(result.current.data).toHaveLength(1))
  })
})

describe('useList', () => {
  it('returns null when id is null', async () => {
    const { result } = renderHook(() => useList(null))
    await waitFor(() => expect(result.current.data).toBeNull())
  })

  it('returns list with units', async () => {
    await createList(makeLocalList({ id: 'l1', name: 'Test' }))
    await addListUnit({
      id: 'lu1',
      listId: 'l1',
      unitContentId: 'u1',
      unitName: 'Intercessors',
      unitPoints: 90,
      count: 1,
    })

    const { result } = renderHook(() => useList('l1'))
    await waitFor(() => expect(result.current.data).not.toBeNull())
    expect(result.current.data!.name).toBe('Test')
    expect(result.current.data!.units).toHaveLength(1)
    expect(result.current.data!.units[0]!.unitName).toBe('Intercessors')
  })

  it('returns null for unknown id', async () => {
    const { result } = renderHook(() => useList('nonexistent'))
    // Initially null, stays null
    await waitFor(() => expect(result.current.data).toBeNull())
  })
})

// ── Detachment hooks ─────────────────────────────────────────────────────────

describe('useDetachments', () => {
  it('returns detachments for a faction', async () => {
    await saveDetachments([
      { id: 'd1', factionId: 'SM', name: 'Gladius', legend: '', type: '' },
      { id: 'd2', factionId: 'SM', name: 'Firestorm', legend: '', type: '' },
      { id: 'd3', factionId: 'ORK', name: 'Waaagh!', legend: '', type: '' },
    ])
    const { result } = renderHook(() => useDetachments('SM'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toHaveLength(2)
  })

  it('returns empty for unknown faction', async () => {
    const { result } = renderHook(() => useDetachments('TYR'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toEqual([])
  })
})

describe('useDetachment', () => {
  it('returns a single detachment by id', async () => {
    await saveDetachments([
      { id: 'd1', factionId: 'SM', name: 'Gladius', legend: '', type: '' },
    ])
    const { result } = renderHook(() => useDetachment('d1'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).not.toBeNull()
    expect(result.current.data!.name).toBe('Gladius')
  })

  it('returns null for unknown id', async () => {
    const { result } = renderHook(() => useDetachment('nonexistent'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toBeNull()
  })
})

describe('useDetachmentAbilities', () => {
  it('returns abilities for a detachment', async () => {
    await saveDetachmentAbilities([
      { id: 'da1', detachmentId: 'd1', factionId: 'SM', name: 'Combat Doctrines', legend: '', description: 'Re-roll hits' },
      { id: 'da2', detachmentId: 'd2', factionId: 'SM', name: 'Other', legend: '', description: 'Something' },
    ])
    const { result } = renderHook(() => useDetachmentAbilities('d1'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toHaveLength(1)
    expect(result.current.data[0]!.name).toBe('Combat Doctrines')
  })
})

// ── Stratagem hooks ──────────────────────────────────────────────────────────

describe('useStratagems', () => {
  beforeEach(async () => {
    await saveStratagems([
      { id: 's1', factionId: 'SM', detachmentId: 'd1', name: 'Fire Discipline', type: 'Battle Tactic', cpCost: '1', turn: 'Your turn', phase: 'Shooting', legend: '', description: '' },
      { id: 's2', factionId: 'SM', detachmentId: 'd2', name: 'Firestorm', type: 'Battle Tactic', cpCost: '2', turn: 'Your turn', phase: 'Shooting', legend: '', description: '' },
      { id: 's3', factionId: 'ORK', detachmentId: 'd3', name: 'Waaagh!', type: 'Epic Deed', cpCost: '1', turn: 'Your turn', phase: 'Command', legend: '', description: '' },
    ])
  })

  it('returns stratagems by faction', async () => {
    const { result } = renderHook(() => useStratagems({ factionId: 'SM' }))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toHaveLength(2)
  })

  it('filters by faction + detachment', async () => {
    const { result } = renderHook(() => useStratagems({ factionId: 'SM', detachmentId: 'd1' }))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toHaveLength(1)
    expect(result.current.data[0]!.name).toBe('Fire Discipline')
  })
})

// ── Enhancement hooks ────────────────────────────────────────────────────────

describe('useEnhancements', () => {
  it('returns enhancements for a detachment', async () => {
    await saveEnhancements([
      { id: 'e1', factionId: 'SM', detachmentId: 'd1', name: 'Artificer Armour', legend: '', description: '', cost: '25' },
      { id: 'e2', factionId: 'SM', detachmentId: 'd2', name: 'Other', legend: '', description: '', cost: '10' },
    ])
    const { result } = renderHook(() => useEnhancements('d1'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toHaveLength(1)
  })
})

// ── Leader attachment hooks ──────────────────────────────────────────────────

describe('useLeaderAttachments', () => {
  it('returns attachments for a leader', async () => {
    await saveLeaderAttachments([
      { id: 'la1', leaderId: 'captain', attachedId: 'intercessors' },
      { id: 'la2', leaderId: 'captain', attachedId: 'hellblasters' },
      { id: 'la3', leaderId: 'chaplain', attachedId: 'assault-intercessors' },
    ])
    const { result } = renderHook(() => useLeaderAttachments('captain'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toHaveLength(2)
  })
})

describe('useLeadersForUnit', () => {
  it('returns leaders that can attach to a unit', async () => {
    await saveLeaderAttachments([
      { id: 'la4', leaderId: 'captain', attachedId: 'intercessors' },
      { id: 'la5', leaderId: 'chaplain', attachedId: 'intercessors' },
      { id: 'la6', leaderId: 'captain', attachedId: 'hellblasters' },
    ])
    const { result } = renderHook(() => useLeadersForUnit('intercessors'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toHaveLength(2)
  })
})

// ── Unit detail hooks ────────────────────────────────────────────────────────

describe('useUnitCompositions', () => {
  it('returns compositions for a datasheet', async () => {
    await saveUnitCompositions([
      { id: 'uc1', datasheetId: 'ds1', line: '1', description: '5-10 Marines' },
      { id: 'uc2', datasheetId: 'ds2', line: '1', description: '1 Captain' },
    ])
    const { result } = renderHook(() => useUnitCompositions('ds1'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toHaveLength(1)
  })
})

describe('useUnitCosts', () => {
  it('returns costs for a datasheet', async () => {
    await saveUnitCosts([
      { id: 'cost1', datasheetId: 'ds1', line: '1', description: '5 models', cost: '90' },
      { id: 'cost2', datasheetId: 'ds1', line: '2', description: '10 models', cost: '180' },
    ])
    const { result } = renderHook(() => useUnitCosts('ds1'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toHaveLength(2)
  })
})

describe('useWargearOptions', () => {
  it('returns options for a datasheet', async () => {
    await saveWargearOptions([
      { id: 'wo1', datasheetId: 'ds1', line: '1', description: 'Replace bolt rifle' },
    ])
    const { result } = renderHook(() => useWargearOptions('ds1'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toHaveLength(1)
  })
})

describe('useUnitKeywords', () => {
  it('returns keywords for a datasheet', async () => {
    await saveUnitKeywords([
      { id: 'kw1', datasheetId: 'ds1', keyword: 'Infantry', isFactionKeyword: false },
      { id: 'kw2', datasheetId: 'ds1', keyword: 'Imperium', isFactionKeyword: true },
    ])
    const { result } = renderHook(() => useUnitKeywords('ds1'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toHaveLength(2)
  })
})

describe('useUnitAbilities', () => {
  it('returns abilities for a datasheet', async () => {
    await saveUnitAbilities([
      { id: 'ab1', datasheetId: 'ds1', name: 'Oath of Moment', description: 'Re-roll hits', type: 'Faction' },
      { id: 'ab2', datasheetId: 'ds1', name: 'Bolter Discipline', description: 'Rapid fire', type: 'Core' },
    ])
    const { result } = renderHook(() => useUnitAbilities('ds1'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toHaveLength(2)
  })
})

// ── Mission hooks ────────────────────────────────────────────────────────────

describe('useMissions', () => {
  it('returns all missions', async () => {
    await saveMissions([
      { id: 'm1', name: 'Take and Hold', type: 'primary', description: '' },
      { id: 'm2', name: 'Hammer and Anvil', type: 'deployment_zone', description: '' },
    ])
    const { result } = renderHook(() => useMissions())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toHaveLength(2)
  })

  it('returns empty when no missions', async () => {
    const { result } = renderHook(() => useMissions())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toEqual([])
  })
})

// ── Rules import meta hook ───────────────────────────────────────────────────

describe('useRulesImportMeta', () => {
  it('returns null when no rules meta', async () => {
    const { result } = renderHook(() => useRulesImportMeta())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toBeNull()
  })

  it('returns rules import meta after save', async () => {
    await setRulesImportMeta({
      lastImport: Date.now(),
      counts: { detachments: 10, stratagems: 20, enhancements: 5, leaderAttachments: 15, unitCompositions: 30, unitCosts: 25, wargearOptions: 40, unitKeywords: 100, unitAbilities: 50, missions: 0, abilities: 0, datasheetStratagems: 0, datasheetEnhancements: 0, datasheetDetachmentAbilities: 0 },
    })
    const { result } = renderHook(() => useRulesImportMeta())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).not.toBeNull()
    expect(result.current.data!.counts.detachments).toBe(10)
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import type { UnitProfile } from '@tabletop-tools/game-content'
import {
  saveUnits,
  getUnit,
  searchUnits,
  listFactions,
  clearFaction,
  clearAll,
  getImportMeta,
  setImportMeta,
  createList,
  getLists,
  getList,
  updateList,
  deleteList,
  addListUnit,
  getListUnits,
  removeListUnit,
} from './store'
import type { LocalList, LocalListUnit } from './store'

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

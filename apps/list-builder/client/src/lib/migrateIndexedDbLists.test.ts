import { beforeEach, describe, expect, it, vi } from 'vitest'

import { isMigrationDone, markMigrationDone, migrateIndexedDbLists } from './migrateIndexedDbLists'

// Mock the game-data-store so no real IndexedDB calls happen
vi.mock('@tabletop-tools/game-data-store', () => ({
  getLists: vi.fn().mockResolvedValue([]),
  getList: vi.fn().mockResolvedValue(undefined),
  getListUnits: vi.fn().mockResolvedValue([]),
}))

// Mock the imperative helpers from useListsV2
vi.mock('./useListsV2', () => ({
  createListV2Imperative: vi.fn().mockResolvedValue('server-id'),
  addUnitV2Imperative: vi.fn().mockResolvedValue('unit-server-id'),
  pointsToBattleSizeEnum: (pts: number) => {
    const map: Record<number, string> = {
      500: 'Incursion',
      1000: 'Strike Force',
      2000: 'Strike Force',
      3000: 'Onslaught',
    }
    return map[pts] ?? 'unknown'
  },
}))

const MIGRATION_KEY = 'list-builder:idb-migration-v2-done'

beforeEach(() => {
  localStorage.clear()
})

describe('isMigrationDone', () => {
  it('returns false when key is not set', () => {
    expect(isMigrationDone()).toBe(false)
  })

  it('returns true when key is set to 1', () => {
    localStorage.setItem(MIGRATION_KEY, '1')
    expect(isMigrationDone()).toBe(true)
  })
})

describe('markMigrationDone', () => {
  it('sets the migration key in localStorage', () => {
    markMigrationDone()
    expect(localStorage.getItem(MIGRATION_KEY)).toBe('1')
  })
})

describe('migrateIndexedDbLists', () => {
  it('returns skipped=true if migration already done', async () => {
    markMigrationDone()
    const result = await migrateIndexedDbLists()
    expect(result.skipped).toBe(true)
    expect(result.migrated).toBe(0)
  })

  it('returns migrated=0 when there are no local lists', async () => {
    const result = await migrateIndexedDbLists()
    expect(result.skipped).toBe(false)
    expect(result.migrated).toBe(0)
    expect(result.failed).toBe(0)
  })

  it('marks migration done after running', async () => {
    await migrateIndexedDbLists()
    expect(isMigrationDone()).toBe(true)
  })

  it('migrates a list with units', async () => {
    const { getLists, getList, getListUnits } = await import('@tabletop-tools/game-data-store')
    const { createListV2Imperative, addUnitV2Imperative } = await import('./useListsV2')

    vi.mocked(getLists).mockResolvedValueOnce([
      {
        id: 'local-1',
        name: 'My List',
        faction: 'Space Marines',
        detachment: 'det-1',
        battleSize: 2000,
        totalPts: 180,
        createdAt: 0,
        updatedAt: 0,
      },
    ])
    vi.mocked(getList).mockResolvedValueOnce({
      id: 'local-1',
      name: 'My List',
      faction: 'Space Marines',
      detachment: 'det-1',
      battleSize: 2000,
      totalPts: 180,
      createdAt: 0,
      updatedAt: 0,
    })
    vi.mocked(getListUnits).mockResolvedValueOnce([
      {
        id: 'lu-1',
        listId: 'local-1',
        unitContentId: 'u1',
        unitName: 'Intercessors',
        unitPoints: 90,
        count: 1,
        isWarlord: false,
        modelCount: undefined,
        enhancementId: undefined,
        enhancementName: undefined,
        enhancementCost: undefined,
      },
      {
        id: 'lu-2',
        listId: 'local-1',
        unitContentId: 'u2',
        unitName: 'Captain',
        unitPoints: 90,
        count: 1,
        isWarlord: true,
        modelCount: undefined,
        enhancementId: undefined,
        enhancementName: undefined,
        enhancementCost: undefined,
      },
    ])

    const result = await migrateIndexedDbLists()

    expect(result.migrated).toBe(1)
    expect(result.failed).toBe(0)
    expect(createListV2Imperative).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'My List',
        battleSize: 'Strike Force',
        factionId: 'Space Marines',
        detachmentId: 'det-1',
      }),
    )
    expect(addUnitV2Imperative).toHaveBeenCalledTimes(2)
  })
})

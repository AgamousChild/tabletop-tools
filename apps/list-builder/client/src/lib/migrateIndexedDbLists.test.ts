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

const makeLocalList = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'local-1',
  name: 'My List',
  faction: 'Space Marines',
  detachment: 'det-1',
  battleSize: 2000,
  totalPts: 180,
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
})

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
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

  it('marks migration done after a fully successful run', async () => {
    await migrateIndexedDbLists()
    expect(isMigrationDone()).toBe(true)
  })

  it('migrates a list with units', async () => {
    const { getLists, getList, getListUnits } = await import('@tabletop-tools/game-data-store')
    const { createListV2Imperative, addUnitV2Imperative } = await import('./useListsV2')

    vi.mocked(getLists).mockResolvedValueOnce([makeLocalList()])
    vi.mocked(getList).mockResolvedValueOnce(makeLocalList())
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

  it('does NOT mark migration done when a list fails to migrate (partial failure)', async () => {
    const { getLists, getList } = await import('@tabletop-tools/game-data-store')

    vi.mocked(getLists).mockResolvedValueOnce([
      makeLocalList({ id: 'local-1', name: 'Good List' }),
      makeLocalList({ id: 'local-2', name: 'Bad List' }),
    ])
    vi.mocked(getList).mockImplementation(async (id: string) => {
      if (id === 'local-1') return makeLocalList({ id: 'local-1', name: 'Good List' })
      throw new Error('boom')
    })

    const result = await migrateIndexedDbLists()

    expect(result.migrated).toBe(1)
    expect(result.failed).toBe(1)
    expect(result.skipped).toBe(false)
    // Partial failure must NOT set the completion flag — otherwise the failed
    // list is silently lost forever (it will never be retried).
    expect(isMigrationDone()).toBe(false)
  })

  it('surfaces failed list names/ids so the caller can show the user what was lost', async () => {
    const { getLists, getList } = await import('@tabletop-tools/game-data-store')

    vi.mocked(getLists).mockResolvedValueOnce([makeLocalList({ id: 'local-2', name: 'Bad List' })])
    vi.mocked(getList).mockRejectedValueOnce(new Error('boom'))

    const result = await migrateIndexedDbLists()

    expect(result.failed).toBe(1)
    expect(result.failedLists).toEqual([{ id: 'local-2', name: 'Bad List' }])
  })

  it('re-run after partial failure retries only the failed lists (no duplicates)', async () => {
    const { getLists, getList, getListUnits } = await import('@tabletop-tools/game-data-store')
    const { createListV2Imperative } = await import('./useListsV2')

    // First run: local-1 succeeds, local-2 fails.
    vi.mocked(getLists).mockResolvedValueOnce([
      makeLocalList({ id: 'local-1', name: 'Good List' }),
      makeLocalList({ id: 'local-2', name: 'Bad List' }),
    ])
    vi.mocked(getList).mockImplementation(async (id: string) => {
      if (id === 'local-1') return makeLocalList({ id: 'local-1', name: 'Good List' })
      throw new Error('boom')
    })
    vi.mocked(getListUnits).mockResolvedValue([])

    const first = await migrateIndexedDbLists()
    expect(first.migrated).toBe(1)
    expect(first.failed).toBe(1)
    expect(isMigrationDone()).toBe(false)

    vi.mocked(createListV2Imperative).mockClear()

    // Second run: getLists again returns both local lists (nothing deleted from
    // IndexedDB), but local-2 now succeeds. local-1 must be SKIPPED, not
    // re-migrated (no duplicate list on the server).
    vi.mocked(getLists).mockResolvedValueOnce([
      makeLocalList({ id: 'local-1', name: 'Good List' }),
      makeLocalList({ id: 'local-2', name: 'Bad List' }),
    ])
    vi.mocked(getList).mockImplementation(async (id: string) => {
      if (id === 'local-1') return makeLocalList({ id: 'local-1', name: 'Good List' })
      if (id === 'local-2') return makeLocalList({ id: 'local-2', name: 'Bad List' })
      return undefined
    })

    const second = await migrateIndexedDbLists()

    expect(second.migrated).toBe(1) // only local-2 migrated this time
    expect(second.failed).toBe(0)
    expect(createListV2Imperative).toHaveBeenCalledTimes(1)
    expect(createListV2Imperative).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Bad List' }),
    )
    // Now that everything has succeeded, the flag should be set.
    expect(isMigrationDone()).toBe(true)
  })
})

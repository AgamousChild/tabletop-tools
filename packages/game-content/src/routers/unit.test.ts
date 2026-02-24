import { describe, it, expect, vi } from 'vitest'
import { initTRPC } from '@trpc/server'
import { createUnitRouter } from './unit'
import type { GameContentAdapter, UnitProfile } from '../types'

// Wrapping context — the unit router only needs user + gameContent,
// but apps typically have more fields. We test with a superset.
type TestContext = {
  user: { id: string; email: string; name: string } | null
  gameContent: GameContentAdapter
}

const t = initTRPC.context<TestContext>().create()
const createCallerFactory = t.createCallerFactory

const TEST_USER = { id: 'user-1', email: 'a@b.com', name: 'Alice' }

const MOCK_UNIT: UnitProfile = {
  id: 'unit-1',
  faction: 'Space Marines',
  name: 'Intercessors',
  move: 6,
  toughness: 4,
  save: 3,
  wounds: 2,
  leadership: 6,
  oc: 2,
  weapons: [],
  abilities: [],
  points: 80,
}

function createMockAdapter(overrides: Partial<GameContentAdapter> = {}): GameContentAdapter {
  return {
    load: vi.fn().mockResolvedValue(undefined),
    getUnit: vi.fn().mockResolvedValue(null),
    searchUnits: vi.fn().mockResolvedValue([]),
    listFactions: vi.fn().mockResolvedValue([]),
    ...overrides,
  }
}

function createCaller(adapter: GameContentAdapter, user: TestContext['user'] = TEST_USER) {
  const unitRouter = createUnitRouter()
  const appRouter = t.router({ unit: unitRouter })
  const caller = createCallerFactory(appRouter)
  return caller({
    user,
    gameContent: adapter,
  })
}

describe('createUnitRouter', () => {
  describe('listFactions', () => {
    it('returns factions from the adapter', async () => {
      const adapter = createMockAdapter({
        listFactions: vi.fn().mockResolvedValue(['Space Marines', 'Orks', 'Aeldari']),
      })
      const caller = createCaller(adapter)
      const result = await caller.unit.listFactions()
      expect(result).toEqual(['Space Marines', 'Orks', 'Aeldari'])
      expect(adapter.listFactions).toHaveBeenCalledOnce()
    })

    it('rejects unauthenticated requests', async () => {
      const adapter = createMockAdapter()
      const caller = createCaller(adapter, null)
      await expect(caller.unit.listFactions()).rejects.toThrow('UNAUTHORIZED')
    })
  })

  describe('search', () => {
    it('searches by faction', async () => {
      const adapter = createMockAdapter({
        searchUnits: vi.fn().mockResolvedValue([MOCK_UNIT]),
      })
      const caller = createCaller(adapter)
      const result = await caller.unit.search({ faction: 'Space Marines' })
      expect(result).toEqual([MOCK_UNIT])
      expect(adapter.searchUnits).toHaveBeenCalledWith({ faction: 'Space Marines', name: undefined })
    })

    it('searches by query string', async () => {
      const adapter = createMockAdapter({
        searchUnits: vi.fn().mockResolvedValue([MOCK_UNIT]),
      })
      const caller = createCaller(adapter)
      const result = await caller.unit.search({ query: 'Inter' })
      expect(result).toEqual([MOCK_UNIT])
      expect(adapter.searchUnits).toHaveBeenCalledWith({ faction: undefined, name: 'Inter' })
    })

    it('searches with both faction and query', async () => {
      const adapter = createMockAdapter({
        searchUnits: vi.fn().mockResolvedValue([MOCK_UNIT]),
      })
      const caller = createCaller(adapter)
      await caller.unit.search({ faction: 'Space Marines', query: 'Inter' })
      expect(adapter.searchUnits).toHaveBeenCalledWith({ faction: 'Space Marines', name: 'Inter' })
    })

    it('searches with no input', async () => {
      const adapter = createMockAdapter({
        searchUnits: vi.fn().mockResolvedValue([]),
      })
      const caller = createCaller(adapter)
      const result = await caller.unit.search({})
      expect(result).toEqual([])
    })

    it('rejects unauthenticated requests', async () => {
      const adapter = createMockAdapter()
      const caller = createCaller(adapter, null)
      await expect(caller.unit.search({})).rejects.toThrow('UNAUTHORIZED')
    })
  })

  describe('get', () => {
    it('returns a unit by ID', async () => {
      const adapter = createMockAdapter({
        getUnit: vi.fn().mockResolvedValue(MOCK_UNIT),
      })
      const caller = createCaller(adapter)
      const result = await caller.unit.get({ id: 'unit-1' })
      expect(result).toEqual(MOCK_UNIT)
      expect(adapter.getUnit).toHaveBeenCalledWith('unit-1')
    })

    it('throws NOT_FOUND when unit does not exist', async () => {
      const adapter = createMockAdapter({
        getUnit: vi.fn().mockResolvedValue(null),
      })
      const caller = createCaller(adapter)
      await expect(caller.unit.get({ id: 'nonexistent' })).rejects.toThrow('Unit not found')
    })

    it('rejects unauthenticated requests', async () => {
      const adapter = createMockAdapter()
      const caller = createCaller(adapter, null)
      await expect(caller.unit.get({ id: 'unit-1' })).rejects.toThrow('UNAUTHORIZED')
    })
  })
})

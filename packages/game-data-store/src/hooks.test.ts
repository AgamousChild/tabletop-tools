import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { UnitProfile } from '@tabletop-tools/game-content'
import { saveUnits, clearAll, setImportMeta } from './store'
import { useUnit, useUnitSearch, useFactions, useGameDataAvailable } from './hooks'

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

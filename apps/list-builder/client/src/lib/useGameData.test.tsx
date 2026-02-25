import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { useUnits, useGameFactions } from './useGameData'

// ---- Mocks ----

const mockUseUnitSearch = vi.fn(() => ({ data: [], error: null, isLoading: false }))
const mockUseFactions = vi.fn(() => ({ data: [], error: null, isLoading: false }))

vi.mock('@tabletop-tools/game-data-store', () => ({
  useUnitSearch: (...args: unknown[]) => mockUseUnitSearch(...args),
  useFactions: (...args: unknown[]) => mockUseFactions(...args),
}))

// ---- Tests ----

beforeEach(() => {
  vi.clearAllMocks()
})

const MOCK_UNITS = [
  { id: 'u1', name: 'Alpha Squad', faction: 'Faction A', points: 100 },
]

describe('useUnits', () => {
  it('returns units from IndexedDB when enabled', () => {
    mockUseUnitSearch.mockReturnValue({ data: MOCK_UNITS, error: null, isLoading: false })

    const { result } = renderHook(() => useUnits({ faction: 'Faction A' }, true))

    expect(result.current.data).toEqual(MOCK_UNITS)
    expect(result.current.isLoading).toBe(false)
  })

  it('returns empty when disabled', () => {
    mockUseUnitSearch.mockReturnValue({ data: MOCK_UNITS, error: null, isLoading: false })

    const { result } = renderHook(() => useUnits({ faction: 'Faction A' }, false))

    expect(result.current.data).toEqual([])
    expect(result.current.isLoading).toBe(false)
  })
})

describe('useGameFactions', () => {
  it('returns factions from IndexedDB', () => {
    mockUseFactions.mockReturnValue({ data: ['Faction A', 'Faction B'], error: null, isLoading: false })

    const { result } = renderHook(() => useGameFactions())

    expect(result.current.data).toEqual(['Faction A', 'Faction B'])
  })
})

import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { useUnits, useGameFactions } from './useGameData'

// ---- Mocks ----

const mockUsePrimaryUnitSearch = vi.fn(() => ({ data: [], isLoading: false }))
const mockUsePrimaryFactions = vi.fn(() => ({ data: [], isLoading: false }))

vi.mock('@tabletop-tools/game-data-store', () => ({
  usePrimaryUnitSearch: (...args: unknown[]) => mockUsePrimaryUnitSearch(...args),
  usePrimaryFactions: (...args: unknown[]) => mockUsePrimaryFactions(...args),
  useDetachments: () => ({ data: [], error: null, isLoading: false }),
  useDetachment: () => ({ data: null, error: null, isLoading: false }),
  useDetachmentAbilities: () => ({ data: [], error: null, isLoading: false }),
  useEnhancements: () => ({ data: [], error: null, isLoading: false }),
  useUnitKeywords: () => ({ data: [], error: null, isLoading: false }),
  useAllUnitKeywords: () => ({ data: [], error: null, isLoading: false }),
  useUnitCompositions: () => ({ data: [], error: null, isLoading: false }),
  useUnitCosts: () => ({ data: [], error: null, isLoading: false }),
  useAllDatasheets: () => ({ data: [], error: null, isLoading: false }),
}))

// ---- Tests ----

beforeEach(() => {
  vi.clearAllMocks()
})

const MOCK_UNITS = [
  { id: 'u1', name: 'Alpha Squad', faction: 'Faction A', points: 100 },
]

describe('useUnits', () => {
  it('returns units from primary source when enabled', () => {
    mockUsePrimaryUnitSearch.mockReturnValue({ data: MOCK_UNITS, isLoading: false })

    const { result } = renderHook(() => useUnits({ faction: 'Faction A' }, true))

    expect(result.current.data).toEqual(MOCK_UNITS)
    expect(result.current.isLoading).toBe(false)
  })

  it('returns empty when disabled', () => {
    mockUsePrimaryUnitSearch.mockReturnValue({ data: MOCK_UNITS, isLoading: false })

    const { result } = renderHook(() => useUnits({ faction: 'Faction A' }, false))

    expect(result.current.data).toEqual([])
    expect(result.current.isLoading).toBe(false)
  })
})

describe('useGameFactions', () => {
  it('returns factions from primary source', () => {
    mockUsePrimaryFactions.mockReturnValue({ data: ['Faction A', 'Faction B'], isLoading: false })

    const { result } = renderHook(() => useGameFactions())

    expect(result.current.data).toEqual(['Faction A', 'Faction B'])
  })
})

import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { useUnits, useGameFactions, useGameUnit } from './useGameData'

// ---- Mocks ----

const mockUseUnitSearch = vi.fn(() => ({ data: [], error: null, isLoading: false }))
const mockUseFactions = vi.fn(() => ({ data: [], error: null, isLoading: false }))
const mockUseUnit = vi.fn(() => ({ data: null, error: null, isLoading: false }))

vi.mock('@tabletop-tools/game-data-store', () => ({
  useUnitSearch: (...args: unknown[]) => mockUseUnitSearch(...args),
  useFactions: (...args: unknown[]) => mockUseFactions(...args),
  useUnit: (...args: unknown[]) => mockUseUnit(...args),
}))

// ---- Tests ----

beforeEach(() => {
  vi.clearAllMocks()
})

const MOCK_UNITS = [
  { id: 'u1', name: 'Alpha Squad', faction: 'Faction A', points: 100 },
  { id: 'u2', name: 'Beta Squad', faction: 'Faction A', points: 150 },
]

describe('useUnits', () => {
  it('returns units from IndexedDB', () => {
    mockUseUnitSearch.mockReturnValue({ data: MOCK_UNITS, error: null, isLoading: false })

    const { result } = renderHook(() => useUnits({ faction: 'Faction A' }))

    expect(result.current.data).toEqual(MOCK_UNITS)
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

describe('useGameUnit', () => {
  it('returns unit by ID from IndexedDB', () => {
    const mockUnit = { id: 'u1', name: 'Alpha Squad', faction: 'Faction A', points: 100 }
    mockUseUnit.mockReturnValue({ data: mockUnit, error: null, isLoading: false })

    const { result } = renderHook(() => useGameUnit('u1'))

    expect(result.current.data).toEqual(mockUnit)
    expect(result.current.isLoading).toBe(false)
  })

  it('returns null when id is null', () => {
    const { result } = renderHook(() => useGameUnit(null))

    expect(result.current.data).toBeNull()
    expect(result.current.isLoading).toBe(false)
  })
})

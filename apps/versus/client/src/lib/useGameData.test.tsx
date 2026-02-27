import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { useUnits, useGameFactions, useGameUnit } from './useGameData'

// ---- Mocks ----

const mockUsePrimaryUnitSearch = vi.fn(() => ({ data: [], isLoading: false }))
const mockUsePrimaryFactions = vi.fn(() => ({ data: [], isLoading: false }))
const mockUsePrimaryUnit = vi.fn(() => ({ data: null, isLoading: false }))

vi.mock('@tabletop-tools/game-data-store', () => ({
  usePrimaryUnitSearch: (...args: unknown[]) => mockUsePrimaryUnitSearch(...args),
  usePrimaryFactions: (...args: unknown[]) => mockUsePrimaryFactions(...args),
  usePrimaryUnit: (...args: unknown[]) => mockUsePrimaryUnit(...args),
  useLeaderAttachments: () => ({ data: [], error: null, isLoading: false }),
  useLeadersForUnit: () => ({ data: [], error: null, isLoading: false }),
  useUnitAbilities: () => ({ data: [], error: null, isLoading: false }),
  useUnitCompositions: () => ({ data: [], error: null, isLoading: false }),
  useUnitKeywords: () => ({ data: [], error: null, isLoading: false }),
  useWargearOptions: () => ({ data: [], error: null, isLoading: false }),
  useDatasheetModels: () => ({ data: [], error: null, isLoading: false }),
  useDetachments: () => ({ data: [], error: null, isLoading: false }),
  useDetachmentAbilities: () => ({ data: [], error: null, isLoading: false }),
  useEnhancements: () => ({ data: [], error: null, isLoading: false }),
  useStratagems: () => ({ data: [], error: null, isLoading: false }),
  useWargearAsWeapons: () => ({ data: [], isLoading: false }),
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
  it('returns units from primary source', () => {
    mockUsePrimaryUnitSearch.mockReturnValue({ data: MOCK_UNITS, isLoading: false })

    const { result } = renderHook(() => useUnits({ faction: 'Faction A' }))

    expect(result.current.data).toEqual(MOCK_UNITS)
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

describe('useGameUnit', () => {
  it('returns unit by ID from primary source', () => {
    const mockUnit = { id: 'u1', name: 'Alpha Squad', faction: 'Faction A', points: 100 }
    mockUsePrimaryUnit.mockReturnValue({ data: mockUnit, isLoading: false })

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

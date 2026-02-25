import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { useUnits, useGameFactions, useGameUnit } from './useGameData'

// ---- Mocks ----

const mockUseGameDataAvailable = vi.fn(() => false)
const mockUseUnitSearch = vi.fn(() => ({ data: [], error: null, isLoading: false }))
const mockUseFactions = vi.fn(() => ({ data: [], error: null, isLoading: false }))
const mockUseUnit = vi.fn(() => ({ data: null, error: null, isLoading: false }))

vi.mock('@tabletop-tools/game-data-store', () => ({
  useGameDataAvailable: (...args: unknown[]) => mockUseGameDataAvailable(...args),
  useUnitSearch: (...args: unknown[]) => mockUseUnitSearch(...args),
  useFactions: (...args: unknown[]) => mockUseFactions(...args),
  useUnit: (...args: unknown[]) => mockUseUnit(...args),
}))

const mockSearchUseQuery = vi.fn(() => ({ data: [], isLoading: false }))
const mockListFactionsUseQuery = vi.fn(() => ({ data: [], isLoading: false }))
const mockGetUseQuery = vi.fn(() => ({ data: null, isLoading: false }))

vi.mock('./trpc', () => ({
  trpc: {
    unit: {
      search: { useQuery: (...args: unknown[]) => mockSearchUseQuery(...args) },
      listFactions: { useQuery: (...args: unknown[]) => mockListFactionsUseQuery(...args) },
      get: { useQuery: (...args: unknown[]) => mockGetUseQuery(...args) },
    },
  },
}))

// ---- Tests ----

beforeEach(() => {
  vi.clearAllMocks()
  mockUseGameDataAvailable.mockReturnValue(false)
})

const MOCK_UNITS = [
  { id: 'u1', name: 'Alpha Squad', faction: 'Faction A', points: 100 },
  { id: 'u2', name: 'Beta Squad', faction: 'Faction A', points: 150 },
]

describe('useUnits', () => {
  it('returns units from tRPC when no local data', () => {
    mockSearchUseQuery.mockReturnValue({ data: MOCK_UNITS, isLoading: false })

    const { result } = renderHook(() => useUnits({ faction: 'Faction A' }))

    expect(result.current.data).toEqual(MOCK_UNITS)
    expect(result.current.isLoading).toBe(false)
  })

  it('returns units from local IndexedDB when available', () => {
    mockUseGameDataAvailable.mockReturnValue(true)
    mockUseUnitSearch.mockReturnValue({ data: MOCK_UNITS, error: null, isLoading: false })

    const { result } = renderHook(() => useUnits({ faction: 'Faction A' }))

    expect(result.current.data).toEqual(MOCK_UNITS)
    // tRPC should be disabled (enabled: false)
    expect(mockSearchUseQuery).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ enabled: false }),
    )
  })
})

describe('useGameFactions', () => {
  it('returns factions from tRPC when no local data', () => {
    mockListFactionsUseQuery.mockReturnValue({ data: ['Faction A', 'Faction B'], isLoading: false })

    const { result } = renderHook(() => useGameFactions())

    expect(result.current.data).toEqual(['Faction A', 'Faction B'])
  })

  it('returns factions from local data when available', () => {
    mockUseGameDataAvailable.mockReturnValue(true)
    mockUseFactions.mockReturnValue({ data: ['Local Faction'], error: null, isLoading: false })

    const { result } = renderHook(() => useGameFactions())

    expect(result.current.data).toEqual(['Local Faction'])
  })
})

describe('useGameUnit', () => {
  it('returns unit by ID from tRPC when no local data', () => {
    const mockUnit = { id: 'u1', name: 'Alpha Squad', faction: 'Faction A', points: 100 }
    mockGetUseQuery.mockReturnValue({ data: mockUnit, isLoading: false })

    const { result } = renderHook(() => useGameUnit('u1'))

    expect(result.current.data).toEqual(mockUnit)
    expect(result.current.isLoading).toBe(false)
  })
})

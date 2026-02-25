import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { useUnits, useGameFactions } from './useGameData'

// ---- Mocks ----

const mockUseGameDataAvailable = vi.fn(() => false)
const mockUseUnitSearch = vi.fn(() => ({ data: [], error: null, isLoading: false }))
const mockUseFactions = vi.fn(() => ({ data: [], error: null, isLoading: false }))

vi.mock('@tabletop-tools/game-data-store', () => ({
  useGameDataAvailable: (...args: unknown[]) => mockUseGameDataAvailable(...args),
  useUnitSearch: (...args: unknown[]) => mockUseUnitSearch(...args),
  useFactions: (...args: unknown[]) => mockUseFactions(...args),
}))

const mockSearchUseQuery = vi.fn(() => ({ data: [], isLoading: false }))
const mockListFactionsUseQuery = vi.fn(() => ({ data: [], isLoading: false }))

vi.mock('./trpc', () => ({
  trpc: {
    unit: {
      search: { useQuery: (...args: unknown[]) => mockSearchUseQuery(...args) },
      listFactions: { useQuery: (...args: unknown[]) => mockListFactionsUseQuery(...args) },
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
]

describe('useUnits', () => {
  it('returns units from tRPC when enabled and no local data', () => {
    mockSearchUseQuery.mockReturnValue({ data: MOCK_UNITS, isLoading: false })

    const { result } = renderHook(() => useUnits({ faction: 'Faction A' }, true))

    expect(result.current.data).toEqual(MOCK_UNITS)
    expect(result.current.isLoading).toBe(false)
  })

  it('returns units from local data when available', () => {
    mockUseGameDataAvailable.mockReturnValue(true)
    mockUseUnitSearch.mockReturnValue({ data: MOCK_UNITS, error: null, isLoading: false })

    const { result } = renderHook(() => useUnits({ faction: 'Faction A' }, true))

    expect(result.current.data).toEqual(MOCK_UNITS)
    // tRPC should be disabled when local data is available
    expect(mockSearchUseQuery).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ enabled: false }),
    )
  })

  it('returns empty when disabled and no local data', () => {
    mockSearchUseQuery.mockReturnValue({ data: [], isLoading: false })

    const { result } = renderHook(() => useUnits({ faction: 'Faction A' }, false))

    // tRPC disabled: enabled = !hasLocalData && enabled = !false && false = false
    expect(mockSearchUseQuery).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ enabled: false }),
    )
    expect(result.current.data).toEqual([])
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

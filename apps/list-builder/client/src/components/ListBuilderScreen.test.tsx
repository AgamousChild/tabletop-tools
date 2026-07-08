import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ListBuilderScreen } from './ListBuilderScreen'

vi.mock('../lib/auth', () => ({
  authClient: {
    useSession: () => ({
      data: { user: { id: 'u1', name: 'Alice' } },
      isPending: false,
    }),
    signOut: vi.fn().mockResolvedValue({}),
  },
}))

vi.mock('../lib/trpc', () => ({
  trpc: {
    rating: {
      get: { useQuery: () => ({ data: null, refetch: vi.fn() }) },
      alternatives: { useQuery: () => ({ data: [], refetch: vi.fn() }) },
    },
    listV2: {
      get: { useQuery: () => ({ data: null }) },
      getAll: { useQuery: () => ({ data: [] }) },
    },
  },
  trpcClient: {
    rating: {
      get: { query: vi.fn().mockResolvedValue(null) },
      alternatives: { query: vi.fn().mockResolvedValue([]) },
    },
    listV2: {
      create: { mutate: vi.fn().mockResolvedValue({ id: 'new-list-id' }) },
      computePoints: { mutate: vi.fn().mockResolvedValue({ totalPoints: 0 }) },
    },
  },
}))

vi.mock('../lib/migrateIndexedDbLists', () => ({
  migrateIndexedDbLists: vi.fn().mockResolvedValue({ migrated: 0, failed: 0, skipped: true }),
}))

const mockListsV2Summary = [
  {
    id: 'list-1',
    userId: 'u1',
    name: 'My Crusade',
    edition: '11th' as const,
    battleSize: 'Strike Force',
    totalPoints: 90,
    source: 'list-builder',
    author: null,
    factionId: 'Space Marines',
    subfactionId: null,
    detachmentId: null,
    dataslateId: null,
    createdAt: 0,
    updatedAt: 0,
  },
]

const mockListV2Full = {
  ...mockListsV2Summary[0],
  units: [
    {
      id: 'lu1',
      listId: 'list-1',
      datasheetId: 'u1',
      enhancementId: null,
      isWarlord: false,
      points: 90,
      attachedToUnitId: null,
      attachRole: null,
      loadouts: [],
    },
  ],
}

const mockUseListsV2 = vi.fn(() => ({ data: mockListsV2Summary, refetch: vi.fn() }))
const mockUseListV2 = vi.fn((id: string | null) => ({
  data: id === 'list-1' ? mockListV2Full : null,
}))
const mockInvalidate = vi.fn()

vi.mock('../lib/useListsV2', () => ({
  useListsV2: (...args: unknown[]) => mockUseListsV2(...args),
  useListV2: (...args: unknown[]) => mockUseListV2(...(args as [string | null])),
  useInvalidateListsV2: () => mockInvalidate,
  createListV2Imperative: vi.fn().mockResolvedValue('new-list-id'),
  deleteListV2Imperative: vi.fn().mockResolvedValue({ success: true }),
  addUnitV2Imperative: vi.fn().mockResolvedValue('unit-id'),
  removeUnitV2Imperative: vi.fn().mockResolvedValue({ success: true }),
  updateUnitV2Imperative: vi.fn().mockResolvedValue({ success: true }),
  updateListV2Imperative: vi.fn().mockResolvedValue({ success: true }),
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

vi.mock('@tabletop-tools/game-data-store', () => ({
  useUnit: () => ({
    data: {
      id: 'u1',
      name: 'Intercessors',
      faction: 'Space Marines',
      points: 90,
      move: 6,
      toughness: 4,
      save: 3,
      wounds: 2,
      leadership: 6,
      oc: 2,
      weapons: [],
      abilities: [],
    },
    error: null,
    isLoading: false,
  }),
  useDetachmentAbilities: () => ({ data: [], error: null, isLoading: false }),
  useDetachment: () => ({ data: null, error: null, isLoading: false }),
  useDetachments: () => ({ data: [], error: null, isLoading: false }),
  usePrimaryFactions: () => ({ data: ['Space Marines', 'Orks'], isLoading: false }),
  usePrimaryUnitSearch: () => ({
    data: [{ id: 'u1', name: 'Intercessors', faction: 'Space Marines', points: 90 }],
    isLoading: false,
  }),
  useEnhancements: () => ({ data: [], error: null, isLoading: false }),
  useUnitKeywords: () => ({ data: [], error: null, isLoading: false }),
  useAllUnitKeywords: () => ({ data: [], error: null, isLoading: false }),
  useUnitCompositions: () => ({ data: [], error: null, isLoading: false }),
  useUnitCosts: () => ({ data: [], error: null, isLoading: false }),
  useAllDatasheets: () => ({ data: [], error: null, isLoading: false }),
  useLegendsUnitIds: () => new Set<string>(),
  useGameDataAvailable: () => true,
}))

beforeEach(() => {
  mockUseListsV2.mockReturnValue({ data: mockListsV2Summary, refetch: vi.fn() })
  mockUseListV2.mockImplementation((id: string | null) => ({
    data: id === 'list-1' ? mockListV2Full : null,
  }))
  mockInvalidate.mockReset()
})

describe('ListBuilderScreen', () => {
  it('renders the app title', () => {
    render(<ListBuilderScreen onSignOut={vi.fn()} />)
    expect(screen.getByText('List Builder')).toBeInTheDocument()
  })

  it('shows sign out button', () => {
    render(<ListBuilderScreen onSignOut={vi.fn()} />)
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })

  it('calls onSignOut when sign out is clicked', async () => {
    const onSignOut = vi.fn()
    render(<ListBuilderScreen onSignOut={onSignOut} />)
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }))
    await waitFor(() => expect(onSignOut).toHaveBeenCalled())
  })

  it('shows My Army Lists screen initially', () => {
    render(<ListBuilderScreen onSignOut={vi.fn()} />)
    expect(screen.getByText('My Army Lists')).toBeInTheDocument()
  })

  it('shows existing lists', () => {
    render(<ListBuilderScreen onSignOut={vi.fn()} />)
    expect(screen.getByText('My Crusade')).toBeInTheDocument()
    expect(screen.getByText('Space Marines')).toBeInTheDocument()
  })

  it('shows + New List button', () => {
    render(<ListBuilderScreen onSignOut={vi.fn()} />)
    expect(screen.getByRole('button', { name: /new list/i })).toBeInTheDocument()
  })

  it('navigates to battle size screen when + New List is clicked', () => {
    render(<ListBuilderScreen onSignOut={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /new list/i }))
    expect(screen.getByText('Select Battle Size')).toBeInTheDocument()
  })

  it('shows battle size options', () => {
    render(<ListBuilderScreen onSignOut={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /new list/i }))
    expect(screen.getByText('500pts')).toBeInTheDocument()
    expect(screen.getByText('2000pts')).toBeInTheDocument()
    expect(screen.getByText('3000pts')).toBeInTheDocument()
  })

  it('navigates to faction screen after selecting battle size', () => {
    render(<ListBuilderScreen onSignOut={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /new list/i }))
    fireEvent.click(screen.getByText('2000pts'))
    expect(screen.getByText('2000pts Strike Force')).toBeInTheDocument()
    expect(screen.getByLabelText('Select faction')).toBeInTheDocument()
  })

  it('opens existing list in unit selection screen', () => {
    render(<ListBuilderScreen onSignOut={vi.fn()} />)
    fireEvent.click(screen.getByText('My Crusade'))
    // Should show Done button (unit selection screen)
    expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument()
  })

  it('back button returns to previous screen', () => {
    render(<ListBuilderScreen onSignOut={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /new list/i }))
    expect(screen.getByText('Select Battle Size')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Back'))
    expect(screen.getByText('My Army Lists')).toBeInTheDocument()
  })

  it('shows unit stat line when list is open', () => {
    render(<ListBuilderScreen onSignOut={vi.fn()} />)
    fireEvent.click(screen.getByText('My Crusade'))
    const statLines = screen.getAllByTestId('unit-stat-line')
    expect(statLines.length).toBeGreaterThanOrEqual(1)
    expect(statLines[0]?.textContent).toContain('M6')
    expect(statLines[0]?.textContent).toContain('T4')
  })

  it('does not show a migration warning when migration is skipped or fully successful', async () => {
    render(<ListBuilderScreen onSignOut={vi.fn()} />)
    await waitFor(() => {
      expect(screen.queryByTestId('migration-warning')).not.toBeInTheDocument()
    })
  })

  it('shows a non-blocking warning when some lists fail to migrate', async () => {
    const { migrateIndexedDbLists } = await import('../lib/migrateIndexedDbLists')
    vi.mocked(migrateIndexedDbLists).mockResolvedValueOnce({
      migrated: 1,
      failed: 2,
      skipped: false,
      failedLists: [
        { id: 'local-1', name: 'Old Orks List' },
        { id: 'local-2', name: 'Old Marines List' },
      ],
    })

    render(<ListBuilderScreen onSignOut={vi.fn()} />)

    const warning = await screen.findByTestId('migration-warning')
    expect(warning.textContent).toContain('2')
    expect(warning.textContent).toContain('Old Orks List')
    expect(warning.textContent).toContain('Old Marines List')

    // Non-blocking: the rest of the screen still renders and is usable.
    expect(screen.getByText('My Army Lists')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /new list/i })).toBeInTheDocument()
  })
})

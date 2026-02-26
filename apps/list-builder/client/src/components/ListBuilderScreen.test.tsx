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
  },
  trpcClient: {
    rating: {
      get: { query: vi.fn().mockResolvedValue(null) },
      alternatives: { query: vi.fn().mockResolvedValue([]) },
    },
  },
}))

vi.mock('../lib/sync', () => ({
  syncListToServer: vi.fn(),
  syncAllToServer: vi.fn(),
  deleteListFromServer: vi.fn(),
  restoreFromServer: vi.fn().mockResolvedValue(0),
}))

const mockUseLists = vi.fn(() => ({
  data: [{ id: 'list-1', faction: 'Space Marines', name: 'My Crusade', totalPts: 90, createdAt: 0, updatedAt: 0 }],
  refetch: vi.fn(),
}))
const mockUseList = vi.fn((_id: string | null) => ({
  data: _id === 'list-1'
    ? {
        id: 'list-1',
        faction: 'Space Marines',
        name: 'My Crusade',
        totalPts: 90,
        createdAt: 0,
        updatedAt: 0,
        units: [
          {
            id: 'lu1',
            listId: 'list-1',
            unitContentId: 'u1',
            unitName: 'Intercessors',
            unitPoints: 90,
            count: 1,
          },
        ],
      }
    : null,
  refetch: vi.fn(),
}))
const mockCreateList = vi.fn()
const mockAddListUnit = vi.fn()
const mockRemoveListUnit = vi.fn()
const mockDeleteList = vi.fn()
const mockUpdateList = vi.fn()

vi.mock('@tabletop-tools/game-data-store', () => ({
  useUnitSearch: () => ({
    data: [
      { id: 'u1', name: 'Intercessors', faction: 'Space Marines', points: 90, weapons: [], abilities: [] },
    ],
    error: null,
    isLoading: false,
  }),
  useFactions: () => ({
    data: ['Space Marines', 'Orks'],
    error: null,
    isLoading: false,
  }),
  useDetachments: () => ({
    data: [],
    error: null,
    isLoading: false,
  }),
  useEnhancements: () => ({
    data: [],
    error: null,
    isLoading: false,
  }),
  useUnitKeywords: () => ({
    data: [],
    error: null,
    isLoading: false,
  }),
  useUnitCompositions: () => ({
    data: [],
    error: null,
    isLoading: false,
  }),
  useUnitCosts: () => ({
    data: [],
    error: null,
    isLoading: false,
  }),
  useGameDataAvailable: () => true,
  useLists: (...args: unknown[]) => mockUseLists(...args),
  useList: (...args: unknown[]) => mockUseList(...(args as [string | null])),
  createList: (...args: unknown[]) => { mockCreateList(...args); return Promise.resolve() },
  addListUnit: (...args: unknown[]) => { mockAddListUnit(...args); return Promise.resolve() },
  removeListUnit: (...args: unknown[]) => { mockRemoveListUnit(...args); return Promise.resolve() },
  updateList: (...args: unknown[]) => { mockUpdateList(...args); return Promise.resolve() },
  deleteList: (...args: unknown[]) => { mockDeleteList(...args); return Promise.resolve() },
}))

beforeEach(() => {
  mockCreateList.mockReset()
  mockAddListUnit.mockReset()
  mockRemoveListUnit.mockReset()
  mockDeleteList.mockReset()
  mockUpdateList.mockReset()
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
    // Click the 2000pts option
    fireEvent.click(screen.getByText('2000pts'))
    expect(screen.getByText('2000pts Strike Force')).toBeInTheDocument()
    expect(screen.getByLabelText('Select faction')).toBeInTheDocument()
  })

  it('opens existing list in unit selection screen', () => {
    render(<ListBuilderScreen onSignOut={vi.fn()} />)
    fireEvent.click(screen.getByText('My Crusade'))
    // Should show unit selection with the list loaded (appears in both browser and list panels)
    expect(screen.getAllByText('Intercessors').length).toBeGreaterThanOrEqual(1)
    // Should show Done button (unit selection screen has it)
    expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument()
  })

  it('back button returns to previous screen', () => {
    render(<ListBuilderScreen onSignOut={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /new list/i }))
    expect(screen.getByText('Select Battle Size')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Back'))
    expect(screen.getByText('My Army Lists')).toBeInTheDocument()
  })
})

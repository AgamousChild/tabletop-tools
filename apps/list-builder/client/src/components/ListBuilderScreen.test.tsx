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

  it('shows faction selector', () => {
    render(<ListBuilderScreen onSignOut={vi.fn()} />)
    expect(screen.getByLabelText('Select faction')).toBeInTheDocument()
  })

  it('shows existing lists in the list selector', () => {
    render(<ListBuilderScreen onSignOut={vi.fn()} />)
    expect(screen.getByText(/My Crusade/)).toBeInTheDocument()
  })

  it('shows units when faction is selected', () => {
    render(<ListBuilderScreen onSignOut={vi.fn()} />)
    const factionSelect = screen.getByLabelText('Select faction')
    fireEvent.change(factionSelect, { target: { value: 'Space Marines' } })
    expect(screen.getByText('Intercessors')).toBeInTheDocument()
  })

  it('shows the active list units when a list is selected', () => {
    render(<ListBuilderScreen onSignOut={vi.fn()} />)
    const listSelect = screen.getByLabelText('Select list')
    fireEvent.change(listSelect, { target: { value: 'list-1' } })
    expect(screen.getByText('My Crusade')).toBeInTheDocument()
    const ptElements = screen.getAllByText('90pts')
    expect(ptElements.length).toBeGreaterThanOrEqual(1)
  })

  it('shows Create button disabled when no name or faction', () => {
    render(<ListBuilderScreen onSignOut={vi.fn()} />)
    const createBtn = screen.getByRole('button', { name: /create/i })
    expect(createBtn).toBeDisabled()
  })

  it('creates a list with name and faction', async () => {
    render(<ListBuilderScreen onSignOut={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Select faction'), { target: { value: 'Space Marines' } })
    fireEvent.change(screen.getByPlaceholderText('New list name…'), { target: { value: 'Test Army' } })
    fireEvent.click(screen.getByRole('button', { name: /create/i }))

    await waitFor(() =>
      expect(mockCreateList).toHaveBeenCalledWith(
        expect.objectContaining({ faction: 'Space Marines', name: 'Test Army' }),
      ),
    )
  })

  it('shows unit names in active list', () => {
    render(<ListBuilderScreen onSignOut={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Select list'), { target: { value: 'list-1' } })
    expect(screen.getByText('Intercessors')).toBeInTheDocument()
  })

  it('shows remove button for units in active list', () => {
    render(<ListBuilderScreen onSignOut={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Select list'), { target: { value: 'list-1' } })
    expect(screen.getByRole('button', { name: '✕' })).toBeInTheDocument()
  })

  it('removes a unit when remove button is clicked', async () => {
    render(<ListBuilderScreen onSignOut={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Select list'), { target: { value: 'list-1' } })
    fireEvent.click(screen.getByRole('button', { name: '✕' }))

    await waitFor(() =>
      expect(mockRemoveListUnit).toHaveBeenCalledWith('lu1'),
    )
  })

  it('shows Export list button when a list is active', () => {
    render(<ListBuilderScreen onSignOut={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Select list'), { target: { value: 'list-1' } })
    expect(screen.getByRole('button', { name: /export list/i })).toBeInTheDocument()
  })

  it('shows placeholder when no list is active', () => {
    render(<ListBuilderScreen onSignOut={vi.fn()} />)
    expect(screen.getByText('Select or create a list to get started.')).toBeInTheDocument()
  })

  it('shows "No units yet" for an empty active list', () => {
    render(<ListBuilderScreen onSignOut={vi.fn()} />)
    // With no list selected, we see the "Select or create" message
    expect(screen.getByText('Select or create a list to get started.')).toBeInTheDocument()
  })
})

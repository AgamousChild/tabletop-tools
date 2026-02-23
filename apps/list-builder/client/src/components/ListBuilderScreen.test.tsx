import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ListBuilderScreen } from './ListBuilderScreen'

const mockCreateList = vi.fn()
const mockAddUnit = vi.fn()
const mockRemoveUnit = vi.fn()
const mockDeleteList = vi.fn()

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
    unit: {
      listFactions: {
        useQuery: () => ({ data: ['Space Marines', 'Orks'], isLoading: false }),
      },
      search: {
        useQuery: (_input: unknown, opts: { enabled: boolean }) =>
          opts.enabled
            ? {
                data: [
                  { id: 'u1', name: 'Intercessors', faction: 'Space Marines', points: 90, weapons: [], abilities: [] },
                ],
                isLoading: false,
              }
            : { data: [], isLoading: false },
      },
    },
    list: {
      list: {
        useQuery: () => ({
          data: [{ id: 'list-1', faction: 'Space Marines', name: 'My Crusade', totalPts: 90 }],
          refetch: vi.fn(),
        }),
      },
      get: {
        useQuery: (_input: unknown, opts: { enabled: boolean }) =>
          opts.enabled
            ? {
                data: {
                  id: 'list-1',
                  faction: 'Space Marines',
                  name: 'My Crusade',
                  totalPts: 90,
                  units: [
                    {
                      id: 'lu1',
                      unitContentId: 'u1',
                      unitName: 'Intercessors',
                      unitPoints: 90,
                      count: 1,
                      rating: { rating: 'A', winContrib: 0.65 },
                    },
                  ],
                },
                refetch: vi.fn(),
              }
            : { data: null, refetch: vi.fn() },
      },
      create: {
        useMutation: (opts?: { onSuccess?: (r: unknown) => void }) => ({
          mutate: (args: unknown) => {
            mockCreateList(args)
            opts?.onSuccess?.({ id: 'new-list', faction: 'Space Marines', name: 'New', totalPts: 0 })
          },
          mutateAsync: vi.fn(),
        }),
      },
      addUnit: {
        useMutation: (opts?: { onSuccess?: () => void }) => ({
          mutate: (args: unknown) => {
            mockAddUnit(args)
            opts?.onSuccess?.()
          },
          mutateAsync: vi.fn().mockResolvedValue({}),
        }),
      },
      removeUnit: {
        useMutation: (opts?: { onSuccess?: () => void }) => ({
          mutate: (args: unknown) => {
            mockRemoveUnit(args)
            opts?.onSuccess?.()
          },
          mutateAsync: vi.fn(),
        }),
      },
      delete: {
        useMutation: (opts?: { onSuccess?: () => void }) => ({
          mutate: (args: unknown) => {
            mockDeleteList(args)
            opts?.onSuccess?.()
          },
          mutateAsync: vi.fn(),
        }),
      },
    },
    rating: {
      get: {
        useQuery: () => ({ data: null, refetch: vi.fn() }),
      },
      alternatives: {
        useQuery: () => ({ data: [], refetch: vi.fn() }),
      },
    },
  },
}))

beforeEach(() => {
  mockCreateList.mockReset()
  mockAddUnit.mockReset()
  mockRemoveUnit.mockReset()
  mockDeleteList.mockReset()
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
    // Select the list
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
})

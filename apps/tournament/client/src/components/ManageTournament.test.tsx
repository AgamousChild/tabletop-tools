import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ManageTournament } from './ManageTournament'

const mockIssueCard = vi.fn()
const mockCreateAward = vi.fn()
const mockAssignAward = vi.fn()
const mockRemovePlayer = vi.fn()
const mockReinstate = vi.fn()
const mockSeedPlayers = vi.fn()

vi.mock('../lib/trpc', () => ({
  trpc: {
    player: {
      list: {
        useQuery: () => ({
          data: [
            { id: 'p1', displayName: 'Alice', faction: 'Space Marines', dropped: 0 },
            { id: 'p2', displayName: 'Bob', faction: 'Orks', dropped: 1 },
          ],
          refetch: vi.fn(),
        }),
      },
      removePlayer: {
        useMutation: (opts?: { onSuccess?: () => void }) => ({
          mutate: (args: unknown) => {
            mockRemovePlayer(args)
            opts?.onSuccess?.()
          },
          isPending: false,
        }),
      },
      reinstate: {
        useMutation: (opts?: { onSuccess?: () => void }) => ({
          mutate: (args: unknown) => {
            mockReinstate(args)
            opts?.onSuccess?.()
          },
          isPending: false,
        }),
      },
      seedTestPlayers: {
        useMutation: (opts?: { onSuccess?: () => void }) => ({
          mutate: (args: unknown) => {
            mockSeedPlayers(args)
            opts?.onSuccess?.()
          },
          isPending: false,
        }),
      },
    },
    card: {
      listForTournament: {
        useQuery: () => ({
          data: [
            { id: 'c1', playerId: 'p1', cardType: 'YELLOW', reason: 'Slow play', issuedAt: 1000 },
          ],
          refetch: vi.fn(),
        }),
      },
      issue: {
        useMutation: (opts?: { onSuccess?: () => void }) => ({
          mutate: (args: unknown) => {
            mockIssueCard(args)
            opts?.onSuccess?.()
          },
          isPending: false,
        }),
      },
      playerHistory: {
        useQuery: (_id: unknown, _opts: unknown) => ({
          data: [
            { id: 'h1', tournamentId: 't-other', playerId: 'p-other', cardType: 'RED', reason: 'Cheating in past event', issuedAt: 500 },
          ],
        }),
      },
    },
    award: {
      list: {
        useQuery: () => ({
          data: [
            { id: 'a1', name: 'Best Painted', description: 'Top paint', recipientId: null },
          ],
          refetch: vi.fn(),
        }),
      },
      create: {
        useMutation: (opts?: { onSuccess?: () => void }) => ({
          mutate: (args: unknown) => {
            mockCreateAward(args)
            opts?.onSuccess?.()
          },
          isPending: false,
        }),
      },
      assign: {
        useMutation: (opts?: { onSuccess?: () => void }) => ({
          mutate: (args: unknown) => {
            mockAssignAward(args)
            opts?.onSuccess?.()
          },
          isPending: false,
        }),
      },
    },
  },
}))

beforeEach(() => {
  mockIssueCard.mockReset()
  mockCreateAward.mockReset()
  mockAssignAward.mockReset()
  mockRemovePlayer.mockReset()
  mockReinstate.mockReset()
  mockSeedPlayers.mockReset()
})

describe('ManageTournament', () => {
  it('shows title', () => {
    render(<ManageTournament tournamentId="t1" onBack={vi.fn()} />)
    expect(screen.getByText('Manage Tournament')).toBeInTheDocument()
  })

  it('shows tab buttons', () => {
    render(<ManageTournament tournamentId="t1" onBack={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'players' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'cards' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'awards' })).toBeInTheDocument()
  })

  it('shows active players on players tab', () => {
    render(<ManageTournament tournamentId="t1" onBack={vi.fn()} />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Space Marines')).toBeInTheDocument()
  })

  it('shows dropped players', () => {
    render(<ManageTournament tournamentId="t1" onBack={vi.fn()} />)
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByText(/dropped/i)).toBeInTheDocument()
  })

  it('shows card badges on players', () => {
    render(<ManageTournament tournamentId="t1" onBack={vi.fn()} />)
    expect(screen.getByText('YELLOW')).toBeInTheDocument()
  })

  it('shows reinstate button for dropped players', () => {
    render(<ManageTournament tournamentId="t1" onBack={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Reinstate' })).toBeInTheDocument()
  })

  it('clicking reinstate calls mutation', async () => {
    render(<ManageTournament tournamentId="t1" onBack={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reinstate' }))
    await waitFor(() =>
      expect(mockReinstate).toHaveBeenCalledWith({ playerId: 'p2' }),
    )
  })

  it('clicking Yellow opens card dialog', () => {
    render(<ManageTournament tournamentId="t1" onBack={vi.fn()} />)
    // Click Yellow card button for Alice
    const yellowButtons = screen.getAllByRole('button', { name: 'Yellow' })
    fireEvent.click(yellowButtons[0]!)
    expect(screen.getByText(/issue yellow card/i)).toBeInTheDocument()
  })

  it('switches to cards tab', () => {
    render(<ManageTournament tournamentId="t1" onBack={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'cards' }))
    expect(screen.getByText('Slow play')).toBeInTheDocument()
  })

  it('switches to awards tab and shows awards', () => {
    render(<ManageTournament tournamentId="t1" onBack={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'awards' }))
    expect(screen.getByText('Best Painted')).toBeInTheDocument()
    expect(screen.getByText('Top paint')).toBeInTheDocument()
  })

  it('shows Add Award form on awards tab', () => {
    render(<ManageTournament tournamentId="t1" onBack={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'awards' }))
    expect(screen.getByRole('heading', { name: 'Add Award' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/award name/i)).toBeInTheDocument()
  })

  it('shows History button for each active player', () => {
    render(<ManageTournament tournamentId="t1" onBack={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'History' })).toBeInTheDocument()
  })

  it('clicking History shows card history panel', () => {
    render(<ManageTournament tournamentId="t1" onBack={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'History' }))
    expect(screen.getByText('Card History (all tournaments)')).toBeInTheDocument()
    expect(screen.getByText('Cheating in past event')).toBeInTheDocument()
  })

  it('calls onBack when back is clicked', () => {
    const onBack = vi.fn()
    render(<ManageTournament tournamentId="t1" onBack={onBack} />)
    fireEvent.click(screen.getByText('Back to Tournament'))
    expect(onBack).toHaveBeenCalled()
  })
})

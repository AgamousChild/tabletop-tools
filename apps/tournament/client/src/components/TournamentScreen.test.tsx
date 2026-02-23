import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TournamentScreen } from './TournamentScreen'

const mockCreateTournament = vi.fn()
const mockAdvanceStatus = vi.fn()
const mockRegisterPlayer = vi.fn()
const mockCreateRound = vi.fn()
const mockGeneratePairings = vi.fn()

vi.mock('../lib/auth', () => ({
  authClient: {
    useSession: () => ({
      data: { user: { id: 'to-1', name: 'Alice' } },
      isPending: false,
    }),
    signOut: vi.fn().mockResolvedValue({}),
  },
}))

const mockTournaments = [
  {
    id: 't1',
    name: 'Test GT 2025',
    status: 'REGISTRATION',
    totalRounds: 5,
    toUserId: 'to-1',
    eventDate: 1700000000,
    format: '2000pts Matched Play',
    location: 'London',
    createdAt: 0,
    playerCount: 12,
  },
  {
    id: 't2',
    name: 'Local League',
    status: 'IN_PROGRESS',
    totalRounds: 3,
    toUserId: 'other-user',
    eventDate: 1700000000,
    format: '1000pts',
    location: null,
    createdAt: 0,
    playerCount: 6,
  },
]

vi.mock('../lib/trpc', () => ({
  trpc: {
    tournament: {
      listMine: {
        useQuery: () => ({ data: mockTournaments, refetch: vi.fn(), isPending: false }),
      },
      get: {
        useQuery: (_id: unknown, _opts: unknown) => ({
          data: mockTournaments[0],
          refetch: vi.fn(),
        }),
      },
      standings: {
        useQuery: (_id: unknown, _opts: unknown) => ({
          data: {
            round: 2,
            players: [
              { rank: 1, id: 'p1', displayName: 'Bob', faction: 'Orks', wins: 2, losses: 0, draws: 0, margin: 40, totalVP: 150, strengthOfSchedule: 0.5 },
              { rank: 2, id: 'p2', displayName: 'Carol', faction: 'Necrons', wins: 1, losses: 1, draws: 0, margin: 10, totalVP: 120, strengthOfSchedule: 0.4 },
            ],
          },
          refetch: vi.fn(),
        }),
      },
      create: {
        useMutation: (opts?: { onSuccess?: (t: unknown) => void }) => ({
          mutate: (args: unknown) => {
            mockCreateTournament(args)
            opts?.onSuccess?.({ id: 'new-t', name: 'New GT', status: 'DRAFT', toUserId: 'to-1' })
          },
          isPending: false,
        }),
      },
      advanceStatus: {
        useMutation: (opts?: { onSuccess?: () => void }) => ({
          mutate: (id: unknown) => {
            mockAdvanceStatus(id)
            opts?.onSuccess?.()
          },
          isPending: false,
        }),
      },
      delete: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
    player: {
      register: {
        useMutation: (opts?: { onSuccess?: () => void }) => ({
          mutate: (args: unknown) => {
            mockRegisterPlayer(args)
            opts?.onSuccess?.()
          },
          isPending: false,
        }),
      },
      checkIn: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      drop: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      list: {
        useQuery: () => ({ data: [], refetch: vi.fn() }),
      },
      lockLists: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
    round: {
      create: {
        useMutation: (opts?: { onSuccess?: (r: unknown) => void }) => ({
          mutate: (args: unknown) => {
            mockCreateRound(args)
            opts?.onSuccess?.({ id: 'round-1', roundNumber: 1, status: 'PENDING', tournamentId: 't1', createdAt: 0 })
          },
          isPending: false,
        }),
      },
      generatePairings: {
        useMutation: (opts?: { onSuccess?: () => void }) => ({
          mutate: (args: unknown) => {
            mockGeneratePairings(args)
            opts?.onSuccess?.()
          },
          isPending: false,
        }),
      },
      get: {
        useQuery: (_id: unknown, _opts: unknown) => ({
          data: { id: 'round-1', roundNumber: 1, status: 'ACTIVE', pairings: [] },
          refetch: vi.fn(),
        }),
      },
      close: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
    result: {
      report: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      confirm: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      dispute: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
    elo: {
      get: {
        useQuery: () => ({ data: { rating: 1200, gamesPlayed: 5 } }),
      },
    },
  },
}))

beforeEach(() => {
  mockCreateTournament.mockReset()
  mockAdvanceStatus.mockReset()
  mockRegisterPlayer.mockReset()
  mockCreateRound.mockReset()
  mockGeneratePairings.mockReset()
})

describe('TournamentScreen', () => {
  it('renders the app title', () => {
    render(<TournamentScreen onSignOut={vi.fn()} />)
    expect(screen.getByText('Tournament')).toBeInTheDocument()
  })

  it('shows sign out button', () => {
    render(<TournamentScreen onSignOut={vi.fn()} />)
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })

  it('calls onSignOut when sign out is clicked', async () => {
    const onSignOut = vi.fn()
    render(<TournamentScreen onSignOut={onSignOut} />)
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }))
    await waitFor(() => expect(onSignOut).toHaveBeenCalled())
  })

  it('shows list of tournaments', () => {
    render(<TournamentScreen onSignOut={vi.fn()} />)
    expect(screen.getByText('Test GT 2025')).toBeInTheDocument()
    expect(screen.getByText('Local League')).toBeInTheDocument()
  })

  it('shows tournament status badges', () => {
    render(<TournamentScreen onSignOut={vi.fn()} />)
    expect(screen.getByText('REGISTRATION')).toBeInTheDocument()
    expect(screen.getByText('IN PROGRESS')).toBeInTheDocument()
  })

  it('shows + New Tournament button', () => {
    render(<TournamentScreen onSignOut={vi.fn()} />)
    expect(screen.getByRole('button', { name: /\+ new tournament/i })).toBeInTheDocument()
  })

  it('navigates to create tournament form', () => {
    render(<TournamentScreen onSignOut={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /\+ new tournament/i }))
    expect(screen.getByRole('heading', { name: 'Create Tournament' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/tournament name/i)).toBeInTheDocument()
  })

  it('creates a tournament when form is submitted', async () => {
    render(<TournamentScreen onSignOut={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /\+ new tournament/i }))

    fireEvent.change(screen.getByPlaceholderText(/tournament name/i), {
      target: { value: 'Summer GT' },
    })
    fireEvent.click(screen.getByRole('button', { name: /create tournament/i }))

    await waitFor(() =>
      expect(mockCreateTournament).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Summer GT' }),
      ),
    )
  })

  it('navigates to tournament detail on click', () => {
    render(<TournamentScreen onSignOut={vi.fn()} />)
    fireEvent.click(screen.getByText('Test GT 2025'))
    expect(screen.getByText(/2000pts Matched Play/)).toBeInTheDocument()
  })

  it('shows standings when on tournament detail', () => {
    render(<TournamentScreen onSignOut={vi.fn()} />)
    fireEvent.click(screen.getByText('Test GT 2025'))
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByText('Carol')).toBeInTheDocument()
  })
})

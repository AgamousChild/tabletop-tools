import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GameTrackerScreen } from './GameTrackerScreen'

const mockStartMatch = vi.fn()
const mockAddTurn = vi.fn()
const mockCloseMatch = vi.fn()

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
    match: {
      list: {
        useQuery: () => ({
          data: [
            { id: 'm1', opponentFaction: 'Orks', mission: 'Scorched Earth', result: 'WIN', isTournament: 0 },
            { id: 'm2', opponentFaction: 'Necrons', mission: 'Priority Targets', result: null, isTournament: 1 },
          ],
          refetch: vi.fn(),
        }),
      },
      get: {
        useQuery: (_input: unknown, _opts?: unknown) => ({
          data: {
            id: 'm2',
            opponentFaction: 'Necrons',
            mission: 'Priority Targets',
            result: null,
            isTournament: 1,
            yourFinalScore: null,
            theirFinalScore: null,
            turns: [],
          },
          refetch: vi.fn(),
        }),
      },
      start: {
        useMutation: (opts?: { onSuccess?: (r: unknown) => void }) => ({
          mutate: (args: unknown) => {
            mockStartMatch(args)
            opts?.onSuccess?.({ id: 'new-match', opponentFaction: 'Tau', mission: 'Test', result: null, isTournament: 0 })
          },
          isPending: false,
        }),
      },
      close: {
        useMutation: (opts?: { onSuccess?: () => void }) => ({
          mutate: (args: unknown) => {
            mockCloseMatch(args)
            opts?.onSuccess?.()
          },
          isPending: false,
        }),
      },
    },
    turn: {
      add: {
        useMutation: (opts?: { onSuccess?: () => void }) => ({
          mutate: (args: unknown) => {
            mockAddTurn(args)
            opts?.onSuccess?.()
          },
          isPending: false,
        }),
      },
    },
  },
}))

beforeEach(() => {
  mockStartMatch.mockReset()
  mockAddTurn.mockReset()
  mockCloseMatch.mockReset()
})

describe('GameTrackerScreen', () => {
  it('renders the app title', () => {
    render(<GameTrackerScreen onSignOut={vi.fn()} />)
    expect(screen.getByText('Game Tracker')).toBeInTheDocument()
  })

  it('shows sign out button', () => {
    render(<GameTrackerScreen onSignOut={vi.fn()} />)
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })

  it('calls onSignOut when sign out is clicked', async () => {
    const onSignOut = vi.fn()
    render(<GameTrackerScreen onSignOut={onSignOut} />)
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }))
    await waitFor(() => expect(onSignOut).toHaveBeenCalled())
  })

  it('shows match history', () => {
    render(<GameTrackerScreen onSignOut={vi.fn()} />)
    expect(screen.getByText('vs Orks')).toBeInTheDocument()
    expect(screen.getByText('vs Necrons')).toBeInTheDocument()
  })

  it('shows WIN result in green', () => {
    render(<GameTrackerScreen onSignOut={vi.fn()} />)
    expect(screen.getByText('WIN')).toBeInTheDocument()
  })

  it('shows in-progress match', () => {
    render(<GameTrackerScreen onSignOut={vi.fn()} />)
    expect(screen.getByText('In progress')).toBeInTheDocument()
  })

  it('navigates to new match form', () => {
    render(<GameTrackerScreen onSignOut={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /\+ new match/i }))
    expect(screen.getByText('New Match')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/orks, necrons/i)).toBeInTheDocument()
  })

  it('starts a match when form is filled and submitted', async () => {
    render(<GameTrackerScreen onSignOut={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /\+ new match/i }))

    fireEvent.change(screen.getByPlaceholderText(/orks, necrons/i), {
      target: { value: 'Tau' },
    })
    fireEvent.change(screen.getByPlaceholderText(/scorched earth/i), {
      target: { value: 'Hold More' },
    })
    fireEvent.click(screen.getByRole('button', { name: /start match/i }))

    await waitFor(() =>
      expect(mockStartMatch).toHaveBeenCalledWith(
        expect.objectContaining({ opponentFaction: 'Tau', mission: 'Hold More' }),
      ),
    )
  })
})

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

let matchGetData: any = null

const completedMatch = {
  id: 'm1',
  opponentFaction: 'Orks',
  mission: 'Scorched Earth',
  result: 'WIN',
  isTournament: 0,
  yourFinalScore: 85,
  theirFinalScore: 60,
  turns: [
    { id: 't1', turnNumber: 1, primaryScored: 15, secondaryScored: 10, cpSpent: 2, yourUnitsLost: '[]', theirUnitsLost: '[{"name":"Boyz"}]', notes: null },
    { id: 't2', turnNumber: 2, primaryScored: 20, secondaryScored: 15, cpSpent: 1, yourUnitsLost: '[{"name":"Intercessors"}]', theirUnitsLost: '[]', notes: null },
  ],
}

const inProgressMatch = {
  id: 'm2',
  opponentFaction: 'Necrons',
  mission: 'Priority Targets',
  result: null,
  isTournament: 1,
  yourFinalScore: null,
  theirFinalScore: null,
  turns: [],
}

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
          data: matchGetData,
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
  matchGetData = inProgressMatch
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

  // ─── Active Match View ────────────────────────────────────────────

  it('clicking an in-progress match navigates to active match view', () => {
    render(<GameTrackerScreen onSignOut={vi.fn()} />)
    fireEvent.click(screen.getByText('vs Necrons').closest('button')!)
    expect(screen.getByText(/Priority Targets/)).toBeInTheDocument()
    expect(screen.getByText('0VP')).toBeInTheDocument()
  })

  it('active match shows Turn 1 heading for empty match', () => {
    render(<GameTrackerScreen onSignOut={vi.fn()} />)
    fireEvent.click(screen.getByText('vs Necrons').closest('button')!)
    expect(screen.getByText('Turn 1')).toBeInTheDocument()
  })

  it('active match records a turn when submitted', async () => {
    render(<GameTrackerScreen onSignOut={vi.fn()} />)
    fireEvent.click(screen.getByText('vs Necrons').closest('button')!)

    const numberInputs = screen.getAllByPlaceholderText('0')
    fireEvent.change(numberInputs[0], { target: { value: '15' } })
    fireEvent.click(screen.getByRole('button', { name: /end turn 1/i }))

    await waitFor(() =>
      expect(mockAddTurn).toHaveBeenCalledWith(
        expect.objectContaining({ matchId: 'm2', turnNumber: 1, primaryScored: 15 }),
      ),
    )
  })

  it('active match End Game button reveals final score inputs', () => {
    render(<GameTrackerScreen onSignOut={vi.fn()} />)
    fireEvent.click(screen.getByText('vs Necrons').closest('button')!)
    fireEvent.click(screen.getByRole('button', { name: /end game/i }))
    expect(screen.getByText('Final Scores')).toBeInTheDocument()
    expect(screen.getByText('Confirm Result')).toBeInTheDocument()
  })

  it('active match submits final scores', async () => {
    render(<GameTrackerScreen onSignOut={vi.fn()} />)
    fireEvent.click(screen.getByText('vs Necrons').closest('button')!)
    fireEvent.click(screen.getByRole('button', { name: /end game/i }))

    const inputs = screen.getAllByPlaceholderText('0')
    fireEvent.change(inputs[inputs.length - 2], { target: { value: '85' } })
    fireEvent.change(inputs[inputs.length - 1], { target: { value: '60' } })
    fireEvent.click(screen.getByRole('button', { name: /confirm result/i }))

    await waitFor(() =>
      expect(mockCloseMatch).toHaveBeenCalledWith(
        expect.objectContaining({ matchId: 'm2', yourScore: 85, theirScore: 60 }),
      ),
    )
  })

  it('active match Back button returns to list view', () => {
    render(<GameTrackerScreen onSignOut={vi.fn()} />)
    fireEvent.click(screen.getByText('vs Necrons').closest('button')!)
    fireEvent.click(screen.getByText('← Back'))
    expect(screen.getByText('Game Tracker')).toBeInTheDocument()
  })

  // ─── Match Summary View ────────────────────────────────────────────

  it('clicking a completed match navigates to summary view', () => {
    matchGetData = completedMatch
    render(<GameTrackerScreen onSignOut={vi.fn()} />)
    fireEvent.click(screen.getByText('vs Orks').closest('button')!)
    expect(screen.getByText('Match Summary')).toBeInTheDocument()
  })

  it('match summary shows result text', () => {
    matchGetData = completedMatch
    render(<GameTrackerScreen onSignOut={vi.fn()} />)
    fireEvent.click(screen.getByText('vs Orks').closest('button')!)
    // The large result text in the summary (not the list badge)
    expect(screen.getByText('WIN')).toBeInTheDocument()
  })

  it('match summary shows final scores', () => {
    matchGetData = completedMatch
    render(<GameTrackerScreen onSignOut={vi.fn()} />)
    fireEvent.click(screen.getByText('vs Orks').closest('button')!)
    expect(screen.getByText('85 – 60')).toBeInTheDocument()
  })

  it('match summary shows turn-by-turn history', () => {
    matchGetData = completedMatch
    render(<GameTrackerScreen onSignOut={vi.fn()} />)
    fireEvent.click(screen.getByText('vs Orks').closest('button')!)
    expect(screen.getByText('Turn by Turn')).toBeInTheDocument()
    expect(screen.getByText('Turn 1')).toBeInTheDocument()
    expect(screen.getByText('Turn 2')).toBeInTheDocument()
    expect(screen.getByText('25VP')).toBeInTheDocument() // 15+10
    expect(screen.getByText('35VP')).toBeInTheDocument() // 20+15
  })
})

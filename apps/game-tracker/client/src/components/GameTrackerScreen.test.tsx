import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GameTrackerScreen } from './GameTrackerScreen'

const mockStartMatch = vi.fn()

vi.mock('../lib/auth', () => ({
  authClient: {
    useSession: () => ({
      data: { user: { id: 'u1', name: 'Alice' } },
      isPending: false,
    }),
    signOut: vi.fn().mockResolvedValue({}),
  },
}))

vi.mock('@tabletop-tools/game-data-store', () => ({
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
  useLists: () => ({
    data: [],
    refetch: vi.fn(),
  }),
}))

let matchGetData: ReturnType<typeof createInProgressMatch> | ReturnType<typeof createCompletedMatch> | null = null

function createInProgressMatch() {
  return {
    id: 'm2',
    opponentFaction: 'Necrons',
    opponentName: null,
    mission: 'Priority Targets',
    deploymentZone: null,
    yourFaction: null,
    yourDetachment: null,
    result: null,
    isTournament: 1,
    yourFinalScore: null,
    theirFinalScore: null,
    requirePhotos: 0,
    whoGoesFirst: 'YOU',
    turns: [] as Array<{
      id: string
      turnNumber: number
      primaryScored: number
      secondaryScored: number
      cpSpent: number
      yourUnitsLost: string
      theirUnitsLost: string
      notes: string | null
    }>,
    secondaries: [],
  }
}

function createCompletedMatch() {
  return {
    id: 'm1',
    opponentFaction: 'Orks',
    opponentName: null,
    mission: 'Scorched Earth',
    deploymentZone: null,
    yourFaction: null,
    yourDetachment: null,
    result: 'WIN' as const,
    isTournament: 0,
    yourFinalScore: 85,
    theirFinalScore: 60,
    requirePhotos: 0,
    whoGoesFirst: 'YOU',
    turns: [
      {
        id: 't1',
        turnNumber: 1,
        primaryScored: 15,
        secondaryScored: 10,
        cpSpent: 2,
        yourPrimary: 15,
        theirPrimary: 5,
        yourSecondary: 10,
        theirSecondary: 3,
        yourCpStart: 0,
        yourCpGained: 1,
        yourCpSpent: 2,
        theirCpStart: 0,
        theirCpGained: 1,
        theirCpSpent: 1,
        yourUnitsLost: '[]',
        theirUnitsLost: '[{"name":"Boyz"}]',
        yourUnitsDestroyed: '[]',
        theirUnitsDestroyed: '[]',
        notes: null,
      },
    ],
    secondaries: [],
  }
}

vi.mock('../lib/trpc', () => ({
  trpc: {
    match: {
      list: {
        useQuery: () => ({
          data: [
            { id: 'm1', opponentFaction: 'Orks', opponentName: null, mission: 'Scorched Earth', result: 'WIN', isTournament: 0 },
            { id: 'm2', opponentFaction: 'Necrons', opponentName: null, mission: 'Priority Targets', result: null, isTournament: 1 },
          ],
          refetch: vi.fn(),
        }),
      },
      get: {
        useQuery: () => ({
          data: matchGetData,
          refetch: vi.fn(),
        }),
      },
      start: {
        useMutation: (opts?: { onSuccess?: (r: unknown) => void }) => ({
          mutate: (args: unknown) => {
            mockStartMatch(args)
            opts?.onSuccess?.({
              id: 'new-match',
              opponentFaction: 'Tau',
              opponentName: null,
              mission: 'Test',
              result: null,
              isTournament: 0,
            })
          },
          isPending: false,
        }),
      },
      close: {
        useMutation: (opts?: { onSuccess?: () => void }) => ({
          mutate: () => {
            opts?.onSuccess?.()
          },
          isPending: false,
        }),
      },
    },
    turn: {
      add: {
        useMutation: (opts?: { onSuccess?: () => void }) => ({
          mutate: () => {
            opts?.onSuccess?.()
          },
          isPending: false,
        }),
      },
    },
    secondary: {
      set: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      remove: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      score: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
    },
  },
}))

beforeEach(() => {
  mockStartMatch.mockReset()
  matchGetData = createInProgressMatch()
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

  it('navigates to match setup when + New Match clicked', () => {
    render(<GameTrackerScreen onSignOut={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /\+ new match/i }))
    expect(screen.getByText('Match Setup')).toBeInTheDocument()
  })

  it('navigates through multi-screen wizard: setup -> mission -> pregame', () => {
    render(<GameTrackerScreen onSignOut={vi.fn()} />)
    // Go to match setup
    fireEvent.click(screen.getByRole('button', { name: /\+ new match/i }))
    expect(screen.getByText('Match Setup')).toBeInTheDocument()

    // Fill opponent faction and proceed
    fireEvent.change(screen.getByPlaceholderText(/orks, necrons/i), {
      target: { value: 'Tau' },
    })
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByText('Mission Setup')).toBeInTheDocument()

    // Select mission and proceed
    fireEvent.change(screen.getByLabelText('Select mission'), {
      target: { value: 'Take and Hold' },
    })
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByText('Pre-Game')).toBeInTheDocument()
  })

  it('starts a match through full wizard flow', async () => {
    render(<GameTrackerScreen onSignOut={vi.fn()} />)

    // Match setup
    fireEvent.click(screen.getByRole('button', { name: /\+ new match/i }))
    fireEvent.change(screen.getByPlaceholderText(/orks, necrons/i), {
      target: { value: 'Tau' },
    })
    fireEvent.click(screen.getByRole('button', { name: /next/i }))

    // Mission setup
    fireEvent.change(screen.getByLabelText('Select mission'), {
      target: { value: 'Take and Hold' },
    })
    fireEvent.click(screen.getByRole('button', { name: /next/i }))

    // Pregame
    fireEvent.click(screen.getByText('You Attack'))
    fireEvent.click(screen.getByRole('button', { name: 'You' }))
    fireEvent.click(screen.getByRole('button', { name: /start battle/i }))

    await waitFor(() =>
      expect(mockStartMatch).toHaveBeenCalledWith(
        expect.objectContaining({
          opponentFaction: 'Tau',
          mission: 'Take and Hold',
          attackerDefender: 'YOU_ATTACK',
          whoGoesFirst: 'YOU',
        }),
      ),
    )
  })

  // ─── Active Match View ────────────────────────────────────────────

  it('clicking an in-progress match navigates to battle view', () => {
    render(<GameTrackerScreen onSignOut={vi.fn()} />)
    fireEvent.click(screen.getByText('vs Necrons').closest('button')!)
    expect(screen.getByText(/Priority Targets/)).toBeInTheDocument()
    expect(screen.getByText('Round 1 of 5')).toBeInTheDocument()
  })

  // ─── Match Summary View ────────────────────────────────────────────

  it('clicking a completed match navigates to summary view', () => {
    matchGetData = createCompletedMatch()
    render(<GameTrackerScreen onSignOut={vi.fn()} />)
    fireEvent.click(screen.getByText('vs Orks').closest('button')!)
    expect(screen.getByText('Match Summary')).toBeInTheDocument()
  })

  it('match summary shows result and scores', () => {
    matchGetData = createCompletedMatch()
    render(<GameTrackerScreen onSignOut={vi.fn()} />)
    fireEvent.click(screen.getByText('vs Orks').closest('button')!)
    expect(screen.getByText('WIN')).toBeInTheDocument()
    expect(screen.getByText('85 -- 60')).toBeInTheDocument()
  })

  it('back from match setup returns to list', () => {
    render(<GameTrackerScreen onSignOut={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /\+ new match/i }))
    expect(screen.getByText('Match Setup')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Back'))
    expect(screen.getByText('Game Tracker')).toBeInTheDocument()
  })
})

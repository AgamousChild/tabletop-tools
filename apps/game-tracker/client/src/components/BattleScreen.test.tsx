import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BattleScreen } from './BattleScreen'

const mockAddTurn = vi.fn()
const mockCloseMatch = vi.fn()

const inProgressMatch = {
  id: 'm1',
  opponentFaction: 'Necrons',
  opponentName: null,
  mission: 'Priority Targets',
  deploymentZone: 'Tipping Point',
  yourFaction: 'Space Marines',
  yourDetachment: 'Gladius',
  result: null,
  isTournament: 0,
  yourFinalScore: null,
  theirFinalScore: null,
  requirePhotos: 0,
  whoGoesFirst: 'YOU',
  turns: [],
  secondaries: [],
}

const matchWithTurns = {
  ...inProgressMatch,
  turns: [
    {
      id: 't1',
      turnNumber: 1,
      yourPrimary: 8,
      theirPrimary: 4,
      yourSecondary: 4,
      theirSecondary: 2,
      yourCpStart: 0,
      yourCpGained: 1,
      yourCpSpent: 2,
      theirCpStart: 0,
      theirCpGained: 1,
      theirCpSpent: 1,
      primaryScored: 8,
      secondaryScored: 4,
      cpSpent: 2,
      yourUnitsLost: '[]',
      theirUnitsLost: '[{"name":"Boyz"}]',
      yourUnitsDestroyed: '[]',
      theirUnitsDestroyed: '[]',
      notes: null,
    },
  ],
}

let currentMatch: typeof inProgressMatch | typeof matchWithTurns = inProgressMatch

vi.mock('../lib/trpc', () => ({
  trpc: {
    match: {
      get: {
        useQuery: () => ({
          data: currentMatch,
          refetch: vi.fn(),
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
  mockAddTurn.mockReset()
  mockCloseMatch.mockReset()
  currentMatch = inProgressMatch
})

describe('BattleScreen', () => {
  it('shows opponent and mission info', () => {
    render(<BattleScreen matchId="m1" onBack={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('vs Necrons')).toBeInTheDocument()
    expect(screen.getByText(/Priority Targets/)).toBeInTheDocument()
  })

  it('shows deployment zone in header', () => {
    render(<BattleScreen matchId="m1" onBack={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText(/Tipping Point/)).toBeInTheDocument()
  })

  it('shows scoreboard with VP totals', () => {
    render(<BattleScreen matchId="m1" onBack={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Round 1 of 5')).toBeInTheDocument()
    // Initial VP is 0 for both
    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(2)
  })

  it('shows your Command Phase for round 1', () => {
    render(<BattleScreen matchId="m1" onBack={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Your Command Phase')).toBeInTheDocument()
  })

  it('shows round history when turns exist', () => {
    currentMatch = matchWithTurns
    render(<BattleScreen matchId="m1" onBack={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Rounds recorded')).toBeInTheDocument()
    expect(screen.getByText('Round 1')).toBeInTheDocument()
    expect(screen.getByText(/You: 8VP/)).toBeInTheDocument()
  })

  it('records a turn through the round wizard', async () => {
    render(<BattleScreen matchId="m1" onBack={vi.fn()} onClose={vi.fn()} />)

    // Your command phase → action phase
    fireEvent.click(screen.getByRole('button', { name: /continue to action phase/i }))
    // Your action phase → their turn
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    // Their command phase → action phase
    fireEvent.click(screen.getByRole('button', { name: /continue to action phase/i }))
    // Their action phase → summary
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    // Confirm & save
    fireEvent.click(screen.getByRole('button', { name: /confirm & save round/i }))

    await waitFor(() =>
      expect(mockAddTurn).toHaveBeenCalledWith(
        expect.objectContaining({ matchId: 'm1', turnNumber: 1 }),
      ),
    )
  })

  it('End Game button reveals final score inputs', () => {
    render(<BattleScreen matchId="m1" onBack={vi.fn()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /end game/i }))
    expect(screen.getByText('Final Scores')).toBeInTheDocument()
  })

  it('submits final scores and calls onClose', async () => {
    const onClose = vi.fn()
    render(<BattleScreen matchId="m1" onBack={vi.fn()} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /end game/i }))

    const inputs = screen.getAllByPlaceholderText('0')
    fireEvent.change(inputs[inputs.length - 2]!, { target: { value: '85' } })
    fireEvent.change(inputs[inputs.length - 1]!, { target: { value: '60' } })
    fireEvent.click(screen.getByRole('button', { name: /confirm result/i }))

    await waitFor(() => {
      expect(mockCloseMatch).toHaveBeenCalledWith(
        expect.objectContaining({ matchId: 'm1', yourScore: 85, theirScore: 60 }),
      )
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('Back button calls onBack', () => {
    const onBack = vi.fn()
    render(<BattleScreen matchId="m1" onBack={onBack} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('Back'))
    expect(onBack).toHaveBeenCalled()
  })
})

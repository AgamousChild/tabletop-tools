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
  turns: [],
}

const matchWithTurns = {
  ...inProgressMatch,
  turns: [
    {
      id: 't1',
      turnNumber: 1,
      primaryScored: 8,
      secondaryScored: 4,
      cpSpent: 2,
      yourUnitsLost: '[]',
      theirUnitsLost: '[{"name":"Boyz"}]',
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

  it('shows current VP total', () => {
    render(<BattleScreen matchId="m1" onBack={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('0VP')).toBeInTheDocument()
  })

  it('shows Round 1 heading for empty match', () => {
    render(<BattleScreen matchId="m1" onBack={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Round 1')).toBeInTheDocument()
  })

  it('shows round history when turns exist', () => {
    currentMatch = matchWithTurns
    render(<BattleScreen matchId="m1" onBack={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Rounds recorded')).toBeInTheDocument()
    expect(screen.getByText('Round 1')).toBeInTheDocument()
    expect(screen.getByText('P:8 S:4 CP:2')).toBeInTheDocument()
  })

  it('records a turn when submitted', async () => {
    render(<BattleScreen matchId="m1" onBack={vi.fn()} onClose={vi.fn()} />)

    const numberInputs = screen.getAllByPlaceholderText('0')
    fireEvent.change(numberInputs[0]!, { target: { value: '15' } })
    fireEvent.click(screen.getByRole('button', { name: /end round 1/i }))

    await waitFor(() =>
      expect(mockAddTurn).toHaveBeenCalledWith(
        expect.objectContaining({ matchId: 'm1', turnNumber: 1, primaryScored: 15 }),
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

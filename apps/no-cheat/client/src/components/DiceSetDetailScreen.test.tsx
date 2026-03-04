import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { DiceSetDetailScreen } from './DiceSetDetailScreen'

const diceSet = { id: 'set-1', name: 'Red Dragons' }

const fakeSessions = [
  {
    id: 'sess-1',
    userId: 'u1',
    diceSetId: 'set-1',
    isLoaded: 1,
    zScore: 2.84,
    opponentName: 'Dave',
    createdAt: 1_700_000_000_000,
    closedAt: 1_700_000_001_000,
    photoUrl: null,
  },
  {
    id: 'sess-2',
    userId: 'u1',
    diceSetId: 'set-1',
    isLoaded: 0,
    zScore: 0.4,
    opponentName: null,
    createdAt: 1_699_000_000_000,
    closedAt: 1_699_000_001_000,
    photoUrl: null,
  },
]

vi.mock('../lib/trpc', () => ({
  trpc: {
    session: {
      list: {
        useQuery: () => ({ data: fakeSessions, isLoading: false, refetch: vi.fn() }),
      },
      delete: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
  },
}))

describe('DiceSetDetailScreen', () => {
  it('renders the dice set name', () => {
    render(
      <DiceSetDetailScreen
        diceSet={diceSet}
        onBack={() => {}}
        onStartSession={() => {}}
        onSelectSession={() => {}}
        onTrainDetection={() => {}}
      />,
    )
    expect(screen.getByText('Red Dragons')).toBeInTheDocument()
  })

  it('shows session history from the query', () => {
    render(
      <DiceSetDetailScreen
        diceSet={diceSet}
        onBack={() => {}}
        onStartSession={() => {}}
        onSelectSession={() => {}}
        onTrainDetection={() => {}}
      />,
    )
    expect(screen.getByText('Loaded')).toBeInTheDocument()
    expect(screen.getByText('Fair')).toBeInTheDocument()
  })

  it('calls onStartSession when New Session is clicked', () => {
    const onStartSession = vi.fn()
    render(
      <DiceSetDetailScreen
        diceSet={diceSet}
        onBack={() => {}}
        onStartSession={onStartSession}
        onSelectSession={() => {}}
        onTrainDetection={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /new session/i }))
    expect(onStartSession).toHaveBeenCalled()
  })

  it('calls onBack when the back button is clicked', () => {
    const onBack = vi.fn()
    render(
      <DiceSetDetailScreen
        diceSet={diceSet}
        onBack={onBack}
        onStartSession={() => {}}
        onSelectSession={() => {}}
        onTrainDetection={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(onBack).toHaveBeenCalled()
  })

  it('calls onSelectSession with the session id when a session is clicked', () => {
    const onSelectSession = vi.fn()
    render(
      <DiceSetDetailScreen
        diceSet={diceSet}
        onBack={() => {}}
        onStartSession={() => {}}
        onSelectSession={onSelectSession}
        onTrainDetection={() => {}}
      />,
    )
    fireEvent.click(screen.getByText('Loaded'))
    expect(onSelectSession).toHaveBeenCalledWith('sess-1')
  })

  it('shows delete buttons for each session', () => {
    render(
      <DiceSetDetailScreen
        diceSet={diceSet}
        onBack={() => {}}
        onStartSession={() => {}}
        onSelectSession={() => {}}
        onTrainDetection={() => {}}
      />,
    )
    const deleteButtons = screen.getAllByLabelText('Delete session')
    expect(deleteButtons).toHaveLength(2)
  })

  it('shows confirmation message on first delete click', () => {
    render(
      <DiceSetDetailScreen
        diceSet={diceSet}
        onBack={() => {}}
        onStartSession={() => {}}
        onSelectSession={() => {}}
        onTrainDetection={() => {}}
      />,
    )
    const deleteButtons = screen.getAllByLabelText('Delete session')
    fireEvent.click(deleteButtons[0]!)
    expect(screen.getByText(/tap.*again to confirm/i)).toBeInTheDocument()
  })
})

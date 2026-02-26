import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { RoundSummary } from './RoundSummary'
import { createEmptyTurnData } from './types'

const defaultProps = {
  roundNumber: 2,
  yourTurn: { ...createEmptyTurnData(), primaryVp: 5, cpGained: 1 },
  theirTurn: { ...createEmptyTurnData(), primaryVp: 3 },
  opponentName: 'Bob',
  onConfirm: vi.fn(),
  onBack: vi.fn(),
  isSaving: false,
}

describe('RoundSummary', () => {
  it('shows round number', () => {
    render(<RoundSummary {...defaultProps} />)
    expect(screen.getByText('Round 2 Summary')).toBeInTheDocument()
  })

  it('shows both player columns', () => {
    render(<RoundSummary {...defaultProps} />)
    expect(screen.getByText('You')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('shows primary VP for both players', () => {
    render(<RoundSummary {...defaultProps} />)
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('shows units destroyed', () => {
    const props = {
      ...defaultProps,
      yourTurn: {
        ...createEmptyTurnData(),
        unitsDestroyed: [{ contentId: 'boyz', name: 'Boyz' }],
      },
    }
    render(<RoundSummary {...props} />)
    expect(screen.getByText('Destroyed: Boyz')).toBeInTheDocument()
  })

  it('shows stratagems used', () => {
    const props = {
      ...defaultProps,
      yourTurn: {
        ...createEmptyTurnData(),
        stratagems: [{ stratagemName: 'Overwatch', cpCost: 1 }],
      },
    }
    render(<RoundSummary {...props} />)
    expect(screen.getByText('Overwatch')).toBeInTheDocument()
  })

  it('calls onConfirm when save clicked', () => {
    const onConfirm = vi.fn()
    render(<RoundSummary {...defaultProps} onConfirm={onConfirm} />)
    fireEvent.click(screen.getByRole('button', { name: /confirm & save round/i }))
    expect(onConfirm).toHaveBeenCalled()
  })

  it('calls onBack when back clicked', () => {
    const onBack = vi.fn()
    render(<RoundSummary {...defaultProps} onBack={onBack} />)
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(onBack).toHaveBeenCalled()
  })

  it('shows saving state', () => {
    render(<RoundSummary {...defaultProps} isSaving={true} />)
    expect(screen.getByText('Saving...')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled()
  })
})

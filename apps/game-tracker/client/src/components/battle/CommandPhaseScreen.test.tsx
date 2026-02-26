import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { CommandPhaseScreen } from './CommandPhaseScreen'
import { createEmptyTurnData } from './types'

const defaultProps = {
  player: 'You' as const,
  turnData: createEmptyTurnData(),
  onUpdate: vi.fn(),
  onNext: vi.fn(),
  secondaries: [],
  onAddSecondary: vi.fn(),
  onRemoveSecondary: vi.fn(),
  onScoreSecondary: vi.fn(),
  currentRound: 1,
}

describe('CommandPhaseScreen', () => {
  it('shows command phase title for "You"', () => {
    render(<CommandPhaseScreen {...defaultProps} />)
    expect(screen.getByText("Your Command Phase")).toBeInTheDocument()
  })

  it('shows opponent name in title', () => {
    render(<CommandPhaseScreen {...defaultProps} player="Bob" />)
    expect(screen.getByText("Bob's Command Phase")).toBeInTheDocument()
  })

  it('shows round number', () => {
    render(<CommandPhaseScreen {...defaultProps} currentRound={3} />)
    expect(screen.getByText('R3')).toBeInTheDocument()
  })

  it('shows CP Gained stepper defaulting to 1', () => {
    render(<CommandPhaseScreen {...defaultProps} />)
    expect(screen.getByText('CP Gained')).toBeInTheDocument()
  })

  it('shows Primary VP stepper', () => {
    render(<CommandPhaseScreen {...defaultProps} />)
    expect(screen.getByText('Primary VP')).toBeInTheDocument()
  })

  it('shows secondaries section', () => {
    render(<CommandPhaseScreen {...defaultProps} />)
    expect(screen.getByText('Your Secondaries')).toBeInTheDocument()
  })

  it('shows stratagems section', () => {
    render(<CommandPhaseScreen {...defaultProps} />)
    expect(screen.getByText('Command Phase Stratagems')).toBeInTheDocument()
  })

  it('calls onNext when Continue clicked', () => {
    const onNext = vi.fn()
    render(<CommandPhaseScreen {...defaultProps} onNext={onNext} />)
    fireEvent.click(screen.getByRole('button', { name: /continue to action phase/i }))
    expect(onNext).toHaveBeenCalled()
  })

  it('calls onUpdate when VP changed', () => {
    const onUpdate = vi.fn()
    render(<CommandPhaseScreen {...defaultProps} onUpdate={onUpdate} />)
    fireEvent.click(screen.getByLabelText('Increase Primary VP'))
    expect(onUpdate).toHaveBeenCalledWith({ primaryVp: 1 })
  })
})

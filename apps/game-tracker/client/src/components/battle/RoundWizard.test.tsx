import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { RoundWizard } from './RoundWizard'

const defaultProps = {
  roundNumber: 1,
  opponentName: 'Bob',
  requirePhotos: false,
  yourSecondaries: [],
  theirSecondaries: [],
  onAddSecondary: vi.fn(),
  onRemoveSecondary: vi.fn(),
  onScoreSecondary: vi.fn(),
  onSave: vi.fn(),
  isSaving: false,
  whoGoesFirst: 'YOU' as const,
}

describe('RoundWizard', () => {
  it('starts with your command phase when you go first', () => {
    render(<RoundWizard {...defaultProps} />)
    expect(screen.getByText('Your Command Phase')).toBeInTheDocument()
  })

  it('starts with opponent command phase when they go first', () => {
    render(<RoundWizard {...defaultProps} whoGoesFirst="THEM" />)
    expect(screen.getByText("Bob's Command Phase")).toBeInTheDocument()
  })

  it('transitions from your turn to their turn', () => {
    render(<RoundWizard {...defaultProps} />)
    // Command phase → Action phase
    fireEvent.click(screen.getByRole('button', { name: /continue to action phase/i }))
    // Action phase → complete your turn
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    // Now should be opponent's command phase
    expect(screen.getByText("Bob's Command Phase")).toBeInTheDocument()
  })

  it('transitions from their turn to summary', () => {
    render(<RoundWizard {...defaultProps} />)
    // Your command → action
    fireEvent.click(screen.getByRole('button', { name: /continue to action phase/i }))
    // Your action → complete
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    // Their command → action
    fireEvent.click(screen.getByRole('button', { name: /continue to action phase/i }))
    // Their action → complete
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    // Summary
    expect(screen.getByText('Round 1 Summary')).toBeInTheDocument()
  })

  it('calls onSave when confirm clicked on summary', () => {
    const onSave = vi.fn()
    render(<RoundWizard {...defaultProps} onSave={onSave} />)

    // Navigate through both turns to summary
    fireEvent.click(screen.getByRole('button', { name: /continue to action phase/i }))
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    fireEvent.click(screen.getByRole('button', { name: /continue to action phase/i }))
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))

    // Confirm save
    fireEvent.click(screen.getByRole('button', { name: /confirm & save round/i }))
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ cpGained: 1, primaryVp: 0 }),
      expect.objectContaining({ cpGained: 1, primaryVp: 0 }),
    )
  })

  it('back from summary returns to second player turn', () => {
    render(<RoundWizard {...defaultProps} />)

    // Navigate to summary
    fireEvent.click(screen.getByRole('button', { name: /continue to action phase/i }))
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    fireEvent.click(screen.getByRole('button', { name: /continue to action phase/i }))
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))

    // Back from summary
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    // Should see opponent's command phase again (since they go second and the TurnFlow resets)
    expect(screen.getByText("Bob's Command Phase")).toBeInTheDocument()
  })

  it('shows saving state', () => {
    render(<RoundWizard {...defaultProps} isSaving={true} />)

    // Navigate to summary
    fireEvent.click(screen.getByRole('button', { name: /continue to action phase/i }))
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    fireEvent.click(screen.getByRole('button', { name: /continue to action phase/i }))
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))

    expect(screen.getByText('Saving...')).toBeInTheDocument()
  })
})

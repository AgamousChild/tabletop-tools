import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { TurnFlow } from './TurnFlow'
import { createEmptyTurnData } from './types'

const defaultProps = {
  player: 'You' as const,
  turnData: createEmptyTurnData(),
  onUpdate: vi.fn(),
  onComplete: vi.fn(),
  requirePhotos: false,
  secondaries: [],
  onAddSecondary: vi.fn(),
  onRemoveSecondary: vi.fn(),
  onScoreSecondary: vi.fn(),
  currentRound: 1,
}

describe('TurnFlow', () => {
  it('starts with Command Phase', () => {
    render(<TurnFlow {...defaultProps} />)
    expect(screen.getByText('Your Command Phase')).toBeInTheDocument()
  })

  it('transitions to Action Phase after command', () => {
    render(<TurnFlow {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /continue to action phase/i }))
    expect(screen.getByText('Your Action Phase')).toBeInTheDocument()
  })

  it('calls onComplete after action phase when photos not required', () => {
    const onComplete = vi.fn()
    render(<TurnFlow {...defaultProps} onComplete={onComplete} />)
    fireEvent.click(screen.getByRole('button', { name: /continue to action phase/i }))
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(onComplete).toHaveBeenCalled()
  })

  it('shows photo screen after action phase when photos required', () => {
    render(<TurnFlow {...defaultProps} requirePhotos={true} />)
    fireEvent.click(screen.getByRole('button', { name: /continue to action phase/i }))
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(screen.getByText('Your Board Photo')).toBeInTheDocument()
  })

  it('shows opponent label when player is not You', () => {
    render(<TurnFlow {...defaultProps} player="Bob" />)
    expect(screen.getByText("Bob's Command Phase")).toBeInTheDocument()
  })
})

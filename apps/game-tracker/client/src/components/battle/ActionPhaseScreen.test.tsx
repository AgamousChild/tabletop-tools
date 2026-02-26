import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ActionPhaseScreen } from './ActionPhaseScreen'
import { createEmptyTurnData } from './types'

const defaultProps = {
  player: 'You' as const,
  turnData: createEmptyTurnData(),
  onUpdate: vi.fn(),
  onNext: vi.fn(),
}

describe('ActionPhaseScreen', () => {
  it('shows action phase title for "You"', () => {
    render(<ActionPhaseScreen {...defaultProps} />)
    expect(screen.getByText('Your Action Phase')).toBeInTheDocument()
  })

  it('shows opponent name in title', () => {
    render(<ActionPhaseScreen {...defaultProps} player="Bob" />)
    expect(screen.getByText("Bob's Action Phase")).toBeInTheDocument()
  })

  it('shows unit picker with correct label for your turn', () => {
    render(<ActionPhaseScreen {...defaultProps} />)
    expect(screen.getByText('Their Units You Destroyed')).toBeInTheDocument()
  })

  it('shows unit picker with correct label for opponent turn', () => {
    render(<ActionPhaseScreen {...defaultProps} player="Bob" />)
    expect(screen.getByText('Your Units They Destroyed')).toBeInTheDocument()
  })

  it('shows stratagem section', () => {
    render(<ActionPhaseScreen {...defaultProps} />)
    expect(screen.getByText('Action Phase Stratagems')).toBeInTheDocument()
  })

  it('shows notes input', () => {
    render(<ActionPhaseScreen {...defaultProps} />)
    expect(screen.getByLabelText('Turn notes')).toBeInTheDocument()
  })

  it('calls onNext when Continue clicked', () => {
    const onNext = vi.fn()
    render(<ActionPhaseScreen {...defaultProps} onNext={onNext} />)
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(onNext).toHaveBeenCalled()
  })

  it('calls onUpdate when notes changed', () => {
    const onUpdate = vi.fn()
    render(<ActionPhaseScreen {...defaultProps} onUpdate={onUpdate} />)
    fireEvent.change(screen.getByLabelText('Turn notes'), { target: { value: 'Bad move' } })
    expect(onUpdate).toHaveBeenCalledWith({ notes: 'Bad move' })
  })
})

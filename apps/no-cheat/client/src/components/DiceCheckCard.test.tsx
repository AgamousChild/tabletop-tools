import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DiceCheckCard } from './DiceCheckCard'

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    putImageData: vi.fn(),
    createImageData: vi.fn().mockReturnValue({
      data: new Uint8ClampedArray(80 * 80 * 4),
    }),
    drawImage: vi.fn(),
    clearRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
})

const defaultProps = {
  roiGray: new Uint8Array(64 * 64),
  roiWidth: 64,
  roiHeight: 64,
  pipGuess: 3 as number | null,
  dismissed: false,
  onToggle: vi.fn(),
  onChangePip: vi.fn(),
}

describe('DiceCheckCard', () => {
  it('renders a canvas for the ROI image', () => {
    render(<DiceCheckCard {...defaultProps} />)
    const card = screen.getByTestId('dice-check-card')
    const canvas = card.querySelector('canvas')
    expect(canvas).toBeInTheDocument()
  })

  it('shows the pip guess value', () => {
    render(<DiceCheckCard {...defaultProps} pipGuess={5} />)
    expect(screen.getByTestId('pip-guess')).toHaveTextContent('5')
  })

  it('shows "?" when pip guess is null', () => {
    render(<DiceCheckCard {...defaultProps} pipGuess={null} />)
    expect(screen.getByTestId('pip-guess')).toHaveTextContent('?')
  })

  it('shows emerald border when not dismissed', () => {
    render(<DiceCheckCard {...defaultProps} dismissed={false} />)
    const card = screen.getByTestId('dice-check-card')
    expect(card.className).toContain('emerald')
  })

  it('shows red border and reduced opacity when dismissed', () => {
    render(<DiceCheckCard {...defaultProps} dismissed={true} />)
    const card = screen.getByTestId('dice-check-card')
    expect(card.className).toContain('red')
    expect(card.className).toContain('opacity')
  })

  it('calls onToggle when dismiss button is clicked', () => {
    const onToggle = vi.fn()
    render(<DiceCheckCard {...defaultProps} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button', { name: /not a die/i }))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('calls onToggle when undo button is clicked on dismissed card', () => {
    const onToggle = vi.fn()
    render(<DiceCheckCard {...defaultProps} dismissed={true} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button', { name: /keep/i }))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('shows "Not a die" button when not dismissed', () => {
    render(<DiceCheckCard {...defaultProps} dismissed={false} />)
    expect(screen.getByRole('button', { name: /not a die/i })).toBeInTheDocument()
  })

  it('shows "Keep" button when dismissed', () => {
    render(<DiceCheckCard {...defaultProps} dismissed={true} />)
    expect(screen.getByRole('button', { name: /keep/i })).toBeInTheDocument()
  })

  it('shows pip correction buttons when not dismissed and onChangePip provided', () => {
    render(<DiceCheckCard {...defaultProps} />)
    for (let pip = 1; pip <= 6; pip++) {
      expect(screen.getByRole('button', { name: `Set pip ${pip}` })).toBeInTheDocument()
    }
  })

  it('hides pip correction buttons when dismissed', () => {
    render(<DiceCheckCard {...defaultProps} dismissed={true} />)
    expect(screen.queryByRole('button', { name: /set pip/i })).not.toBeInTheDocument()
  })

  it('highlights the current pip guess in the correction buttons', () => {
    render(<DiceCheckCard {...defaultProps} pipGuess={4} />)
    const btn4 = screen.getByRole('button', { name: 'Set pip 4' })
    expect(btn4.className).toContain('emerald')
  })

  it('calls onChangePip with the selected pip value', () => {
    const onChangePip = vi.fn()
    render(<DiceCheckCard {...defaultProps} onChangePip={onChangePip} />)
    fireEvent.click(screen.getByRole('button', { name: 'Set pip 5' }))
    expect(onChangePip).toHaveBeenCalledWith(5)
  })

  it('does not show pip buttons when onChangePip is not provided', () => {
    render(<DiceCheckCard {...defaultProps} onChangePip={undefined} />)
    expect(screen.queryByRole('button', { name: /set pip/i })).not.toBeInTheDocument()
  })
})

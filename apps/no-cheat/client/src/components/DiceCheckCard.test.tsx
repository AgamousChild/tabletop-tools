import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

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
})

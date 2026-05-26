import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TrainingRoiCard } from './TrainingRoiCard'

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
  guess: 3 as number | null,
  confidence: 0.9,
  selectedLabel: null as number | null,
  skipped: false,
  onCorrect: vi.fn(),
  onSkip: vi.fn(),
}

describe('TrainingRoiCard', () => {
  it('renders a canvas element for the ROI image', () => {
    render(<TrainingRoiCard {...defaultProps} />)
    const card = screen.getByTestId('training-roi-card')
    const canvas = card.querySelector('canvas')
    expect(canvas).toBeInTheDocument()
  })

  it('shows the guess value when provided', () => {
    render(<TrainingRoiCard {...defaultProps} guess={5} />)
    expect(screen.getByTestId('guess-display')).toHaveTextContent('5')
  })

  it('shows "?" when guess is null', () => {
    render(<TrainingRoiCard {...defaultProps} guess={null} />)
    expect(screen.getByTestId('guess-display')).toHaveTextContent('?')
  })

  it('renders 6 pip buttons (1-6)', () => {
    render(<TrainingRoiCard {...defaultProps} />)
    for (let i = 1; i <= 6; i++) {
      expect(screen.getByRole('button', { name: String(i) })).toBeInTheDocument()
    }
  })

  it('renders a Skip button', () => {
    render(<TrainingRoiCard {...defaultProps} />)
    expect(screen.getByRole('button', { name: /skip/i })).toBeInTheDocument()
  })

  it('calls onCorrect with the label when a pip button is clicked', () => {
    const onCorrect = vi.fn()
    render(<TrainingRoiCard {...defaultProps} onCorrect={onCorrect} />)
    fireEvent.click(screen.getByRole('button', { name: '4' }))
    expect(onCorrect).toHaveBeenCalledWith(4)
  })

  it('calls onSkip when Skip is clicked', () => {
    const onSkip = vi.fn()
    render(<TrainingRoiCard {...defaultProps} onSkip={onSkip} />)
    fireEvent.click(screen.getByRole('button', { name: /skip/i }))
    expect(onSkip).toHaveBeenCalledOnce()
  })

  it('highlights the guessed button in amber when no label selected', () => {
    render(<TrainingRoiCard {...defaultProps} guess={3} selectedLabel={null} />)
    const guessedButton = screen.getByRole('button', { name: '3' })
    const otherButton = screen.getByRole('button', { name: '5' })
    expect(guessedButton.className).toContain('amber')
    expect(otherButton.className).not.toContain('amber')
  })

  it('highlights the selected label in emerald, not the guess', () => {
    render(<TrainingRoiCard {...defaultProps} guess={3} selectedLabel={5} />)
    const selectedButton = screen.getByRole('button', { name: '5' })
    const guessButton = screen.getByRole('button', { name: '3' })
    expect(selectedButton.className).toContain('emerald')
    expect(guessButton.className).not.toContain('amber')
  })

  it('shows "Skipped" text when skipped is true', () => {
    render(<TrainingRoiCard {...defaultProps} skipped={true} />)
    expect(screen.getByRole('button', { name: /skipped/i })).toBeInTheDocument()
  })

  it('shows green border for high confidence (> 0.8)', () => {
    render(<TrainingRoiCard {...defaultProps} confidence={0.9} />)
    const card = screen.getByTestId('training-roi-card')
    expect(card.className).toContain('emerald')
  })

  it('shows amber border for medium confidence (0.5-0.8)', () => {
    render(<TrainingRoiCard {...defaultProps} confidence={0.65} />)
    const card = screen.getByTestId('training-roi-card')
    expect(card.className).toContain('amber')
  })

  it('shows red border for low confidence (< 0.5)', () => {
    render(<TrainingRoiCard {...defaultProps} confidence={0.3} />)
    const card = screen.getByTestId('training-roi-card')
    expect(card.className).toContain('red')
  })

  it('shows red border when confidence is 0 and guess is null', () => {
    render(<TrainingRoiCard {...defaultProps} guess={null} confidence={0} />)
    const card = screen.getByTestId('training-roi-card')
    expect(card.className).toContain('red')
  })
})

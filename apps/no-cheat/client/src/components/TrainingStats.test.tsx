import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { TrainingStats } from './TrainingStats'

const defaultProps = {
  stats: {
    totalGuesses: 20,
    correctGuesses: 16,
    corrections: 4,
  },
  exampleCounts: new Map<number, number>([
    [1, 5],
    [2, 8],
    [3, 3],
    [4, 7],
    [5, 6],
    [6, 4],
  ]),
  totalExamples: 33,
  onClear: vi.fn(),
}

describe('TrainingStats', () => {
  it('shows "No training data" when totalExamples is 0', () => {
    render(
      <TrainingStats {...defaultProps} totalExamples={0} exampleCounts={new Map()} stats={null} />,
    )
    expect(screen.getByText('No training data')).toBeInTheDocument()
  })

  it('shows total example count', () => {
    render(<TrainingStats {...defaultProps} />)
    expect(screen.getByText('33')).toBeInTheDocument()
    expect(screen.getByText(/total examples/i)).toBeInTheDocument()
  })

  it('shows per-class counts for each label 1-6', () => {
    render(<TrainingStats {...defaultProps} />)
    // Each pip label should be visible
    for (let i = 1; i <= 6; i++) {
      expect(screen.getByTestId(`class-${i}`)).toBeInTheDocument()
    }
    // Check specific counts
    expect(screen.getByTestId('class-1')).toHaveTextContent('5')
    expect(screen.getByTestId('class-2')).toHaveTextContent('8')
    expect(screen.getByTestId('class-3')).toHaveTextContent('3')
    expect(screen.getByTestId('class-4')).toHaveTextContent('7')
    expect(screen.getByTestId('class-5')).toHaveTextContent('6')
    expect(screen.getByTestId('class-6')).toHaveTextContent('4')
  })

  it('shows 0 for classes with no examples', () => {
    const sparse = new Map<number, number>([
      [1, 3],
      [4, 2],
    ])
    render(<TrainingStats {...defaultProps} exampleCounts={sparse} totalExamples={5} />)
    expect(screen.getByTestId('class-2')).toHaveTextContent('0')
    expect(screen.getByTestId('class-3')).toHaveTextContent('0')
    expect(screen.getByTestId('class-5')).toHaveTextContent('0')
    expect(screen.getByTestId('class-6')).toHaveTextContent('0')
  })

  it('shows accuracy percentage when stats exist', () => {
    render(<TrainingStats {...defaultProps} />)
    // 16/20 = 80.0%
    expect(screen.getByText('80.0%')).toBeInTheDocument()
  })

  it('shows "—" for accuracy when stats is null', () => {
    render(<TrainingStats {...defaultProps} stats={null} />)
    expect(screen.getByTestId('accuracy-value')).toHaveTextContent('—')
  })

  it('shows "—" for accuracy when totalGuesses is 0', () => {
    render(
      <TrainingStats
        {...defaultProps}
        stats={{ totalGuesses: 0, correctGuesses: 0, corrections: 0 }}
      />,
    )
    expect(screen.getByTestId('accuracy-value')).toHaveTextContent('—')
  })

  it('shows "Clear Training Data" button', () => {
    render(<TrainingStats {...defaultProps} />)
    expect(screen.getByRole('button', { name: /clear training data/i })).toBeInTheDocument()
  })

  it('calls onClear when clear button is clicked', () => {
    const onClear = vi.fn()
    render(<TrainingStats {...defaultProps} onClear={onClear} />)
    fireEvent.click(screen.getByRole('button', { name: /clear training data/i }))
    expect(onClear).toHaveBeenCalledOnce()
  })

  it('shows corrections count when stats exist', () => {
    render(
      <TrainingStats
        {...defaultProps}
        stats={{ totalGuesses: 20, correctGuesses: 16, corrections: 9 }}
      />,
    )
    expect(screen.getByText('9')).toBeInTheDocument()
    expect(screen.getByText(/corrections/i)).toBeInTheDocument()
  })
})

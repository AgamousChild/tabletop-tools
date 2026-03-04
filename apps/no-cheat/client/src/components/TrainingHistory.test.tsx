import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('../lib/trpc', () => ({
  trpc: {
    training: {
      list: {
        useQuery: vi.fn().mockReturnValue({
          data: {
            examples: [
              {
                id: 'ex-1',
                userId: 'user-1',
                diceSetId: 'ds-1',
                label: 4,
                guess: 4,
                confidence: 0.9,
                isCorrect: 1,
                imageUrl: 'https://cdn.example.com/training/ex-1.png',
                createdAt: Date.now(),
              },
              {
                id: 'ex-2',
                userId: 'user-1',
                diceSetId: 'ds-1',
                label: 0,
                guess: 3,
                confidence: null,
                isCorrect: 0,
                imageUrl: null,
                createdAt: Date.now(),
              },
            ],
          },
          isLoading: false,
          refetch: vi.fn(),
        }),
      },
      getStats: {
        useQuery: vi.fn().mockReturnValue({
          data: {
            total: 10,
            correct: 7,
            accuracy: 0.7,
            perLabel: { 0: 2, 1: 1, 2: 1, 3: 2, 4: 2, 5: 1, 6: 1 },
          },
        }),
      },
      delete: {
        useMutation: vi.fn().mockReturnValue({ mutate: vi.fn(), isPending: false }),
      },
    },
  },
}))

import { TrainingHistory } from './TrainingHistory'

describe('TrainingHistory', () => {
  const defaultProps = {
    diceSetId: 'ds-1',
    onBack: vi.fn(),
  }

  it('renders Training History heading', () => {
    render(<TrainingHistory {...defaultProps} />)
    expect(screen.getByText('Training History')).toBeInTheDocument()
  })

  it('shows back button', () => {
    const onBack = vi.fn()
    render(<TrainingHistory {...defaultProps} onBack={onBack} />)
    fireEvent.click(screen.getByLabelText('Back'))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('displays stats summary', () => {
    render(<TrainingHistory {...defaultProps} />)
    expect(screen.getByText('10')).toBeInTheDocument() // total
    expect(screen.getByText('70.0%')).toBeInTheDocument() // accuracy
  })

  it('shows training examples', () => {
    render(<TrainingHistory {...defaultProps} />)
    expect(screen.getByText('Label: 4')).toBeInTheDocument()
    expect(screen.getByText('Not a die')).toBeInTheDocument()
  })

  it('shows filter buttons', () => {
    render(<TrainingHistory {...defaultProps} />)
    expect(screen.getByText('My Data')).toBeInTheDocument()
    expect(screen.getByText('All')).toBeInTheDocument()
    expect(screen.getByText('Not dice')).toBeInTheDocument()
  })

  it('has delete buttons for each example', () => {
    render(<TrainingHistory {...defaultProps} />)
    const deleteButtons = screen.getAllByText('×')
    expect(deleteButtons.length).toBe(2)
  })
})

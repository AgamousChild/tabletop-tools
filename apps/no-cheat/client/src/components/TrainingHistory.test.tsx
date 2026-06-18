import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

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
      listFrames: {
        useQuery: vi.fn().mockReturnValue({
          data: {
            frames: [
              {
                id: 'frame-1',
                userId: 'user-1',
                diceSetId: 'ds-1',
                imageUrl: 'https://cdn.example.com/frames/frame-1.png',
                frameWidth: 640,
                frameHeight: 480,
                boxes: [
                  { x: 0.2, y: 0.3, w: 0.1, h: 0.1, label: 4 },
                  { x: 0.6, y: 0.5, w: 0.12, h: 0.12, label: 2 },
                ],
                createdAt: Date.now(),
              },
            ],
          },
          isLoading: false,
          refetch: vi.fn(),
        }),
      },
      deleteFrame: {
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

  it('shows training examples on examples tab', () => {
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

  it('shows tab navigation with Examples and Frames', () => {
    render(<TrainingHistory {...defaultProps} />)
    expect(screen.getByText('Examples')).toBeInTheDocument()
    expect(screen.getByText('Frames (1)')).toBeInTheDocument()
  })

  it('switches to frames tab and shows frame data', () => {
    render(<TrainingHistory {...defaultProps} />)
    fireEvent.click(screen.getByText('Frames (1)'))
    expect(screen.getByText('2 dice')).toBeInTheDocument()
    expect(screen.getByText('[4, 2]')).toBeInTheDocument()
    expect(screen.getByText(/640×480/)).toBeInTheDocument()
  })

  it('shows export button on frames tab', () => {
    render(<TrainingHistory {...defaultProps} />)
    fireEvent.click(screen.getByText('Frames (1)'))
    expect(screen.getByText('Export YOLO Dataset (1 frames)')).toBeInTheDocument()
  })

  it('shows delete button for each frame', () => {
    render(<TrainingHistory {...defaultProps} />)
    fireEvent.click(screen.getByText('Frames (1)'))
    const deleteButtons = screen.getAllByText('×')
    expect(deleteButtons.length).toBe(1)
  })
})

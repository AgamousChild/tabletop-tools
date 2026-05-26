import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../lib/store/trainingStore', () => ({
  getExamples: vi.fn().mockResolvedValue([]),
  addExample: vi.fn().mockResolvedValue('example-id'),
  getStats: vi.fn().mockResolvedValue(null),
  updateStats: vi.fn().mockResolvedValue(undefined),
  clearAll: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../lib/cv/trainedPipeline', () => ({
  createTrainedPipeline: vi.fn(() => ({
    state: { diceSetId: 'test', ready: false, width: 0, height: 0 },
    captureBackground: vi.fn(),
    processFrame: vi.fn().mockReturnValue([]),
    setExamples: vi.fn(),
  })),
}))

vi.mock('../lib/cv/features', () => ({
  extractFeatures: vi.fn().mockReturnValue(Array.from<number>({ length: 12 }).fill(0)),
}))

vi.mock('../lib/cv/knnClassifier', () => ({
  classifyKnn: vi.fn().mockReturnValue(null),
}))

vi.mock('../lib/cv/background', () => ({
  rgbaToGray: vi.fn().mockReturnValue(new Uint8Array(4)),
}))

vi.mock('../lib/trpc', () => ({
  trpc: {
    training: {
      saveExamples: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      list: {
        useQuery: () => ({ data: null, isLoading: false, refetch: vi.fn() }),
      },
      getStats: {
        useQuery: () => ({ data: null }),
      },
      delete: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
  },
}))

import { TrainingScreen } from './TrainingScreen'
import { createTrainedPipeline } from '../lib/cv/trainedPipeline'
import { getExamples, getStats, clearAll } from '../lib/store/trainingStore'

beforeEach(() => {
  vi.clearAllMocks()

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
    getImageData: vi.fn().mockReturnValue({
      data: new Uint8ClampedArray(4),
      width: 1,
      height: 1,
    }),
    putImageData: vi.fn(),
    createImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(64 * 64 * 4) }),
    clearRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D)

  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    value: {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [{ stop: vi.fn() }],
      }),
    },
    writable: true,
    configurable: true,
  })

  // Reset the mock pipeline to default behavior
  ;(createTrainedPipeline as ReturnType<typeof vi.fn>).mockReturnValue({
    state: { diceSetId: 'test', ready: false, width: 0, height: 0 },
    captureBackground: vi.fn(),
    processFrame: vi.fn().mockReturnValue([]),
    setExamples: vi.fn(),
  })
})

const defaultProps = {
  diceSet: { id: 'ds-1', name: 'Red Chessex D6' },
  onBack: vi.fn(),
}

describe('TrainingScreen', () => {
  it('renders dice set name in header', () => {
    render(<TrainingScreen {...defaultProps} />)
    expect(screen.getByText('Red Chessex D6')).toBeInTheDocument()
  })

  it('shows back button that calls onBack', () => {
    const onBack = vi.fn()
    render(<TrainingScreen {...defaultProps} onBack={onBack} />)
    const backBtn = screen.getByLabelText('Back')
    fireEvent.click(backBtn)
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('starts directly in training phase with "Roll dice into the frame"', () => {
    render(<TrainingScreen {...defaultProps} />)
    expect(screen.getByText(/roll dice into the frame/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /capture background/i })).not.toBeInTheDocument()
  })

  it('shows camera feed (video element)', () => {
    render(<TrainingScreen {...defaultProps} />)
    const video = document.querySelector('video')
    expect(video).toBeInTheDocument()
  })

  it('shows TrainingStats component', () => {
    render(<TrainingScreen {...defaultProps} />)
    // TrainingStats always renders "No training data" or stats panel
    expect(screen.getByText(/no training data/i)).toBeInTheDocument()
  })

  it('loads existing examples on mount', async () => {
    render(<TrainingScreen {...defaultProps} />)
    await waitFor(() => {
      expect(getExamples).toHaveBeenCalledWith('ds-1')
    })
  })

  it('loads stats on mount', async () => {
    render(<TrainingScreen {...defaultProps} />)
    await waitFor(() => {
      expect(getStats).toHaveBeenCalledWith('ds-1')
    })
  })

  it('calls clearAll and resets when Clear Training Data is clicked', async () => {
    render(<TrainingScreen {...defaultProps} />)
    await waitFor(() => {
      expect(getExamples).toHaveBeenCalled()
    })
    fireEvent.click(screen.getByRole('button', { name: /clear training data/i }))
    await waitFor(() => {
      expect(clearAll).toHaveBeenCalledWith('ds-1')
    })
  })

  it('shows camera error when getUserMedia fails', async () => {
    navigator.mediaDevices.getUserMedia = vi.fn().mockRejectedValue(new Error('denied'))
    render(<TrainingScreen {...defaultProps} />)
    await waitFor(() => expect(screen.getByText(/camera unavailable/i)).toBeInTheDocument())
  })

  it('creates pipeline with the dice set id', () => {
    render(<TrainingScreen {...defaultProps} />)
    expect(createTrainedPipeline).toHaveBeenCalledWith('ds-1')
  })
})

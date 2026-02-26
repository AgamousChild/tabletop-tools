import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

let startResult: any = null
let startError: any = null

vi.mock('../lib/trpc', () => ({
  trpc: {
    session: {
      start: {
        useMutation: () => ({
          mutate: (
            _args: unknown,
            opts?: { onSuccess?: (r: unknown) => void; onError?: (e: unknown) => void },
          ) => {
            if (startError) {
              opts?.onError?.(startError)
            } else if (startResult) {
              opts?.onSuccess?.(startResult)
            }
          },
          isPending: false,
        }),
      },
      addRoll: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      close: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      savePhoto: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
    },
  },
}))

vi.mock('../lib/cv/pipeline', () => ({
  createPipeline: () => ({
    state: { diceSetId: 'test', backgroundLab: null, clusters: [] },
    captureBackground: vi.fn(),
    processFrame: vi.fn(() => []),
    labelCluster: vi.fn(),
  }),
}))

vi.mock('./Camera', () => ({
  Camera: () => <div data-testid="camera-mock">Camera</div>,
}))

vi.mock('./ResultScreen', () => ({
  ResultScreen: () => <div data-testid="result-mock">Result</div>,
}))

vi.mock('./CalibrationWizard', () => ({
  CalibrationWizard: ({
    onComplete,
  }: {
    onComplete: () => void
  }) => (
    <div data-testid="calibration-wizard">
      <button onClick={onComplete}>Complete Calibration</button>
    </div>
  ),
}))

vi.mock('./StatsOverlay', () => ({
  StatsOverlay: () => <div data-testid="stats-overlay">Stats</div>,
}))

import { ActiveSessionScreen } from './ActiveSessionScreen'

beforeEach(() => {
  startResult = null
  startError = null

  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    value: {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [{ stop: vi.fn() }],
      }),
    },
    writable: true,
    configurable: true,
  })

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
    getImageData: vi.fn().mockReturnValue({
      data: new Uint8ClampedArray(4),
      width: 1,
      height: 1,
    }),
    clearRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    putImageData: vi.fn(),
    createImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(64 * 64 * 4) }),
  } as unknown as CanvasRenderingContext2D)

  // Prevent requestAnimationFrame loop from running in tests
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0)
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
})

describe('ActiveSessionScreen', () => {
  it('shows starting phase initially', () => {
    render(<ActiveSessionScreen diceSet={{ id: 'd1', name: 'Red Dice' }} onDone={vi.fn()} />)
    expect(screen.getByText(/starting session/i)).toBeInTheDocument()
  })

  it('shows calibration wizard after session starts', async () => {
    startResult = { id: 'sess-1' }
    render(<ActiveSessionScreen diceSet={{ id: 'd1', name: 'Red Dice' }} onDone={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByTestId('calibration-wizard')).toBeInTheDocument()
    })
    expect(screen.getByText('Red Dice')).toBeInTheDocument()
    expect(screen.getByText('Calibration')).toBeInTheDocument()
  })

  it('transitions to recording phase after calibration completes', async () => {
    startResult = { id: 'sess-1' }
    render(<ActiveSessionScreen diceSet={{ id: 'd1', name: 'Red Dice' }} onDone={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByTestId('calibration-wizard')).toBeInTheDocument()
    })
    // Click the mock CalibrationWizard's complete button
    screen.getByText('Complete Calibration').click()
    await waitFor(() => {
      expect(screen.getByText(/hands-free/i)).toBeInTheDocument()
    })
    expect(screen.getByTestId('stats-overlay')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /end session/i })).toBeInTheDocument()
  })

  it('shows End Session button disabled when no rolls', async () => {
    startResult = { id: 'sess-1' }
    render(<ActiveSessionScreen diceSet={{ id: 'd1', name: 'Red Dice' }} onDone={vi.fn()} />)
    await waitFor(() => screen.getByTestId('calibration-wizard'))
    screen.getByText('Complete Calibration').click()
    await waitFor(() => screen.getByRole('button', { name: /end session/i }))
    expect(screen.getByRole('button', { name: /end session/i })).toBeDisabled()
  })

  it('shows error state with Back button', async () => {
    startError = { message: 'Session limit reached' }
    render(<ActiveSessionScreen diceSet={{ id: 'd1', name: 'Red Dice' }} onDone={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('Session limit reached')).toBeInTheDocument()
    })
    expect(screen.getByText('← Back')).toBeInTheDocument()
  })

  it('shows dice set name during calibration', async () => {
    startResult = { id: 'sess-1' }
    render(<ActiveSessionScreen diceSet={{ id: 'd1', name: 'Red Dice' }} onDone={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('Red Dice')).toBeInTheDocument()
    })
  })
})

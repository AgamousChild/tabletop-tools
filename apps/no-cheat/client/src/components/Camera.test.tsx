import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Camera } from './Camera'

// vi.hoisted ensures these objects/fns exist before vi.mock's factory runs
const mockPipelineState = vi.hoisted(() => ({
  backgroundLab: null as Uint8Array | null,
  clusters: [] as {
    id: string
    pipValue: number | null
    exemplars: Uint8Array[]
    updatedAt: number
  }[],
}))
const mockCaptureBackground = vi.hoisted(() => vi.fn())
const mockProcessFrame = vi.hoisted(() => vi.fn())
const mockLabelCluster = vi.hoisted(() => vi.fn())

vi.mock('../lib/cv/pipeline', () => ({
  createPipeline: () => ({
    state: mockPipelineState,
    captureBackground: mockCaptureBackground,
    processFrame: mockProcessFrame,
    labelCluster: mockLabelCluster,
  }),
}))

vi.mock('../lib/store/exemplarStore', () => ({
  getClusterSet: vi.fn().mockResolvedValue(null),
  saveClusterSet: vi.fn().mockResolvedValue(undefined),
}))

beforeEach(() => {
  mockPipelineState.backgroundLab = null
  mockPipelineState.clusters = []
  mockCaptureBackground.mockReset()
  mockProcessFrame.mockReset()
  mockLabelCluster.mockReset()
  mockProcessFrame.mockReturnValue([
    { roi: { x: 30, y: 30, width: 45, height: 45 }, clusterId: 'c1', blobCount: 4, normalized: new Uint8Array(64 * 64) },
  ])

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
    getImageData: vi.fn().mockReturnValue({
      data: new Uint8ClampedArray(4),
      width: 1,
      height: 1,
    }),
    putImageData: vi.fn(),
    createImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(64 * 64 * 4) }),
  } as unknown as CanvasRenderingContext2D)

  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
    'data:image/jpeg;base64,abc123',
  )

  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    value: {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [{ stop: vi.fn() }],
      }),
    },
    writable: true,
    configurable: true,
  })
})

function makeStableCluster(id: string) {
  return {
    id,
    pipValue: null as number | null,
    exemplars: [new Uint8Array(64 * 64), new Uint8Array(64 * 64), new Uint8Array(64 * 64)],
    updatedAt: Date.now(),
  }
}

describe('Camera', () => {
  it('renders a calibrate background button before calibration', () => {
    render(<Camera onCapture={() => {}} />)
    expect(screen.getByRole('button', { name: /calibrate background/i })).toBeInTheDocument()
  })

  it('shows the capture button after background is calibrated', async () => {
    render(<Camera onCapture={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /calibrate background/i }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /capture/i })).toBeInTheDocument(),
    )
  })

  it('calls onCapture with the detected pip values when captured and confirmed', async () => {
    const onCapture = vi.fn()
    render(<Camera onCapture={onCapture} />)
    fireEvent.click(screen.getByRole('button', { name: /calibrate background/i }))
    await waitFor(() => screen.getByRole('button', { name: /capture/i }))
    fireEvent.click(screen.getByRole('button', { name: /capture/i }))
    await waitFor(() => screen.getByRole('button', { name: /confirm/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(onCapture).toHaveBeenCalledWith([4])
  })

  it('shows the detected pip value after capture', async () => {
    render(<Camera onCapture={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /calibrate background/i }))
    await waitFor(() => screen.getByRole('button', { name: /capture/i }))
    fireEvent.click(screen.getByRole('button', { name: /capture/i }))
    await waitFor(() => expect(screen.getByText(/1 die detected/i)).toBeInTheDocument())
  })

  it('shows an error if getUserMedia fails', async () => {
    navigator.mediaDevices.getUserMedia = vi.fn().mockRejectedValue(new Error('Permission denied'))
    render(<Camera onCapture={() => {}} />)
    await waitFor(() => expect(screen.getByText(/camera unavailable/i)).toBeInTheDocument())
  })

  it('shows cluster progress after confirming a roll', async () => {
    mockPipelineState.clusters = [
      { id: 'c1', pipValue: null, exemplars: [new Uint8Array(64 * 64)], updatedAt: 0 },
      { id: 'c2', pipValue: null, exemplars: [new Uint8Array(64 * 64)], updatedAt: 0 },
    ]
    render(<Camera onCapture={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /calibrate background/i }))
    await waitFor(() => screen.getByRole('button', { name: /capture/i }))
    fireEvent.click(screen.getByRole('button', { name: /capture/i }))
    await waitFor(() => screen.getByRole('button', { name: /confirm/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    await waitFor(() =>
      expect(screen.getByText(/faces seen: 2 of 6/i)).toBeInTheDocument(),
    )
  })

  it('shows labeling UI after confirming when 6 clusters stabilize', async () => {
    mockPipelineState.clusters = Array.from({ length: 6 }, (_, i) =>
      makeStableCluster(`c${i}`),
    )
    render(<Camera onCapture={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /calibrate background/i }))
    await waitFor(() => screen.getByRole('button', { name: /capture/i }))
    fireEvent.click(screen.getByRole('button', { name: /capture/i }))
    await waitFor(() => screen.getByRole('button', { name: /confirm/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    await waitFor(() => expect(screen.getByText(/label your dice/i)).toBeInTheDocument())
  })

  it('returns to rolling mode and saves to IDB after labeling all clusters', async () => {
    const { saveClusterSet } = await import('../lib/store/exemplarStore')

    mockPipelineState.clusters = Array.from({ length: 6 }, (_, i) =>
      makeStableCluster(`c${i}`),
    )
    render(<Camera onCapture={() => {}} diceSetId="set-1" />)
    fireEvent.click(screen.getByRole('button', { name: /calibrate background/i }))
    await waitFor(() => screen.getByRole('button', { name: /capture/i }))
    fireEvent.click(screen.getByRole('button', { name: /capture/i }))
    await waitFor(() => screen.getByRole('button', { name: /confirm/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    await waitFor(() => screen.getByText(/label your dice/i))

    // Label all 6 clusters (click pip '1' six times, advancing through each)
    for (let i = 0; i < 6; i++) {
      fireEvent.click(screen.getByRole('button', { name: '1' }))
      if (i < 5) {
        await waitFor(() =>
          screen.getByText(new RegExp(`cluster ${i + 2} of 6`, 'i')),
        )
      }
    }

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /capture/i })).toBeInTheDocument(),
    )
    expect(saveClusterSet).toHaveBeenCalledWith('set-1', expect.objectContaining({ clusters: expect.any(Array) }))
  })
})

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Camera } from './Camera'

// vi.hoisted ensures these fns exist before vi.mock's factory runs (mock hoisting order)
const mockCaptureBackground = vi.hoisted(() => vi.fn())
const mockProcessFrame = vi.hoisted(() => vi.fn())

vi.mock('../lib/cv/pipeline', () => ({
  createPipeline: () => ({
    state: { backgroundLab: null, clusters: [] },
    captureBackground: mockCaptureBackground,
    processFrame: mockProcessFrame,
    labelCluster: vi.fn(),
  }),
}))

// jsdom doesn't implement canvas.getContext or toDataURL — provide minimal mocks
beforeEach(() => {
  mockCaptureBackground.mockReset()
  mockProcessFrame.mockReset()
  mockProcessFrame.mockReturnValue([
    { clusterId: 'c1', blobCount: 4, normalized: new Uint8Array(64 * 64) },
  ])

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
    getImageData: vi.fn().mockReturnValue({
      data: new Uint8ClampedArray(4),
      width: 1,
      height: 1,
    }),
    putImageData: vi.fn(),
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
})

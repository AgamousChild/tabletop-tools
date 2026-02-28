import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Camera } from './Camera'

// vi.hoisted ensures these objects/fns exist before vi.mock's factory runs
const mockPipelineState = vi.hoisted(() => ({
  backgroundGray: null as Uint8Array | null,
  bgWidth: 0,
  bgHeight: 0,
}))
const mockCaptureBackground = vi.hoisted(() => vi.fn())
const mockProcessFrame = vi.hoisted(() => vi.fn())

vi.mock('../lib/cv/pipeline', () => ({
  createPipeline: () => ({
    state: mockPipelineState,
    captureBackground: mockCaptureBackground,
    processFrame: mockProcessFrame,
  }),
}))

beforeEach(() => {
  mockPipelineState.backgroundGray = null
  mockPipelineState.bgWidth = 0
  mockPipelineState.bgHeight = 0
  mockCaptureBackground.mockReset()
  mockProcessFrame.mockReset()
  mockProcessFrame.mockReturnValue([
    { roi: { x: 30, y: 30, width: 45, height: 45 }, pipCount: 4 },
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

  it('calls onCapture with detected pip values when captured and confirmed', async () => {
    const onCapture = vi.fn()
    render(<Camera onCapture={onCapture} />)
    fireEvent.click(screen.getByRole('button', { name: /calibrate background/i }))
    await waitFor(() => screen.getByRole('button', { name: /capture/i }))
    fireEvent.click(screen.getByRole('button', { name: /capture/i }))
    await waitFor(() => screen.getByRole('button', { name: /confirm/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(onCapture).toHaveBeenCalledWith([4])
  })

  it('shows the detected die count after capture', async () => {
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

  it('shows retake button after capture', async () => {
    render(<Camera onCapture={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /calibrate background/i }))
    await waitFor(() => screen.getByRole('button', { name: /capture/i }))
    fireEvent.click(screen.getByRole('button', { name: /capture/i }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /retake/i })).toBeInTheDocument(),
    )
  })

  it('retake clears detected values and shows capture again', async () => {
    render(<Camera onCapture={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /calibrate background/i }))
    await waitFor(() => screen.getByRole('button', { name: /capture/i }))
    fireEvent.click(screen.getByRole('button', { name: /capture/i }))
    await waitFor(() => screen.getByRole('button', { name: /retake/i }))
    fireEvent.click(screen.getByRole('button', { name: /retake/i }))
    expect(screen.getByRole('button', { name: /capture/i })).toBeInTheDocument()
  })

  it('allows adjusting pip value up and down', async () => {
    render(<Camera onCapture={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /calibrate background/i }))
    await waitFor(() => screen.getByRole('button', { name: /capture/i }))
    fireEvent.click(screen.getByRole('button', { name: /capture/i }))
    await waitFor(() => screen.getByText('4'))
    // Click up arrow
    const upBtn = screen.getAllByText('\u25B2')[0]!
    fireEvent.click(upBtn)
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('skips calibration in captureOnly mode', () => {
    render(<Camera onCapture={() => {}} captureOnly />)
    expect(screen.getByRole('button', { name: /capture/i })).toBeInTheDocument()
  })
})

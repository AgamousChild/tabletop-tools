import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Camera } from './Camera'

// Mock detectPips so Camera tests don't depend on image processing
vi.mock('../lib/cv/pipReader', () => ({
  detectPips: vi.fn().mockResolvedValue(4),
}))

// jsdom doesn't implement canvas.getContext — provide a minimal mock
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
    getImageData: vi.fn().mockReturnValue({
      data: new Uint8ClampedArray(4),
      width: 1,
      height: 1,
    }),
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
})

describe('Camera', () => {
  it('renders a capture button', () => {
    render(<Camera onCapture={() => {}} />)
    expect(screen.getByRole('button', { name: /capture/i })).toBeInTheDocument()
  })

  it('calls onCapture with the detected pip count when the button is clicked', async () => {
    const onCapture = vi.fn()
    render(<Camera onCapture={onCapture} />)
    fireEvent.click(screen.getByRole('button', { name: /capture/i }))
    await waitFor(() => expect(onCapture).toHaveBeenCalledWith(4))
  })

  it('shows the detected pip value after capture', async () => {
    render(<Camera onCapture={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /capture/i }))
    await waitFor(() => expect(screen.getByText(/detected: 4/i)).toBeInTheDocument())
  })

  it('shows an error if getUserMedia fails', async () => {
    navigator.mediaDevices.getUserMedia = vi.fn().mockRejectedValue(new Error('Permission denied'))
    render(<Camera onCapture={() => {}} />)
    await waitFor(() => expect(screen.getByText(/camera unavailable/i)).toBeInTheDocument())
  })
})

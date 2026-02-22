import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Camera } from './Camera'

// Mock tRPC — Camera calls trpc.vision.readDice.useMutation() to process frames
vi.mock('../lib/trpc', () => ({
  trpc: {
    vision: {
      readDice: {
        useMutation: () => ({
          mutateAsync: vi.fn().mockResolvedValue({ values: [4] }),
        }),
      },
    },
  },
}))

// jsdom doesn't implement canvas.getContext or toDataURL — provide minimal mocks
beforeEach(() => {
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
  it('renders a capture button', () => {
    render(<Camera onCapture={() => {}} />)
    expect(screen.getByRole('button', { name: /capture/i })).toBeInTheDocument()
  })

  it('calls onCapture with the detected pip values when captured and confirmed', async () => {
    const onCapture = vi.fn()
    render(<Camera onCapture={onCapture} />)
    fireEvent.click(screen.getByRole('button', { name: /capture/i }))
    await waitFor(() => screen.getByRole('button', { name: /confirm/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(onCapture).toHaveBeenCalledWith([4])
  })

  it('shows the detected pip value after capture', async () => {
    render(<Camera onCapture={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /capture/i }))
    await waitFor(() => expect(screen.getByText(/1 die detected/i)).toBeInTheDocument())
  })

  it('shows an error if getUserMedia fails', async () => {
    navigator.mediaDevices.getUserMedia = vi.fn().mockRejectedValue(new Error('Permission denied'))
    render(<Camera onCapture={() => {}} />)
    await waitFor(() => expect(screen.getByText(/camera unavailable/i)).toBeInTheDocument())
  })
})

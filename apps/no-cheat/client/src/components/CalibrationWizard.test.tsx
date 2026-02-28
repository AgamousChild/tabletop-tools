import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { Pipeline, PipelineState } from '../lib/cv/pipeline'
import { CalibrationWizard } from './CalibrationWizard'

function createMockPipeline(): Pipeline {
  const state: PipelineState = {
    diceSetId: 'test-set',
    backgroundGray: null,
    bgWidth: 0,
    bgHeight: 0,
  }

  return {
    state,
    captureBackground: vi.fn(() => {
      state.backgroundGray = new Uint8Array(100)
      state.bgWidth = 10
      state.bgHeight = 10
    }),
    processFrame: vi.fn(() => [
      {
        roi: { x: 10, y: 10, width: 40, height: 40 },
        pipCount: 3,
      },
    ]),
  }
}

beforeEach(() => {
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

describe('CalibrationWizard', () => {
  it('starts on step 1 with Capture Background button', () => {
    render(
      <CalibrationWizard pipeline={createMockPipeline()} diceSetId="d1" onComplete={vi.fn()} />,
    )
    expect(screen.getByText('Step 1: Capture Background')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /capture background/i })).toBeInTheDocument()
  })

  it('advances to step 2 (test roll) after capturing background', async () => {
    render(
      <CalibrationWizard pipeline={createMockPipeline()} diceSetId="d1" onComplete={vi.fn()} />,
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /capture background/i })).not.toBeDisabled(),
    )
    fireEvent.click(screen.getByRole('button', { name: /capture background/i }))
    expect(screen.getByText('Step 2: Test Roll')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /capture test roll/i })).toBeInTheDocument()
  })

  it('shows detection results after test roll', async () => {
    render(
      <CalibrationWizard pipeline={createMockPipeline()} diceSetId="d1" onComplete={vi.fn()} />,
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /capture background/i })).not.toBeDisabled(),
    )
    fireEvent.click(screen.getByRole('button', { name: /capture background/i }))
    fireEvent.click(screen.getByRole('button', { name: /capture test roll/i }))
    expect(screen.getByText(/detected 1 die/i)).toBeInTheDocument()
    expect(screen.getByText(/does this look correct/i)).toBeInTheDocument()
  })

  it('shows error when no dice detected on test roll', async () => {
    const pipeline = createMockPipeline()
    ;(pipeline.processFrame as ReturnType<typeof vi.fn>).mockReturnValue([])

    render(<CalibrationWizard pipeline={pipeline} diceSetId="d1" onComplete={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /capture background/i })).not.toBeDisabled(),
    )
    fireEvent.click(screen.getByRole('button', { name: /capture background/i }))
    fireEvent.click(screen.getByRole('button', { name: /capture test roll/i }))
    expect(screen.getByText(/no dice detected/i)).toBeInTheDocument()
  })

  it('calls onComplete when Start Recording is clicked', async () => {
    const onComplete = vi.fn()
    render(
      <CalibrationWizard pipeline={createMockPipeline()} diceSetId="d1" onComplete={onComplete} />,
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /capture background/i })).not.toBeDisabled(),
    )
    fireEvent.click(screen.getByRole('button', { name: /capture background/i }))
    fireEvent.click(screen.getByRole('button', { name: /capture test roll/i }))
    fireEvent.click(screen.getByRole('button', { name: /start recording/i }))
    expect(onComplete).toHaveBeenCalledOnce()
  })

  it('has Recalibrate button that resets to step 1', async () => {
    render(
      <CalibrationWizard pipeline={createMockPipeline()} diceSetId="d1" onComplete={vi.fn()} />,
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /capture background/i })).not.toBeDisabled(),
    )
    fireEvent.click(screen.getByRole('button', { name: /capture background/i }))
    fireEvent.click(screen.getByRole('button', { name: /capture test roll/i }))
    fireEvent.click(screen.getByRole('button', { name: /recalibrate/i }))
    expect(screen.getByText('Step 1: Capture Background')).toBeInTheDocument()
  })

  it('shows step indicators with 2 steps', () => {
    render(
      <CalibrationWizard pipeline={createMockPipeline()} diceSetId="d1" onComplete={vi.fn()} />,
    )
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('shows camera error when getUserMedia fails', async () => {
    navigator.mediaDevices.getUserMedia = vi.fn().mockRejectedValue(new Error('denied'))
    render(
      <CalibrationWizard pipeline={createMockPipeline()} diceSetId="d1" onComplete={vi.fn()} />,
    )
    await waitFor(() => expect(screen.getByText(/camera unavailable/i)).toBeInTheDocument())
  })

  it('shows Retest button after successful test roll', async () => {
    render(
      <CalibrationWizard pipeline={createMockPipeline()} diceSetId="d1" onComplete={vi.fn()} />,
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /capture background/i })).not.toBeDisabled(),
    )
    fireEvent.click(screen.getByRole('button', { name: /capture background/i }))
    fireEvent.click(screen.getByRole('button', { name: /capture test roll/i }))
    expect(screen.getByRole('button', { name: /retest/i })).toBeInTheDocument()
  })
})

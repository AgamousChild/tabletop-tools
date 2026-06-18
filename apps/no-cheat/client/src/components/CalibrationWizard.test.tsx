import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Pipeline, PipelineState } from '../lib/cv/pipeline'
import { CalibrationWizard } from './CalibrationWizard'

function createMockPipeline(): Pipeline {
  const state: PipelineState = {
    diceSetId: 'test-set',
    ready: false,
    width: 0,
    height: 0,
  }

  return {
    state,
    captureBackground: vi.fn(() => {
      state.ready = true
      state.width = 10
      state.height = 10
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
  it('starts with Test Roll heading and Capture Test Roll button', async () => {
    render(
      <CalibrationWizard pipeline={createMockPipeline()} diceSetId="d1" onComplete={vi.fn()} />,
    )
    expect(screen.getByText('Test Roll')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /capture test roll/i })).not.toBeDisabled(),
    )
  })

  it('auto-calls captureBackground on mount when camera is ready', async () => {
    const pipeline = createMockPipeline()
    render(<CalibrationWizard pipeline={pipeline} diceSetId="d1" onComplete={vi.fn()} />)
    await waitFor(() => expect(pipeline.captureBackground).toHaveBeenCalled())
  })

  it('shows detection results after test roll', async () => {
    render(
      <CalibrationWizard pipeline={createMockPipeline()} diceSetId="d1" onComplete={vi.fn()} />,
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /capture test roll/i })).not.toBeDisabled(),
    )
    fireEvent.click(screen.getByRole('button', { name: /capture test roll/i }))
    expect(screen.getByText(/detected 1 die/i)).toBeInTheDocument()
    expect(screen.getByText(/does this look correct/i)).toBeInTheDocument()
  })

  it('shows error when no dice detected on test roll', async () => {
    const pipeline = createMockPipeline()
    ;(pipeline.processFrame as ReturnType<typeof vi.fn>).mockReturnValue([])

    render(<CalibrationWizard pipeline={pipeline} diceSetId="d1" onComplete={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /capture test roll/i })).not.toBeDisabled(),
    )
    fireEvent.click(screen.getByRole('button', { name: /capture test roll/i }))
    expect(screen.getByText(/no dice detected/i)).toBeInTheDocument()
  })

  it('calls onComplete when Start Recording is clicked', async () => {
    const onComplete = vi.fn()
    render(
      <CalibrationWizard pipeline={createMockPipeline()} diceSetId="d1" onComplete={onComplete} />,
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /capture test roll/i })).not.toBeDisabled(),
    )
    fireEvent.click(screen.getByRole('button', { name: /capture test roll/i }))
    fireEvent.click(screen.getByRole('button', { name: /start recording/i }))
    expect(onComplete).toHaveBeenCalledOnce()
  })

  it('Recalibrate button resets to test roll with no results', async () => {
    render(
      <CalibrationWizard pipeline={createMockPipeline()} diceSetId="d1" onComplete={vi.fn()} />,
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /capture test roll/i })).not.toBeDisabled(),
    )
    fireEvent.click(screen.getByRole('button', { name: /capture test roll/i }))
    fireEvent.click(screen.getByRole('button', { name: /recalibrate/i }))
    expect(screen.getByRole('button', { name: /capture test roll/i })).toBeInTheDocument()
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
      expect(screen.getByRole('button', { name: /capture test roll/i })).not.toBeDisabled(),
    )
    fireEvent.click(screen.getByRole('button', { name: /capture test roll/i }))
    expect(screen.getByRole('button', { name: /retest/i })).toBeInTheDocument()
  })
})

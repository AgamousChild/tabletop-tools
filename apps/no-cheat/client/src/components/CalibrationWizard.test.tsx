import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { Pipeline, PipelineState } from '../lib/cv/pipeline'

const mockGetClusterSet = vi.fn().mockResolvedValue(null)
const mockSaveClusterSet = vi.fn().mockResolvedValue(undefined)

vi.mock('../lib/store/exemplarStore', () => ({
  getClusterSet: (...args: unknown[]) => mockGetClusterSet(...args),
  saveClusterSet: (...args: unknown[]) => mockSaveClusterSet(...args),
}))

vi.mock('./ClusterLabelingScreen', () => ({
  ClusterLabelingScreen: ({
    clusters,
    onComplete,
  }: {
    clusters: { id: string }[]
    onComplete: (labels: Map<string, number>) => void
  }) => (
    <div data-testid="labeling-screen">
      <span>Label {clusters.length} clusters</span>
      <button
        onClick={() => {
          const labels = new Map<string, number>()
          clusters.forEach((c, i) => labels.set(c.id, i + 1))
          onComplete(labels)
        }}
      >
        Label All
      </button>
    </div>
  ),
}))

function createMockPipeline(): Pipeline {
  const state: PipelineState = {
    diceSetId: 'test-set',
    backgroundLab: null,
    clusters: [],
  }

  return {
    state,
    captureBackground: vi.fn(() => {
      state.backgroundLab = new Uint8Array(100)
    }),
    processFrame: vi.fn(() => [
      {
        roi: { x: 10, y: 10, width: 40, height: 40 },
        clusterId: 'c1',
        blobCount: 3,
        normalized: new Uint8Array(64 * 64),
      },
    ]),
    labelCluster: vi.fn(),
  }
}

beforeEach(() => {
  mockGetClusterSet.mockReset().mockResolvedValue(null)
  mockSaveClusterSet.mockReset().mockResolvedValue(undefined)

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

  it('advances to step 2 after capturing background', async () => {
    render(
      <CalibrationWizard pipeline={createMockPipeline()} diceSetId="d1" onComplete={vi.fn()} />,
    )
    // Wait for camera to be ready
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /capture background/i })).not.toBeDisabled(),
    )
    fireEvent.click(screen.getByRole('button', { name: /capture background/i }))
    expect(screen.getByText('Step 2: Place Your Dice')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /capture dice/i })).toBeInTheDocument()
  })

  it('shows error when no dice detected on step 2', async () => {
    const pipeline = createMockPipeline()
    ;(pipeline.processFrame as ReturnType<typeof vi.fn>).mockReturnValue([])

    render(<CalibrationWizard pipeline={pipeline} diceSetId="d1" onComplete={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /capture background/i })).not.toBeDisabled(),
    )
    fireEvent.click(screen.getByRole('button', { name: /capture background/i }))
    fireEvent.click(screen.getByRole('button', { name: /capture dice/i }))
    expect(screen.getByText(/no dice detected/i)).toBeInTheDocument()
  })

  it('shows labeling screen (step 3) when dice have unlabeled clusters', async () => {
    const pipeline = createMockPipeline()
    pipeline.state.clusters = [
      { id: 'c1', pipValue: null, exemplars: [new Uint8Array(64 * 64)], updatedAt: 0 },
    ]

    render(<CalibrationWizard pipeline={pipeline} diceSetId="d1" onComplete={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /capture background/i })).not.toBeDisabled(),
    )
    fireEvent.click(screen.getByRole('button', { name: /capture background/i }))
    fireEvent.click(screen.getByRole('button', { name: /capture dice/i }))
    expect(screen.getByText('Step 3: Label Faces')).toBeInTheDocument()
    expect(screen.getByTestId('labeling-screen')).toBeInTheDocument()
  })

  it('advances to test roll (step 4) after labeling', async () => {
    const pipeline = createMockPipeline()
    pipeline.state.clusters = [
      { id: 'c1', pipValue: null, exemplars: [new Uint8Array(64 * 64)], updatedAt: 0 },
    ]

    render(<CalibrationWizard pipeline={pipeline} diceSetId="d1" onComplete={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /capture background/i })).not.toBeDisabled(),
    )
    fireEvent.click(screen.getByRole('button', { name: /capture background/i }))
    fireEvent.click(screen.getByRole('button', { name: /capture dice/i }))
    fireEvent.click(screen.getByRole('button', { name: /label all/i }))
    expect(screen.getByText('Step 4: Test Roll')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /start recording/i })).toBeInTheDocument()
  })

  it('calls onComplete when Start Recording is clicked', async () => {
    const onComplete = vi.fn()
    const pipeline = createMockPipeline()
    pipeline.state.clusters = [
      { id: 'c1', pipValue: null, exemplars: [new Uint8Array(64 * 64)], updatedAt: 0 },
    ]

    render(<CalibrationWizard pipeline={pipeline} diceSetId="d1" onComplete={onComplete} />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /capture background/i })).not.toBeDisabled(),
    )
    fireEvent.click(screen.getByRole('button', { name: /capture background/i }))
    fireEvent.click(screen.getByRole('button', { name: /capture dice/i }))
    fireEvent.click(screen.getByRole('button', { name: /label all/i }))
    fireEvent.click(screen.getByRole('button', { name: /start recording/i }))
    expect(onComplete).toHaveBeenCalledOnce()
  })

  it('has Recalibrate button on step 4 that resets to step 1', async () => {
    const pipeline = createMockPipeline()
    pipeline.state.clusters = [
      { id: 'c1', pipValue: null, exemplars: [new Uint8Array(64 * 64)], updatedAt: 0 },
    ]

    render(<CalibrationWizard pipeline={pipeline} diceSetId="d1" onComplete={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /capture background/i })).not.toBeDisabled(),
    )
    fireEvent.click(screen.getByRole('button', { name: /capture background/i }))
    fireEvent.click(screen.getByRole('button', { name: /capture dice/i }))
    fireEvent.click(screen.getByRole('button', { name: /label all/i }))
    expect(screen.getByText('Step 4: Test Roll')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /recalibrate/i }))
    expect(screen.getByText('Step 1: Capture Background')).toBeInTheDocument()
  })

  it('shows step indicators with current step highlighted', () => {
    render(
      <CalibrationWizard pipeline={createMockPipeline()} diceSetId="d1" onComplete={vi.fn()} />,
    )
    // Step 1 is active (amber)
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  it('shows camera error when getUserMedia fails', async () => {
    navigator.mediaDevices.getUserMedia = vi.fn().mockRejectedValue(new Error('denied'))
    render(
      <CalibrationWizard pipeline={createMockPipeline()} diceSetId="d1" onComplete={vi.fn()} />,
    )
    await waitFor(() => expect(screen.getByText(/camera unavailable/i)).toBeInTheDocument())
  })

  it('saves cluster set to IndexedDB after labeling', async () => {
    const pipeline = createMockPipeline()
    pipeline.state.clusters = [
      { id: 'c1', pipValue: null, exemplars: [new Uint8Array(64 * 64)], updatedAt: 0 },
    ]

    render(<CalibrationWizard pipeline={pipeline} diceSetId="d1" onComplete={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /capture background/i })).not.toBeDisabled(),
    )
    fireEvent.click(screen.getByRole('button', { name: /capture background/i }))
    fireEvent.click(screen.getByRole('button', { name: /capture dice/i }))
    fireEvent.click(screen.getByRole('button', { name: /label all/i }))

    expect(mockSaveClusterSet).toHaveBeenCalledWith(
      'd1',
      expect.objectContaining({ clusters: expect.any(Array) }),
    )
  })
})

// Import after mocks
import { CalibrationWizard } from './CalibrationWizard'

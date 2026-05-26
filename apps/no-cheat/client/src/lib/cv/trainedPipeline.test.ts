import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Pipeline, RoiResult, PipelineState, PipelineConfig } from './pipeline'
import type { TrainingExample } from './knnClassifier'

// Mock the dependencies
vi.mock('./pipeline', () => ({
  createPipeline: vi.fn(),
}))

vi.mock('./features', () => ({
  extractFeatures: vi.fn(),
}))

vi.mock('./knnClassifier', () => ({
  classifyKnn: vi.fn(),
}))

vi.mock('./background', () => ({
  rgbaToGray: vi.fn(),
}))

import { createPipeline } from './pipeline'
import { extractFeatures } from './features'
import { classifyKnn } from './knnClassifier'
import { rgbaToGray } from './background'
import { createTrainedPipeline } from './trainedPipeline'

const W = 100
const H = 100

function makeMockPipeline(): Pipeline {
  const state: PipelineState = {
    diceSetId: 'test-set',
    ready: false,
    width: 0,
    height: 0,
  }
  const config: PipelineConfig = { contrast: 10, centerCrop: 0.15 }
  return {
    state,
    config,
    captureBackground: vi.fn(),
    processFrame: vi.fn().mockReturnValue([]),
    setConfig: vi.fn(),
  }
}

function makeRoiResult(x: number, y: number, w: number, h: number, pipCount: number | null): RoiResult {
  return { roi: { x, y, width: w, height: h }, pipCount }
}

describe('trainedPipeline', () => {
  let mockPipeline: Pipeline

  beforeEach(() => {
    vi.clearAllMocks()
    mockPipeline = makeMockPipeline()
    vi.mocked(createPipeline).mockReturnValue(mockPipeline)
    // Default: rgbaToGray returns a gray buffer of correct size
    vi.mocked(rgbaToGray).mockImplementation((_rgba, w, h) => new Uint8Array(w * h))
  })

  it('creates a base pipeline with the given diceSetId', () => {
    createTrainedPipeline('my-dice-set')
    expect(createPipeline).toHaveBeenCalledWith('my-dice-set', undefined)
  })

  it('exposes the base pipeline state', () => {
    const trained = createTrainedPipeline('set-1')
    expect(trained.state).toBe(mockPipeline.state)
  })

  it('delegates captureBackground to the base pipeline', () => {
    const trained = createTrainedPipeline('set-1')
    const rgba = new Uint8ClampedArray(W * H * 4)
    trained.captureBackground(rgba, W, H)
    expect(mockPipeline.captureBackground).toHaveBeenCalledWith(rgba, W, H)
  })

  it('falls back to base pipeline when no training examples provided', () => {
    const baseResults = [makeRoiResult(10, 10, 30, 30, 3)]
    vi.mocked(mockPipeline.processFrame).mockReturnValue(baseResults)

    const trained = createTrainedPipeline('set-1')
    const rgba = new Uint8ClampedArray(W * H * 4)
    const results = trained.processFrame(rgba, W, H)

    // No examples => classifyKnn returns null => falls back to base pipCount
    expect(results).toHaveLength(1)
    expect(results[0]!.pipCount).toBe(3)
    expect(results[0]!.roi).toEqual(baseResults[0]!.roi)
  })

  it('returns same ROI bounding boxes as base pipeline', () => {
    const baseResults = [
      makeRoiResult(5, 10, 20, 25, 2),
      makeRoiResult(60, 70, 15, 18, 5),
    ]
    vi.mocked(mockPipeline.processFrame).mockReturnValue(baseResults)
    vi.mocked(classifyKnn).mockReturnValue(null)

    const trained = createTrainedPipeline('set-1')
    const rgba = new Uint8ClampedArray(W * H * 4)
    const results = trained.processFrame(rgba, W, H)

    expect(results).toHaveLength(2)
    expect(results[0]!.roi).toEqual({ x: 5, y: 10, width: 20, height: 25 })
    expect(results[1]!.roi).toEqual({ x: 60, y: 70, width: 15, height: 18 })
  })

  it('uses k-NN label when confidence exceeds threshold (default 0.6)', () => {
    const baseResults = [makeRoiResult(10, 10, 30, 30, 3)]
    vi.mocked(mockPipeline.processFrame).mockReturnValue(baseResults)
    vi.mocked(extractFeatures).mockReturnValue([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    vi.mocked(classifyKnn).mockReturnValue({ label: 5, confidence: 0.8 })

    const trained = createTrainedPipeline('set-1')
    const examples: TrainingExample[] = [
      { features: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], label: 5 },
    ]
    trained.setExamples(examples)

    const rgba = new Uint8ClampedArray(W * H * 4)
    const results = trained.processFrame(rgba, W, H)

    expect(results).toHaveLength(1)
    expect(results[0]!.pipCount).toBe(5) // k-NN override, not base pipCount of 3
  })

  it('falls back to detectPips when k-NN confidence is too low', () => {
    const baseResults = [makeRoiResult(10, 10, 30, 30, 4)]
    vi.mocked(mockPipeline.processFrame).mockReturnValue(baseResults)
    vi.mocked(extractFeatures).mockReturnValue([1, 2, 3])
    vi.mocked(classifyKnn).mockReturnValue({ label: 2, confidence: 0.4 })

    const trained = createTrainedPipeline('set-1')
    trained.setExamples([{ features: [1, 2, 3], label: 2 }])

    const rgba = new Uint8ClampedArray(W * H * 4)
    const results = trained.processFrame(rgba, W, H)

    expect(results).toHaveLength(1)
    expect(results[0]!.pipCount).toBe(4) // base pipCount preserved (k-NN confidence too low)
  })

  it('falls back to detectPips when k-NN returns null (no examples)', () => {
    const baseResults = [makeRoiResult(10, 10, 30, 30, 6)]
    vi.mocked(mockPipeline.processFrame).mockReturnValue(baseResults)
    vi.mocked(classifyKnn).mockReturnValue(null)

    const trained = createTrainedPipeline('set-1')
    // No setExamples called — empty by default

    const rgba = new Uint8ClampedArray(W * H * 4)
    const results = trained.processFrame(rgba, W, H)

    expect(results).toHaveLength(1)
    expect(results[0]!.pipCount).toBe(6) // base pipCount preserved
  })

  it('can update training examples after creation (setExamples)', () => {
    const baseResults = [makeRoiResult(10, 10, 30, 30, 2)]
    vi.mocked(mockPipeline.processFrame).mockReturnValue(baseResults)
    vi.mocked(extractFeatures).mockReturnValue([1, 2, 3])

    const trained = createTrainedPipeline('set-1')

    // Initially no examples — classifyKnn returns null
    vi.mocked(classifyKnn).mockReturnValue(null)
    const rgba = new Uint8ClampedArray(W * H * 4)
    let results = trained.processFrame(rgba, W, H)
    expect(results[0]!.pipCount).toBe(2) // base fallback

    // Now add examples — classifyKnn returns high confidence
    const examples: TrainingExample[] = [
      { features: [1, 2, 3], label: 4 },
      { features: [1, 2, 4], label: 4 },
      { features: [1, 2, 5], label: 4 },
    ]
    trained.setExamples(examples)
    vi.mocked(classifyKnn).mockReturnValue({ label: 4, confidence: 1.0 })

    results = trained.processFrame(rgba, W, H)
    expect(results[0]!.pipCount).toBe(4) // k-NN override after setExamples
  })

  it('supports custom confidence threshold', () => {
    const baseResults = [makeRoiResult(10, 10, 30, 30, 3)]
    vi.mocked(mockPipeline.processFrame).mockReturnValue(baseResults)
    vi.mocked(extractFeatures).mockReturnValue([1, 2, 3])

    // With threshold 0.9, a confidence of 0.8 should NOT be enough
    const trained = createTrainedPipeline('set-1', { confidenceThreshold: 0.9 })
    trained.setExamples([{ features: [1, 2, 3], label: 5 }])
    vi.mocked(classifyKnn).mockReturnValue({ label: 5, confidence: 0.8 })

    const rgba = new Uint8ClampedArray(W * H * 4)
    const results = trained.processFrame(rgba, W, H)

    expect(results[0]!.pipCount).toBe(3) // base pipCount, because 0.8 < 0.9 threshold
  })

  it('uses k-NN when confidence exactly equals threshold', () => {
    const baseResults = [makeRoiResult(10, 10, 30, 30, 1)]
    vi.mocked(mockPipeline.processFrame).mockReturnValue(baseResults)
    vi.mocked(extractFeatures).mockReturnValue([1, 2, 3])
    vi.mocked(classifyKnn).mockReturnValue({ label: 6, confidence: 0.6 })

    const trained = createTrainedPipeline('set-1') // default threshold 0.6
    trained.setExamples([{ features: [1, 2, 3], label: 6 }])

    const rgba = new Uint8ClampedArray(W * H * 4)
    const results = trained.processFrame(rgba, W, H)

    expect(results[0]!.pipCount).toBe(6) // confidence == threshold => use k-NN
  })

  it('passes the stored examples to classifyKnn', () => {
    const baseResults = [makeRoiResult(10, 10, 30, 30, 1)]
    vi.mocked(mockPipeline.processFrame).mockReturnValue(baseResults)
    vi.mocked(extractFeatures).mockReturnValue([5, 6, 7])
    vi.mocked(classifyKnn).mockReturnValue({ label: 3, confidence: 0.9 })

    const examples: TrainingExample[] = [
      { features: [1, 2, 3], label: 3 },
      { features: [4, 5, 6], label: 3 },
    ]

    const trained = createTrainedPipeline('set-1')
    trained.setExamples(examples)

    const rgba = new Uint8ClampedArray(W * H * 4)
    trained.processFrame(rgba, W, H)

    expect(classifyKnn).toHaveBeenCalledWith([5, 6, 7], examples)
  })

  it('extracts features from grayscale sub-image of each ROI', () => {
    const baseResults = [makeRoiResult(10, 20, 30, 25, 2)]
    vi.mocked(mockPipeline.processFrame).mockReturnValue(baseResults)
    vi.mocked(classifyKnn).mockReturnValue(null)

    // rgbaToGray returns a buffer we can verify sub-image extraction from
    const grayBuf = new Uint8Array(W * H)
    for (let i = 0; i < grayBuf.length; i++) grayBuf[i] = i % 256
    vi.mocked(rgbaToGray).mockReturnValue(grayBuf)

    const trained = createTrainedPipeline('set-1')
    trained.setExamples([{ features: [1], label: 1 }])

    const rgba = new Uint8ClampedArray(W * H * 4)
    trained.processFrame(rgba, W, H)

    // extractFeatures should have been called with a sub-image of size 30x25
    expect(extractFeatures).toHaveBeenCalledTimes(1)
    const callArgs = vi.mocked(extractFeatures).mock.calls[0]!
    expect(callArgs[1]).toBe(30) // width
    expect(callArgs[2]).toBe(25) // height
    // The sub-image should be 30*25 = 750 pixels
    expect(callArgs[0]).toHaveLength(30 * 25)
  })

  it('calls rgbaToGray with the frame to produce grayscale for sub-image extraction', () => {
    const baseResults = [makeRoiResult(10, 10, 20, 20, 1)]
    vi.mocked(mockPipeline.processFrame).mockReturnValue(baseResults)
    vi.mocked(classifyKnn).mockReturnValue(null)

    const trained = createTrainedPipeline('set-1')
    trained.setExamples([{ features: [1], label: 1 }])

    const rgba = new Uint8ClampedArray(W * H * 4)
    trained.processFrame(rgba, W, H)

    expect(rgbaToGray).toHaveBeenCalledWith(rgba, W, H)
  })

  it('handles multiple ROIs — applies k-NN independently to each', () => {
    const baseResults = [
      makeRoiResult(5, 5, 20, 20, 1),
      makeRoiResult(60, 60, 20, 20, 2),
    ]
    vi.mocked(mockPipeline.processFrame).mockReturnValue(baseResults)

    // First ROI: k-NN confident => override
    // Second ROI: k-NN not confident => keep base
    vi.mocked(extractFeatures)
      .mockReturnValueOnce([1, 0, 0])
      .mockReturnValueOnce([0, 1, 0])
    vi.mocked(classifyKnn)
      .mockReturnValueOnce({ label: 4, confidence: 0.9 })
      .mockReturnValueOnce({ label: 3, confidence: 0.3 })

    const trained = createTrainedPipeline('set-1')
    trained.setExamples([{ features: [1, 0, 0], label: 4 }])

    const rgba = new Uint8ClampedArray(W * H * 4)
    const results = trained.processFrame(rgba, W, H)

    expect(results).toHaveLength(2)
    expect(results[0]!.pipCount).toBe(4) // k-NN override
    expect(results[1]!.pipCount).toBe(2) // base fallback (low confidence)
  })

  it('returns empty array when base pipeline returns empty', () => {
    vi.mocked(mockPipeline.processFrame).mockReturnValue([])

    const trained = createTrainedPipeline('set-1')
    const rgba = new Uint8ClampedArray(W * H * 4)
    const results = trained.processFrame(rgba, W, H)

    expect(results).toHaveLength(0)
    expect(extractFeatures).not.toHaveBeenCalled()
    expect(classifyKnn).not.toHaveBeenCalled()
  })

  it('does not call extractFeatures or classifyKnn when no examples set', () => {
    const baseResults = [makeRoiResult(10, 10, 30, 30, 3)]
    vi.mocked(mockPipeline.processFrame).mockReturnValue(baseResults)

    const trained = createTrainedPipeline('set-1')
    // No setExamples called

    const rgba = new Uint8ClampedArray(W * H * 4)
    trained.processFrame(rgba, W, H)

    expect(extractFeatures).not.toHaveBeenCalled()
    expect(classifyKnn).not.toHaveBeenCalled()
  })
})

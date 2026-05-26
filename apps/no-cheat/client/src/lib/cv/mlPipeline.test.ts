import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockSession = {
  inputNames: ['images'],
  outputNames: ['output0'],
  run: vi.fn(),
  release: vi.fn(),
}

// Mock onnxruntime-web
vi.mock('onnxruntime-web', () => ({
  env: { wasm: { numThreads: 1, simd: true } },
  InferenceSession: {
    create: vi.fn().mockResolvedValue(mockSession),
  },
  Tensor: vi.fn().mockImplementation((type: string, data: unknown, dims: number[]) => ({ type, data, dims })),
}))

import { createMlPipeline } from './mlPipeline'

describe('mlPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('starts not ready', () => {
    const ml = createMlPipeline('/test-model.onnx')
    expect(ml.ready).toBe(false)
  })

  it('becomes ready after load()', async () => {
    const ml = createMlPipeline('/test-model.onnx')
    await ml.load()
    expect(ml.ready).toBe(true)
  })

  it('returns empty results when not loaded', async () => {
    const ml = createMlPipeline('/test-model.onnx')
    const rgba = new Uint8ClampedArray(100 * 100 * 4)
    const results = await ml.detect(rgba, 100, 100)
    expect(results).toEqual([])
  })

  it('runs inference and returns detections', async () => {
    const ml = createMlPipeline('/test-model.onnx')
    await ml.load()

    // Simulate YOLOv8 output: [1, 10, 2] (10 = 4 box + 6 classes, 2 detections)
    const numDetections = 2
    const numAttrs = 10 // 4 box coords + 6 classes
    const outputData = new Float32Array(numAttrs * numDetections)

    // Detection 0: cx=320, cy=240, w=100, h=100, class 3 (pip 4) with conf 0.85
    outputData[0] = 320  // cx
    outputData[1 * numDetections + 0] = 240  // cy
    outputData[2 * numDetections + 0] = 100  // w
    outputData[3 * numDetections + 0] = 100  // h
    outputData[(4 + 3) * numDetections + 0] = 0.85 // class 3

    // Detection 1: low confidence — should be filtered out
    outputData[1] = 100
    outputData[1 * numDetections + 1] = 100
    outputData[2 * numDetections + 1] = 50
    outputData[3 * numDetections + 1] = 50
    outputData[(4 + 0) * numDetections + 1] = 0.1 // class 0, low conf

    mockSession.run.mockResolvedValue({
      output0: {
        data: outputData,
        dims: [1, numAttrs, numDetections],
      },
    })

    const rgba = new Uint8ClampedArray(640 * 480 * 4)
    const results = await ml.detect(rgba, 640, 480)

    // Should get 1 detection (second was below confidence threshold)
    expect(results).toHaveLength(1)
    expect(results[0]!.pipCount).toBe(4) // classId 3 → pip 4
    expect(results[0]!.roi.cx).toBeDefined()
    expect(results[0]!.roi.width).toBeGreaterThan(0)
  })

  it('dispose releases session and marks not ready', async () => {
    const ml = createMlPipeline('/test-model.onnx')
    await ml.load()
    expect(ml.ready).toBe(true)

    ml.dispose()
    expect(ml.ready).toBe(false)
  })

  it('maps classId to pipCount correctly (class 0 → pip 1, class 5 → pip 6)', async () => {
    const ml = createMlPipeline('/test-model.onnx')
    await ml.load()

    // Single detection: class 5 (pip 6) with high confidence
    const numDetections = 1
    const numAttrs = 10
    const outputData = new Float32Array(numAttrs * numDetections)
    outputData[0] = 320  // cx
    outputData[1] = 240  // cy
    outputData[2] = 80   // w
    outputData[3] = 80   // h
    outputData[4 + 5] = 0.95 // class 5

    mockSession.run.mockResolvedValue({
      output0: {
        data: outputData,
        dims: [1, numAttrs, numDetections],
      },
    })

    const rgba = new Uint8ClampedArray(640 * 480 * 4)
    const results = await ml.detect(rgba, 640, 480)
    expect(results).toHaveLength(1)
    expect(results[0]!.pipCount).toBe(6) // class 5 → pip 6
  })
})

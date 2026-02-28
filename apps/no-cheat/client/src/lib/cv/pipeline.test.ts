import { describe, expect, it } from 'vitest'

import { createPipeline } from './pipeline'

const W = 128
const H = 128

/**
 * Build a synthetic RGBA ImageData-like buffer.
 * Background is gray (100, 100, 100). Each die face is a white square at (x,y,size)
 * with pip circles (dark dots on white surface).
 */
function makeRgbaBuffer(
  width: number,
  height: number,
  dieFaces: { x: number; y: number; size: number; pips: [number, number][] }[],
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4)

  // Fill with mid-gray background
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = 100
    data[i * 4 + 1] = 100
    data[i * 4 + 2] = 100
    data[i * 4 + 3] = 255
  }

  // Paint die faces: white square with pip circles
  for (const { x, y, size, pips } of dieFaces) {
    for (let row = y; row < y + size; row++) {
      for (let col = x; col < x + size; col++) {
        if (row >= 0 && row < height && col >= 0 && col < width) {
          data[(row * width + col) * 4] = 230
          data[(row * width + col) * 4 + 1] = 230
          data[(row * width + col) * 4 + 2] = 230
          data[(row * width + col) * 4 + 3] = 255
        }
      }
    }
    // Pip circles (darker dots on the face)
    for (const [cx, cy] of pips) {
      const R = 4
      for (let row = cy - R; row <= cy + R; row++) {
        for (let col = cx - R; col <= cx + R; col++) {
          if ((col - cx) ** 2 + (row - cy) ** 2 <= R * R) {
            if (row >= 0 && row < height && col >= 0 && col < width) {
              data[(row * width + col) * 4] = 20
              data[(row * width + col) * 4 + 1] = 20
              data[(row * width + col) * 4 + 2] = 20
              data[(row * width + col) * 4 + 3] = 255
            }
          }
        }
      }
    }
  }

  return data
}

describe('pipeline', () => {
  it('creates a pipeline with initial state (no background)', () => {
    const pipeline = createPipeline('set-1')
    expect(pipeline.state.backgroundGray).toBeNull()
  })

  it('captureBackground stores the background in grayscale', () => {
    const pipeline = createPipeline('set-1')
    const bgData = makeRgbaBuffer(W, H, [])
    pipeline.captureBackground(bgData, W, H)
    expect(pipeline.state.backgroundGray).not.toBeNull()
    expect(pipeline.state.backgroundGray!.length).toBe(W * H)
  })

  it('processFrame returns empty array before background is set', () => {
    const pipeline = createPipeline('set-1')
    const frameData = makeRgbaBuffer(W, H, [{ x: 30, y: 30, size: 40, pips: [[50, 50]] }])
    const result = pipeline.processFrame(frameData, W, H)
    expect(result).toHaveLength(0)
  })

  it('processFrame returns one ROI result for a single die face', () => {
    const pipeline = createPipeline('set-1')

    const bgData = makeRgbaBuffer(W, H, [])
    pipeline.captureBackground(bgData, W, H)

    const frameData = makeRgbaBuffer(W, H, [
      { x: 30, y: 30, size: 45, pips: [[52, 52]] },
    ])
    const result = pipeline.processFrame(frameData, W, H)
    expect(result).toHaveLength(1)
  })

  it('processFrame returns two ROI results for two well-separated dice', () => {
    const pipeline = createPipeline('set-1')

    const bgData = makeRgbaBuffer(W, H, [])
    pipeline.captureBackground(bgData, W, H)

    const frameData = makeRgbaBuffer(W, H, [
      { x: 5, y: 5, size: 40, pips: [[25, 25]] },
      { x: 80, y: 80, size: 40, pips: [[100, 100]] },
    ])
    const result = pipeline.processFrame(frameData, W, H)
    expect(result).toHaveLength(2)
  })

  it('each result has a roi and pipCount', () => {
    const pipeline = createPipeline('set-1')
    const bgData = makeRgbaBuffer(W, H, [])
    pipeline.captureBackground(bgData, W, H)

    const frameData = makeRgbaBuffer(W, H, [
      { x: 30, y: 30, size: 45, pips: [[52, 52]] },
    ])
    const result = pipeline.processFrame(frameData, W, H)
    expect(result[0]).toHaveProperty('roi')
    expect(result[0]).toHaveProperty('pipCount')
  })

  it('consistent results for identical frames', () => {
    const pipeline = createPipeline('set-1')
    const bgData = makeRgbaBuffer(W, H, [])
    pipeline.captureBackground(bgData, W, H)

    const frame = makeRgbaBuffer(W, H, [{ x: 30, y: 30, size: 45, pips: [[52, 52]] }])

    const r1 = pipeline.processFrame(frame, W, H)
    const r2 = pipeline.processFrame(frame, W, H)

    expect(r1).toHaveLength(1)
    expect(r2).toHaveLength(1)
    expect(r1[0]!.pipCount).toBe(r2[0]!.pipCount)
  })

  it('returns empty when frame matches background', () => {
    const pipeline = createPipeline('set-1')
    const bgData = makeRgbaBuffer(W, H, [])
    pipeline.captureBackground(bgData, W, H)

    // Process same frame as background — no dice
    const result = pipeline.processFrame(bgData, W, H)
    expect(result).toHaveLength(0)
  })

  it('returns empty when frame dimensions differ from background', () => {
    const pipeline = createPipeline('set-1')
    const bgData = makeRgbaBuffer(W, H, [])
    pipeline.captureBackground(bgData, W, H)

    const wrongSize = makeRgbaBuffer(64, 64, [{ x: 10, y: 10, size: 20, pips: [[20, 20]] }])
    const result = pipeline.processFrame(wrongSize, 64, 64)
    expect(result).toHaveLength(0)
  })
})

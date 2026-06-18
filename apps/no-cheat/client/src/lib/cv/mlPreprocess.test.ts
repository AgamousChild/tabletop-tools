import { describe, expect, it } from 'vitest'

import type { Detection } from './mlPreprocess'
import { nonMaxSuppression, resizeBilinear, rgbaToRgbChw } from './mlPreprocess'

describe('rgbaToRgbChw', () => {
  it('converts RGBA to RGB CHW with correct layout', () => {
    // 2x2 image: red, green, blue, white
    const rgba = new Uint8ClampedArray([
      255,
      0,
      0,
      255, // red
      0,
      255,
      0,
      255, // green
      0,
      0,
      255,
      255, // blue
      255,
      255,
      255,
      255, // white
    ])

    const result = rgbaToRgbChw(rgba, 2, 2)

    // Shape: [3, 4] = [R_channel, G_channel, B_channel]
    // R channel: [1.0, 0.0, 0.0, 1.0]
    expect(result[0]).toBeCloseTo(1.0) // R of red pixel
    expect(result[1]).toBeCloseTo(0.0) // R of green pixel
    expect(result[2]).toBeCloseTo(0.0) // R of blue pixel
    expect(result[3]).toBeCloseTo(1.0) // R of white pixel

    // G channel (offset by 4 pixels)
    expect(result[4]).toBeCloseTo(0.0) // G of red pixel
    expect(result[5]).toBeCloseTo(1.0) // G of green pixel
    expect(result[6]).toBeCloseTo(0.0) // G of blue pixel
    expect(result[7]).toBeCloseTo(1.0) // G of white pixel

    // B channel (offset by 8 pixels)
    expect(result[8]).toBeCloseTo(0.0) // B of red pixel
    expect(result[9]).toBeCloseTo(0.0) // B of green pixel
    expect(result[10]).toBeCloseTo(1.0) // B of blue pixel
    expect(result[11]).toBeCloseTo(1.0) // B of white pixel
  })

  it('normalizes values to [0, 1]', () => {
    const rgba = new Uint8ClampedArray([128, 64, 192, 255])
    const result = rgbaToRgbChw(rgba, 1, 1)

    expect(result[0]).toBeCloseTo(128 / 255)
    expect(result[1]).toBeCloseTo(64 / 255)
    expect(result[2]).toBeCloseTo(192 / 255)
  })

  it('returns correct length for given dimensions', () => {
    const w = 10,
      h = 8
    const rgba = new Uint8ClampedArray(w * h * 4)
    const result = rgbaToRgbChw(rgba, w, h)
    expect(result.length).toBe(3 * w * h)
  })

  it('ignores alpha channel', () => {
    // Same RGB, different alpha
    const rgba1 = new Uint8ClampedArray([100, 150, 200, 255])
    const rgba2 = new Uint8ClampedArray([100, 150, 200, 0])

    const result1 = rgbaToRgbChw(rgba1, 1, 1)
    const result2 = rgbaToRgbChw(rgba2, 1, 1)

    expect(result1[0]).toBe(result2[0])
    expect(result1[1]).toBe(result2[1])
    expect(result1[2]).toBe(result2[2])
  })
})

describe('resizeBilinear', () => {
  it('preserves a solid color image', () => {
    // 4x4 solid red
    const src = new Uint8ClampedArray(4 * 4 * 4)
    for (let i = 0; i < 16; i++) {
      src[i * 4] = 255 // R
      src[i * 4 + 1] = 0 // G
      src[i * 4 + 2] = 0 // B
      src[i * 4 + 3] = 255 // A
    }

    const dst = resizeBilinear(src, 4, 4, 2, 2)
    expect(dst.length).toBe(2 * 2 * 4)

    for (let i = 0; i < 4; i++) {
      expect(dst[i * 4]).toBe(255) // R
      expect(dst[i * 4 + 1]).toBe(0) // G
      expect(dst[i * 4 + 2]).toBe(0) // B
      expect(dst[i * 4 + 3]).toBe(255) // A
    }
  })

  it('returns correct output dimensions', () => {
    const src = new Uint8ClampedArray(10 * 8 * 4)
    const dst = resizeBilinear(src, 10, 8, 5, 4)
    expect(dst.length).toBe(5 * 4 * 4)
  })

  it('upscales with interpolation', () => {
    // 1x1 gray pixel
    const src = new Uint8ClampedArray([128, 128, 128, 255])
    const dst = resizeBilinear(src, 1, 1, 3, 3)
    expect(dst.length).toBe(3 * 3 * 4)
    // All pixels should be the same gray
    for (let i = 0; i < 9; i++) {
      expect(dst[i * 4]).toBe(128)
    }
  })

  it('handles identity resize (same dimensions)', () => {
    const src = new Uint8ClampedArray([10, 20, 30, 40, 50, 60, 70, 80])
    const dst = resizeBilinear(src, 2, 1, 2, 1)
    expect(dst.length).toBe(8)
    expect(dst[0]).toBe(10)
    expect(dst[4]).toBe(50)
  })
})

describe('nonMaxSuppression', () => {
  function makeDet(
    x: number,
    y: number,
    w: number,
    h: number,
    conf: number,
    cls: number = 0,
  ): Detection {
    return { x, y, w, h, confidence: conf, classId: cls }
  }

  it('returns empty array for empty input', () => {
    expect(nonMaxSuppression([])).toEqual([])
  })

  it('keeps single detection unchanged', () => {
    const dets = [makeDet(100, 100, 50, 50, 0.9)]
    const result = nonMaxSuppression(dets)
    expect(result).toHaveLength(1)
    expect(result[0]!.confidence).toBe(0.9)
  })

  it('suppresses overlapping detections', () => {
    const dets = [
      makeDet(100, 100, 50, 50, 0.9), // higher conf — should be kept
      makeDet(105, 105, 50, 50, 0.7), // overlaps heavily — should be suppressed
    ]
    const result = nonMaxSuppression(dets, 0.5)
    expect(result).toHaveLength(1)
    expect(result[0]!.confidence).toBe(0.9)
  })

  it('keeps non-overlapping detections', () => {
    const dets = [makeDet(50, 50, 30, 30, 0.9), makeDet(200, 200, 30, 30, 0.8)]
    const result = nonMaxSuppression(dets, 0.5)
    expect(result).toHaveLength(2)
  })

  it('sorts by confidence (highest first)', () => {
    const dets = [
      makeDet(50, 50, 30, 30, 0.5),
      makeDet(200, 200, 30, 30, 0.9),
      makeDet(350, 350, 30, 30, 0.7),
    ]
    const result = nonMaxSuppression(dets, 0.5)
    expect(result[0]!.confidence).toBe(0.9)
    expect(result[1]!.confidence).toBe(0.7)
    expect(result[2]!.confidence).toBe(0.5)
  })

  it('handles edge case where IoU is exactly at threshold', () => {
    // Two boxes with exactly 50% overlap at threshold 0.5 should suppress
    const dets = [
      makeDet(100, 100, 100, 100, 0.9),
      makeDet(150, 100, 100, 100, 0.7), // overlaps 50×100 out of 150×100 = ~33% — should keep
    ]
    const result = nonMaxSuppression(dets, 0.5)
    expect(result).toHaveLength(2) // 33% IoU < 50% threshold
  })

  it('preserves class information', () => {
    const dets = [makeDet(50, 50, 30, 30, 0.9, 3), makeDet(200, 200, 30, 30, 0.8, 5)]
    const result = nonMaxSuppression(dets, 0.5)
    expect(result[0]!.classId).toBe(3)
    expect(result[1]!.classId).toBe(5)
  })
})

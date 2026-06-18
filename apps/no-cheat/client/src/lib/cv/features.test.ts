import { describe, expect, it } from 'vitest'

import { extractFeatures } from './features'

const W = 64
const H = 64

/** Create a uniform grayscale image filled with a single value */
function uniformImage(value: number, w = W, h = H): Uint8Array {
  return new Uint8Array(w * h).fill(value)
}

/** Place a filled circle (dark pip) on a light background */
function addDarkPip(img: Uint8Array, cx: number, cy: number, r: number, w = W): void {
  const h = img.length / w
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) {
        img[y * w + x] = 20 // dark pip on light bg
      }
    }
  }
}

/** Create a die face with N dark pips on a light background */
function createDieFace(pipCount: number, w = W, h = H): Uint8Array {
  const img = new Uint8Array(w * h).fill(200) // light background
  const R = 5

  const layouts: Record<number, [number, number][]> = {
    1: [[32, 32]],
    2: [
      [20, 20],
      [44, 44],
    ],
    3: [
      [20, 20],
      [32, 32],
      [44, 44],
    ],
    4: [
      [20, 20],
      [44, 20],
      [20, 44],
      [44, 44],
    ],
    5: [
      [20, 20],
      [44, 20],
      [32, 32],
      [20, 44],
      [44, 44],
    ],
    6: [
      [20, 16],
      [20, 32],
      [20, 48],
      [44, 16],
      [44, 32],
      [44, 48],
    ],
  }

  if (layouts[pipCount]) {
    for (const [cx, cy] of layouts[pipCount]!) {
      addDarkPip(img, cx, cy, R, w)
    }
  }

  return img
}

describe('extractFeatures', () => {
  it('returns a 12-element array', () => {
    const img = createDieFace(3)
    const features = extractFeatures(img, W, H)
    expect(features).toHaveLength(13)
  })

  it('returns all finite numbers', () => {
    const img = createDieFace(3)
    const features = extractFeatures(img, W, H)
    for (let i = 0; i < features.length; i++) {
      expect(Number.isFinite(features[i])).toBe(true)
    }
  })

  it('produces different features for different pip counts', () => {
    const f1 = extractFeatures(createDieFace(1), W, H)
    const f3 = extractFeatures(createDieFace(3), W, H)
    const f6 = extractFeatures(createDieFace(6), W, H)

    // At least some features should differ between 1-pip and 3-pip
    const diff13 = f1.some((v, i) => Math.abs(v - f3[i]!) > 0.01)
    expect(diff13).toBe(true)

    // At least some features should differ between 3-pip and 6-pip
    const diff36 = f3.some((v, i) => Math.abs(v - f6[i]!) > 0.01)
    expect(diff36).toBe(true)

    // At least some features should differ between 1-pip and 6-pip
    const diff16 = f1.some((v, i) => Math.abs(v - f6[i]!) > 0.01)
    expect(diff16).toBe(true)
  })

  it('blob counts increase with more pips', () => {
    const f1 = extractFeatures(createDieFace(1), W, H)
    const f3 = extractFeatures(createDieFace(3), W, H)
    const f6 = extractFeatures(createDieFace(6), W, H)

    // First 4 features are blob counts at different thresholds
    // At least one threshold's blob count should increase from 1->3->6 pips
    const anyIncreasing = [0, 1, 2, 3].some((i) => f1[i]! <= f3[i]! && f3[i]! <= f6[i]!)
    expect(anyIncreasing).toBe(true)
  })

  it('handles blank (uniform) ROI without crashing', () => {
    const blank = uniformImage(128)
    const features = extractFeatures(blank, W, H)
    expect(features).toHaveLength(13)
    for (let i = 0; i < features.length; i++) {
      expect(Number.isFinite(features[i])).toBe(true)
    }
  })

  it('handles all-black uniform ROI', () => {
    const black = uniformImage(0)
    const features = extractFeatures(black, W, H)
    expect(features).toHaveLength(13)
    for (let i = 0; i < features.length; i++) {
      expect(Number.isFinite(features[i])).toBe(true)
    }
    // Mean intensity should be 0
    expect(features[7]).toBeCloseTo(0, 2)
  })

  it('handles all-white uniform ROI', () => {
    const white = uniformImage(255)
    const features = extractFeatures(white, W, H)
    expect(features).toHaveLength(13)
    for (let i = 0; i < features.length; i++) {
      expect(Number.isFinite(features[i])).toBe(true)
    }
    // Mean intensity should be 1.0
    expect(features[7]).toBeCloseTo(1.0, 2)
    // Dark pixel ratio should be 0
    expect(features[9]).toBeCloseTo(0, 2)
  })

  it('handles very small ROI (2x2)', () => {
    const tiny = new Uint8Array([100, 200, 50, 150])
    const features = extractFeatures(tiny, 2, 2)
    expect(features).toHaveLength(13)
    for (let i = 0; i < features.length; i++) {
      expect(Number.isFinite(features[i])).toBe(true)
    }
  })

  it('handles single pixel ROI (1x1)', () => {
    const pixel = new Uint8Array([128])
    const features = extractFeatures(pixel, 1, 1)
    expect(features).toHaveLength(13)
    for (let i = 0; i < features.length; i++) {
      expect(Number.isFinite(features[i])).toBe(true)
    }
  })

  it('intensity stats reflect the actual image content', () => {
    const dark = createDieFace(0) // no pips, just background at 200
    const features = extractFeatures(dark, W, H)
    // Mean intensity (feature[7]) should be near 200/255 ≈ 0.784
    expect(features[7]).toBeGreaterThan(0.7)
    expect(features[7]).toBeLessThan(0.85)
    // Stddev (feature[8]) should be near 0 for uniform image
    expect(features[8]).toBeLessThan(0.05)
  })

  it('aspect ratio is correct for non-square images', () => {
    const wide = new Uint8Array(80 * 40).fill(128)
    const features = extractFeatures(wide, 80, 40)
    // Aspect ratio (feature[10]) = w/h = 80/40 = 2.0
    expect(features[10]).toBeCloseTo(2.0, 2)
    // Normalized ROI size (feature[11]) = sqrt(80*40)/100 = sqrt(3200)/100 ≈ 0.566
    expect(features[11]).toBeCloseTo(Math.sqrt(3200) / 100, 2)
  })

  it('dark pixel ratio reflects the image', () => {
    // Half dark, half light
    const img = new Uint8Array(W * H)
    for (let i = 0; i < img.length; i++) {
      img[i] = i < img.length / 2 ? 50 : 200
    }
    const features = extractFeatures(img, W, H)
    // Dark pixel ratio (feature[9]) should be close to 0.5
    expect(features[9]).toBeGreaterThan(0.4)
    expect(features[9]).toBeLessThan(0.6)
  })
})

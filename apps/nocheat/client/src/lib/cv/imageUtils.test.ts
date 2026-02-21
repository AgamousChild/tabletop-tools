import { describe, it, expect } from 'vitest'
import { toGrayscale, binarize, countBlobs } from './imageUtils'

// Build a synthetic 4x4 RGBA image (all white)
function whiteRgba(w: number, h: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 255
  }
  return data
}

// Paint a single pixel black in an RGBA buffer
function blackPixel(data: Uint8ClampedArray, x: number, y: number, w: number) {
  const i = (y * w + x) * 4
  data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255
}

describe('toGrayscale', () => {
  it('converts all-white RGBA to all-255 grayscale', () => {
    const rgba = whiteRgba(4, 4)
    const gray = toGrayscale(rgba, 4, 4)
    expect(gray.every((v) => v === 255)).toBe(true)
  })

  it('converts a black pixel to near-zero grayscale', () => {
    const rgba = whiteRgba(4, 4)
    blackPixel(rgba, 0, 0, 4)
    const gray = toGrayscale(rgba, 4, 4)
    expect(gray[0]).toBeLessThan(10)
  })

  it('returns an array of width * height values', () => {
    const rgba = whiteRgba(6, 8)
    const gray = toGrayscale(rgba, 6, 8)
    expect(gray.length).toBe(48)
  })
})

describe('binarize', () => {
  it('marks pixels below threshold as dark (0)', () => {
    const gray = new Uint8Array([50, 200, 100, 180, 30, 220])
    const binary = binarize(gray, 128)
    expect(binary[0]).toBe(0)  // 50 < 128 → dark
    expect(binary[2]).toBe(0)  // 100 < 128 → dark
    expect(binary[4]).toBe(0)  // 30 < 128 → dark
  })

  it('marks pixels at or above threshold as light (255)', () => {
    const gray = new Uint8Array([50, 200, 100, 180, 30, 220])
    const binary = binarize(gray, 128)
    expect(binary[1]).toBe(255) // 200 ≥ 128 → light
    expect(binary[3]).toBe(255) // 180 ≥ 128 → light
    expect(binary[5]).toBe(255) // 220 ≥ 128 → light
  })
})

describe('countBlobs', () => {
  // Helper: create a binary image (0 = dark, 255 = light)
  function makeBinary(grid: number[][], w: number): Uint8Array {
    const data = new Uint8Array(w * grid.length)
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < w; x++) {
        data[y * w + x] = grid[y]![x]!
      }
    }
    return data
  }

  it('returns 0 blobs for an all-light image', () => {
    const binary = new Uint8Array(25).fill(255)
    expect(countBlobs(binary, 5, 5, 1)).toBe(0)
  })

  it('detects a single isolated dark blob', () => {
    const grid = [
      [255, 255, 255, 255, 255],
      [255,   0,   0, 255, 255],
      [255,   0,   0, 255, 255],
      [255, 255, 255, 255, 255],
      [255, 255, 255, 255, 255],
    ]
    const binary = makeBinary(grid, 5)
    expect(countBlobs(binary, 5, 5, 1)).toBe(1)
  })

  it('detects two separate dark blobs', () => {
    const grid = [
      [255, 255, 255, 255, 255],
      [255,   0, 255,   0, 255],
      [255,   0, 255,   0, 255],
      [255, 255, 255, 255, 255],
      [255, 255, 255, 255, 255],
    ]
    const binary = makeBinary(grid, 5)
    expect(countBlobs(binary, 5, 5, 1)).toBe(2)
  })

  it('ignores blobs smaller than minSize', () => {
    const grid = [
      [255, 255, 255, 255, 255],
      [255,   0, 255,   0, 255], // two single-pixel blobs
      [255, 255, 255, 255, 255],
      [255, 255, 255, 255, 255],
      [255, 255, 255, 255, 255],
    ]
    const binary = makeBinary(grid, 5)
    // minSize=2 should filter out single-pixel noise
    expect(countBlobs(binary, 5, 5, 2)).toBe(0)
  })

  it('counts six blobs for a die-six pattern', () => {
    // 9x9 grid with 6 blobs (2x2 each), like a die face
    const g = 255, d = 0
    const grid = [
      [g, g, g, g, g, g, g, g, g],
      [g, d, d, g, g, g, d, d, g],
      [g, d, d, g, g, g, d, d, g],
      [g, g, g, g, g, g, g, g, g],
      [g, d, d, g, g, g, d, d, g],
      [g, d, d, g, g, g, d, d, g],
      [g, g, g, g, g, g, g, g, g],
      [g, d, d, g, g, g, d, d, g],
      [g, d, d, g, g, g, d, d, g],
    ]
    const binary = makeBinary(grid, 9)
    expect(countBlobs(binary, 9, 9, 2)).toBe(6)
  })
})

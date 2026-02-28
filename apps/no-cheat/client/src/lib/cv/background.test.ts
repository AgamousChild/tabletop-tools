import { describe, expect, it } from 'vitest'

import { absDiffGray, dilate, erode, gaussianBlur, morphClose, otsuThreshold, rgbaToGray } from './background'

function solidGray(value: number, count: number): Uint8Array {
  return new Uint8Array(count).fill(value)
}

describe('rgbaToGray', () => {
  it('converts RGBA to grayscale using luminance coefficients', () => {
    // Pure white pixel → 255
    const rgba = new Uint8ClampedArray([255, 255, 255, 255])
    const gray = rgbaToGray(rgba, 1, 1)
    expect(gray[0]).toBe(255)
  })

  it('converts pure black to 0', () => {
    const rgba = new Uint8ClampedArray([0, 0, 0, 255])
    const gray = rgbaToGray(rgba, 1, 1)
    expect(gray[0]).toBe(0)
  })

  it('output length equals width × height', () => {
    const rgba = new Uint8ClampedArray(4 * 4 * 4)
    const gray = rgbaToGray(rgba, 4, 4)
    expect(gray.length).toBe(16)
  })
})

describe('gaussianBlur', () => {
  it('preserves a uniform image', () => {
    const gray = solidGray(100, 64)
    const blurred = gaussianBlur(gray, 8, 8)
    expect(blurred.every((v) => v === 100)).toBe(true)
  })

  it('smooths a single bright pixel', () => {
    const gray = solidGray(0, 25)
    gray[12] = 255 // center pixel of 5x5
    const blurred = gaussianBlur(gray, 5, 5)
    // Center should be reduced, neighbors should gain value
    expect(blurred[12]!).toBeLessThan(255)
    expect(blurred[12]!).toBeGreaterThan(0)
  })

  it('output has same length as input', () => {
    const gray = solidGray(50, 100)
    expect(gaussianBlur(gray, 10, 10).length).toBe(100)
  })
})

describe('absDiffGray', () => {
  it('returns all zeros when images are identical', () => {
    const img = solidGray(100, 16)
    const diff = absDiffGray(img, img)
    expect(diff.every((v) => v === 0)).toBe(true)
  })

  it('returns absolute difference per pixel', () => {
    const fg = solidGray(200, 4)
    const bg = solidGray(100, 4)
    const diff = absDiffGray(fg, bg)
    expect(diff.every((v) => v === 100)).toBe(true)
  })

  it('handles inverted order (bg > fg)', () => {
    const fg = solidGray(50, 4)
    const bg = solidGray(150, 4)
    const diff = absDiffGray(fg, bg)
    expect(diff.every((v) => v === 100)).toBe(true)
  })
})

describe('otsuThreshold', () => {
  it('returns a binary mask (0 or 255 only)', () => {
    const gray = new Uint8Array(256)
    gray.fill(50, 0, 128)
    gray.fill(200, 128, 256)
    const mask = otsuThreshold(gray)
    expect(mask.every((v) => v === 0 || v === 255)).toBe(true)
  })

  it('thresholds correctly for a clearly bimodal distribution', () => {
    const gray = new Uint8Array(256)
    gray.fill(0, 0, 128)
    gray.fill(255, 128, 256)
    const mask = otsuThreshold(gray, 0)
    expect(mask.slice(0, 128).every((v) => v === 0)).toBe(true)
    expect(mask.slice(128, 256).every((v) => v === 255)).toBe(true)
  })

  it('enforces minimum threshold', () => {
    // All low values — Otsu would pick a very low threshold
    const gray = new Uint8Array(100)
    gray.fill(5, 0, 50)
    gray.fill(10, 50, 100)
    const mask = otsuThreshold(gray, 15)
    // With min threshold of 15, nothing should be above threshold
    expect(mask.every((v) => v === 0)).toBe(true)
  })

  it('handles a uniform image without error', () => {
    const gray = solidGray(128, 64)
    expect(() => otsuThreshold(gray)).not.toThrow()
  })

  it('output length equals input length', () => {
    const gray = solidGray(100, 100)
    expect(otsuThreshold(gray).length).toBe(100)
  })
})

describe('dilate', () => {
  it('expands a single bright pixel', () => {
    const src = solidGray(0, 25)
    src[12] = 255 // center of 5x5
    const dilated = dilate(src, 5, 5, 1) // radius 1 = 3x3 kernel
    // Center and all 4-connected neighbors should be 255
    expect(dilated[12]).toBe(255)
    expect(dilated[11]).toBe(255) // left
    expect(dilated[13]).toBe(255) // right
    expect(dilated[7]).toBe(255) // top
    expect(dilated[17]).toBe(255) // bottom
  })
})

describe('erode', () => {
  it('shrinks a small blob', () => {
    // 5x5 image, center 3x3 block is white
    const src = solidGray(0, 25)
    for (let y = 1; y <= 3; y++) {
      for (let x = 1; x <= 3; x++) {
        src[y * 5 + x] = 255
      }
    }
    const eroded = erode(src, 5, 5, 1) // radius 1 = 3x3 kernel
    // Only the very center pixel should remain (has all neighbors white)
    expect(eroded[12]).toBe(255)
    // Edge pixels of the 3x3 block should be eroded away
    expect(eroded[6]).toBe(0) // (1,1) — has 0-value neighbors
  })
})

describe('morphClose', () => {
  it('fills a small gap between two regions', () => {
    // 5x5 image with two blocks separated by a 1px gap in the middle column
    // Row 1-3 have blocks: [0,255,0,255,0]
    const src = new Uint8Array(5 * 5).fill(0)
    // Left block: col 1, rows 1-3
    for (let y = 1; y <= 3; y++) src[y * 5 + 1] = 255
    // Right block: col 3, rows 1-3
    for (let y = 1; y <= 3; y++) src[y * 5 + 3] = 255
    // Gap at col 2 should be filled

    const closed = morphClose(src, 5, 5, 1)
    // The gap at (2, 2) — center — should be filled
    expect(closed[2 * 5 + 2]).toBe(255)
  })
})

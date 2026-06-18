import { describe, expect, it } from 'vitest'

import {
  absDiffGray,
  adaptiveThreshold,
  buildIntegralImage,
  dilate,
  erode,
  gaussianBlur,
  morphClose,
  otsuThreshold,
  rgbaToGray,
} from './background'

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

describe('buildIntegralImage', () => {
  it('returns dimensions (width+1) × (height+1)', () => {
    const gray = solidGray(100, 12) // 4×3
    const sat = buildIntegralImage(gray, 4, 3)
    expect(sat.length).toBe(5 * 4) // (4+1) × (3+1)
  })

  it('top row and left column are all zeros', () => {
    const gray = solidGray(50, 6) // 3×2
    const sat = buildIntegralImage(gray, 3, 2)
    const iw = 4 // width+1
    // Row 0
    for (let x = 0; x < iw; x++) expect(sat[x]).toBe(0)
    // Col 0
    for (let y = 0; y < 3; y++) expect(sat[y * iw]).toBe(0)
  })

  it('computes correct values on a known 3×3 grid', () => {
    // 3×3 grid:
    //  1  2  3
    //  4  5  6
    //  7  8  9
    const gray = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9])
    const sat = buildIntegralImage(gray, 3, 3)
    const iw = 4 // width+1
    // sat[y+1][x+1] = sum of rectangle (0,0)→(x,y)
    expect(sat[1 * iw + 1]).toBe(1) // sum(0,0→0,0) = 1
    expect(sat[1 * iw + 2]).toBe(3) // sum(0,0→1,0) = 1+2
    expect(sat[1 * iw + 3]).toBe(6) // sum(0,0→2,0) = 1+2+3
    expect(sat[2 * iw + 1]).toBe(5) // sum(0,0→0,1) = 1+4
    expect(sat[2 * iw + 2]).toBe(12) // sum(0,0→1,1) = 1+2+4+5
    expect(sat[3 * iw + 3]).toBe(45) // sum(0,0→2,2) = all values
  })

  it('uses Float64Array to avoid overflow', () => {
    const gray = solidGray(255, 4) // small, but verify type
    const sat = buildIntegralImage(gray, 2, 2)
    expect(sat).toBeInstanceOf(Float64Array)
  })
})

describe('adaptiveThreshold', () => {
  it('returns all zeros for a uniform image (no local contrast)', () => {
    const gray = solidGray(128, 400) // 20×20
    const mask = adaptiveThreshold(gray, 20, 20)
    expect(mask.every((v) => v === 0)).toBe(true)
  })

  it('detects a strong vertical edge', () => {
    // 20×20 image: left half = 50, right half = 200
    const gray = new Uint8Array(20 * 20)
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        gray[y * 20 + x] = x < 10 ? 50 : 200
      }
    }
    const mask = adaptiveThreshold(gray, 20, 20)
    // Pixels near the edge should be marked as foreground
    const hasForeground = mask.some((v) => v === 255)
    expect(hasForeground).toBe(true)
  })

  it('detects a dark pip-like dot on a light surface', () => {
    // 30×30 light surface (200) with a dark 5×5 dot centered at (15,15)
    const gray = solidGray(200, 900) // 30×30
    for (let y = 13; y <= 17; y++) {
      for (let x = 13; x <= 17; x++) {
        gray[y * 30 + x] = 30
      }
    }
    // Use a window large enough to span the dot boundary (> 5px)
    const mask = adaptiveThreshold(gray, 30, 30, 9)
    // The dark dot area should have foreground pixels
    expect(mask[15 * 30 + 15]).toBe(255)
  })

  it('returns only 0 or 255 values', () => {
    const gray = new Uint8Array(100)
    for (let i = 0; i < 100; i++) gray[i] = i * 2
    const mask = adaptiveThreshold(gray, 10, 10)
    expect(mask.every((v) => v === 0 || v === 255)).toBe(true)
  })

  it('output length matches input length', () => {
    const gray = solidGray(100, 64)
    expect(adaptiveThreshold(gray, 8, 8).length).toBe(64)
  })

  it('respects custom C parameter', () => {
    // 20×20 with subtle contrast: left=120, right=140 (diff=20)
    const gray = new Uint8Array(20 * 20)
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        gray[y * 20 + x] = x < 10 ? 120 : 140
      }
    }
    // With C=25, this subtle edge should NOT be detected
    const maskHigh = adaptiveThreshold(gray, 20, 20, undefined, 25)
    expect(maskHigh.every((v) => v === 0)).toBe(true)

    // With C=5, the edge SHOULD be detected
    const maskLow = adaptiveThreshold(gray, 20, 20, undefined, 5)
    expect(maskLow.some((v) => v === 255)).toBe(true)
  })

  it('handles all-black image without error', () => {
    const gray = solidGray(0, 64)
    expect(() => adaptiveThreshold(gray, 8, 8)).not.toThrow()
    expect(adaptiveThreshold(gray, 8, 8).every((v) => v === 0)).toBe(true)
  })

  it('handles all-white image without error', () => {
    const gray = solidGray(255, 64)
    expect(() => adaptiveThreshold(gray, 8, 8)).not.toThrow()
    expect(adaptiveThreshold(gray, 8, 8).every((v) => v === 0)).toBe(true)
  })
})

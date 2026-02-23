import { describe, expect, it } from 'vitest'

import { avgPixelDiff, matchDissimilarity, rotateImage } from './templateMatch'

const SIZE = 64

/** Solid-color 64×64 grayscale image */
function solid(value: number): Uint8Array {
  return new Uint8Array(SIZE * SIZE).fill(value)
}

/** 64×64 image with a filled circle at (cx, cy) radius r */
function circle(cx: number, cy: number, r: number, fg = 255, bg = 0): Uint8Array {
  const img = new Uint8Array(SIZE * SIZE).fill(bg)
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) {
        img[y * SIZE + x] = fg
      }
    }
  }
  return img
}

/** 64×64 image with 6 large pips arranged in two columns (standard d6 "6" face) */
function sixPipImage(): Uint8Array {
  const img = new Uint8Array(SIZE * SIZE).fill(0)
  const positions = [
    [16, 16], [16, 32], [16, 48],
    [48, 16], [48, 32], [48, 48],
  ] as const
  for (const [cx, cy] of positions) {
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= 49) {  // radius 7 → ~154px each
          img[y * SIZE + x] = 255
        }
      }
    }
  }
  return img
}

// ---------------------------------------------------------------------------
// avgPixelDiff
// ---------------------------------------------------------------------------

describe('avgPixelDiff', () => {
  it('returns 0 for identical images', () => {
    const img = circle(32, 32, 8)
    expect(avgPixelDiff(img, img)).toBe(0)
  })

  it('returns 1.0 for fully inverted images', () => {
    expect(avgPixelDiff(solid(255), solid(0))).toBeCloseTo(1.0, 5)
  })

  it('scales linearly with pixel intensity difference', () => {
    // avg |255 - 127| / 255 ≈ 0.502
    expect(avgPixelDiff(solid(255), solid(127))).toBeCloseTo(128 / 255, 2)
  })
})

// ---------------------------------------------------------------------------
// rotateImage
// ---------------------------------------------------------------------------

describe('rotateImage', () => {
  it('is identity at 0°', () => {
    const img = circle(32, 32, 8)
    expect(avgPixelDiff(img, rotateImage(img, 0))).toBe(0)
  })

  it('is identity at 360°', () => {
    const img = circle(20, 20, 5)
    expect(avgPixelDiff(img, rotateImage(img, 360))).toBe(0)
  })

  it('leaves a centered symmetric circle nearly unchanged at any angle', () => {
    // A circle centered at (32, 32) is rotationally symmetric.
    // Nearest-neighbor rounding at the circle boundary introduces tiny error.
    const img = circle(32, 32, 10)
    expect(avgPixelDiff(img, rotateImage(img, 90))).toBeLessThan(0.015)
    expect(avgPixelDiff(img, rotateImage(img, 45))).toBeLessThan(0.015)
  })

  it('produces a noticeably different image for off-center patterns at 90°', () => {
    // Dot at (32, 10) — near top. After 90° it moves to (54, 32) — near right.
    const img = circle(32, 10, 5)
    expect(avgPixelDiff(img, rotateImage(img, 90))).toBeGreaterThan(0.02)
  })

  it('composes correctly: rotating by A then -A gives back the original', () => {
    const img = circle(32, 15, 6)
    const rotated = rotateImage(img, 73)
    const restored = rotateImage(rotated, -73)
    // Two rounds of nearest-neighbor interpolation → small rounding error
    expect(avgPixelDiff(img, restored)).toBeLessThan(0.02)
  })
})

// ---------------------------------------------------------------------------
// matchDissimilarity (rotation-invariant)
// ---------------------------------------------------------------------------

describe('matchDissimilarity', () => {
  it('returns 0 for identical images', () => {
    const img = circle(32, 32, 8)
    expect(matchDissimilarity(img, img)).toBe(0)
  })

  it('returns a near-zero score when exemplar is a rotated version of the probe', () => {
    // Create original pattern; rotate it by 47° to simulate a differently-oriented die face
    const original = circle(32, 15, 6)
    const rotated47 = rotateImage(original, 47)
    // The search should find the ~313° rotation that unwinds the 47° offset
    expect(matchDissimilarity(original, rotated47)).toBeLessThan(0.05)
  })

  it('returns a near-zero score for a large rotation offset (170°)', () => {
    const original = circle(32, 12, 5)
    const rotated170 = rotateImage(original, 170)
    expect(matchDissimilarity(original, rotated170)).toBeLessThan(0.05)
  })

  it('returns a high score for structurally different images', () => {
    // 6-pip image vs blank — no rotation can make these match
    const pips = sixPipImage()
    const blank = solid(0)
    expect(matchDissimilarity(pips, blank)).toBeGreaterThan(0.1)
  })

  it('returns a high score for single-pip vs six-pip', () => {
    const one = circle(32, 32, 7)  // single center pip
    const six = sixPipImage()
    // They have very different pixel distributions — no rotation aligns them
    expect(matchDissimilarity(one, six)).toBeGreaterThan(0.05)
  })
})

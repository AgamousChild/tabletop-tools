import { describe, expect, it } from 'vitest'

import { detectBlobs } from './blobDetector'

const SIZE = 64

/** Place a filled circle (blob) at (cx, cy) with radius r */
function addBlob(img: Uint8Array, cx: number, cy: number, r: number): void {
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) {
        img[y * SIZE + x] = 255
      }
    }
  }
}

/** Standard pip layouts for a d6 on a 64×64 image */
function pipLayout(pips: number): Uint8Array {
  const img = new Uint8Array(SIZE * SIZE).fill(0)
  const R = 5  // pip radius

  // Positions for each pip value (column, row pairs in a 3×2 grid)
  const layouts: Record<number, [number, number][]> = {
    1: [[32, 32]],
    2: [[20, 20], [44, 44]],
    3: [[20, 20], [32, 32], [44, 44]],
    4: [[20, 20], [44, 20], [20, 44], [44, 44]],
    5: [[20, 20], [44, 20], [32, 32], [20, 44], [44, 44]],
    6: [[20, 16], [20, 32], [20, 48], [44, 16], [44, 32], [44, 48]],
  }

  for (const [cx, cy] of layouts[pips]!) {
    addBlob(img, cx, cy, R)
  }
  return img
}

describe('detectBlobs', () => {
  it('returns 0 for a blank image', () => {
    const blank = new Uint8Array(SIZE * SIZE).fill(0)
    expect(detectBlobs(blank)).toBe(0)
  })

  it('returns 1 for a single centered pip', () => {
    expect(detectBlobs(pipLayout(1))).toBe(1)
  })

  it('returns 2 for a two-pip layout', () => {
    expect(detectBlobs(pipLayout(2))).toBe(2)
  })

  it('returns 3 for a three-pip layout', () => {
    expect(detectBlobs(pipLayout(3))).toBe(3)
  })

  it('returns 4 for a four-pip layout', () => {
    expect(detectBlobs(pipLayout(4))).toBe(4)
  })

  it('returns 5 for a five-pip layout', () => {
    expect(detectBlobs(pipLayout(5))).toBe(5)
  })

  it('returns 6 for a six-pip layout', () => {
    expect(detectBlobs(pipLayout(6))).toBe(6)
  })

  it('returns null for more than 6 detected blobs (false detection)', () => {
    // 8 small blobs — exceeds the d6 pip maximum
    const img = new Uint8Array(SIZE * SIZE).fill(0)
    const positions = [
      [8, 8], [24, 8], [40, 8], [56, 8],
      [8, 56], [24, 56], [40, 56], [56, 56],
    ] as [number, number][]
    for (const [cx, cy] of positions) addBlob(img, cx, cy, 4)
    expect(detectBlobs(img)).toBeNull()
  })

  it('ignores blobs that are too small (noise)', () => {
    // One real pip + one tiny noise blob
    const img = pipLayout(1)
    // Add a 1-pixel "blob" — below minArea
    img[5 * SIZE + 5] = 255
    // Should still count as 1
    expect(detectBlobs(img)).toBe(1)
  })
})

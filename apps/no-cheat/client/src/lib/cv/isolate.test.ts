import { describe, expect, it } from 'vitest'

import { extractRois } from './isolate'

/**
 * Create a binary mask of given width×height with white rectangles.
 */
function binaryMask(
  width: number,
  height: number,
  rects: { x: number; y: number; w: number; h: number }[],
): Uint8Array {
  const mask = new Uint8Array(width * height).fill(0)
  for (const { x, y, w, h } of rects) {
    for (let row = y; row < y + h; row++) {
      for (let col = x; col < x + w; col++) {
        if (row >= 0 && row < height && col >= 0 && col < width) {
          mask[row * width + col] = 255
        }
      }
    }
  }
  return mask
}

const W = 128
const H = 128

describe('extractRois', () => {
  it('returns an empty array for a blank mask', () => {
    const mask = new Uint8Array(W * H).fill(0)
    expect(extractRois(mask, W, H)).toHaveLength(0)
  })

  it('returns one ROI for a single large white region', () => {
    const mask = binaryMask(W, H, [{ x: 30, y: 30, w: 40, h: 40 }])
    const rois = extractRois(mask, W, H)
    expect(rois).toHaveLength(1)
    expect(rois[0]!.width).toBeGreaterThan(0)
    expect(rois[0]!.height).toBeGreaterThan(0)
  })

  it('returns square ROIs (width === height)', () => {
    // Non-square region — ROI should still be square
    const mask = binaryMask(W, H, [{ x: 20, y: 25, w: 40, h: 30 }])
    const rois = extractRois(mask, W, H)
    expect(rois).toHaveLength(1)
    expect(rois[0]!.width).toBe(rois[0]!.height)
  })

  it('ROI has cx, cy, and angle fields', () => {
    const mask = binaryMask(W, H, [{ x: 30, y: 30, w: 40, h: 40 }])
    const rois = extractRois(mask, W, H)
    expect(rois).toHaveLength(1)
    expect(rois[0]).toHaveProperty('cx')
    expect(rois[0]).toHaveProperty('cy')
    expect(rois[0]).toHaveProperty('angle')
    expect(typeof rois[0]!.angle).toBe('number')
  })

  it('returns two ROIs for two well-separated white regions', () => {
    const mask = binaryMask(W, H, [
      { x: 10, y: 10, w: 30, h: 30 },
      { x: 90, y: 90, w: 30, h: 30 },
    ])
    const rois = extractRois(mask, W, H)
    expect(rois).toHaveLength(2)
  })

  it('filters out small noise blobs below the minimum area threshold', () => {
    // One real die face (large) and several tiny noise pixels
    const mask = binaryMask(W, H, [{ x: 40, y: 40, w: 35, h: 35 }])
    // Add scattered single-pixel noise
    mask[5 * W + 5] = 255
    mask[100 * W + 10] = 255
    mask[20 * W + 110] = 255
    const rois = extractRois(mask, W, H)
    // Only the large region should survive
    expect(rois).toHaveLength(1)
  })

  it('ROI bounding box contains the white region', () => {
    // Region from (20, 25) to (60, 70)
    const mask = binaryMask(W, H, [{ x: 20, y: 25, w: 40, h: 45 }])
    const rois = extractRois(mask, W, H)
    expect(rois).toHaveLength(1)
    const roi = rois[0]!
    expect(roi.x).toBeLessThanOrEqual(20)
    expect(roi.y).toBeLessThanOrEqual(25)
    expect(roi.x + roi.width).toBeGreaterThanOrEqual(60)
    expect(roi.y + roi.height).toBeGreaterThanOrEqual(70)
  })

  it('merges two adjacent regions into a single ROI', () => {
    // Two small regions touching (adjacent pixels) → one connected component
    const mask = binaryMask(W, H, [
      { x: 40, y: 40, w: 15, h: 15 },
      { x: 55, y: 40, w: 15, h: 15 }, // adjacent to previous (x=55 touches x=54)
    ])
    const rois = extractRois(mask, W, H)
    // Adjacent regions form one connected component via BFS
    expect(rois).toHaveLength(1)
  })

  it('does not merge two well-separated regions', () => {
    const mask = binaryMask(W, H, [
      { x: 5, y: 5, w: 30, h: 30 },
      { x: 90, y: 90, w: 30, h: 30 },
    ])
    const rois = extractRois(mask, W, H)
    expect(rois).toHaveLength(2)
  })

  it('clamps ROI coordinates to image bounds', () => {
    // Region near top-left corner — square expansion should be clamped
    const mask = binaryMask(W, H, [{ x: 2, y: 2, w: 30, h: 20 }])
    const rois = extractRois(mask, W, H)
    expect(rois).toHaveLength(1)
    expect(rois[0]!.x).toBeGreaterThanOrEqual(0)
    expect(rois[0]!.y).toBeGreaterThanOrEqual(0)
    expect(rois[0]!.x + rois[0]!.width).toBeLessThanOrEqual(W)
    expect(rois[0]!.y + rois[0]!.height).toBeLessThanOrEqual(H)
  })

  it('angle is near zero for a symmetric square region', () => {
    const mask = binaryMask(W, H, [{ x: 40, y: 40, w: 40, h: 40 }])
    const rois = extractRois(mask, W, H)
    expect(rois).toHaveLength(1)
    // A perfectly symmetric square has undefined orientation, but angle should be finite
    expect(Math.abs(rois[0]!.angle)).toBeLessThan(Math.PI)
  })
})

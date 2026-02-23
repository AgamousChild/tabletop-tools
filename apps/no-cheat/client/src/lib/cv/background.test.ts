import { describe, expect, it } from 'vitest'

import { absDiffLab, otsuThreshold } from './background'

/**
 * Synthetic LAB image helpers.
 *
 * LAB pixels are stored as flat Uint8Array with 3 bytes per pixel: [L, a, b].
 * L ∈ [0, 255], a ∈ [0, 255] (128 = neutral), b ∈ [0, 255] (128 = neutral).
 */

function solidLab(l: number, a: number, b: number, width: number, height: number): Uint8Array {
  const data = new Uint8Array(width * height * 3)
  for (let i = 0; i < width * height; i++) {
    data[i * 3] = l
    data[i * 3 + 1] = a
    data[i * 3 + 2] = b
  }
  return data
}

function solidGray(value: number, count: number): Uint8Array {
  return new Uint8Array(count).fill(value)
}

describe('absDiffLab', () => {
  it('returns all zeros when the two images are identical', () => {
    const img = solidLab(100, 128, 128, 4, 4)
    const diff = absDiffLab(img, img, 4, 4)
    expect(diff.every((v) => v === 0)).toBe(true)
    expect(diff.length).toBe(4 * 4)
  })

  it('returns the L-channel absolute difference for each pixel', () => {
    const foreground = solidLab(200, 128, 128, 2, 2)
    const background = solidLab(100, 128, 128, 2, 2)
    const diff = absDiffLab(foreground, background, 2, 2)
    // L diff = |200 - 100| = 100; a diff = 0; b diff = 0 → combined = 100
    expect(diff[0]).toBe(100)
    expect(diff[1]).toBe(100)
  })

  it('combines L, a, and b channel differences via max', () => {
    // Foreground has L=100, a=200, b=128; background has L=100, a=128, b=128
    const fg = new Uint8Array([100, 200, 128])
    const bg = new Uint8Array([100, 128, 128])
    const diff = absDiffLab(fg, bg, 1, 1)
    // a diff = |200 - 128| = 72; L and b diff = 0 → max = 72
    expect(diff[0]).toBe(72)
  })

  it('output length equals width × height', () => {
    const img = solidLab(50, 128, 128, 8, 6)
    const diff = absDiffLab(img, img, 8, 6)
    expect(diff.length).toBe(8 * 6)
  })
})

describe('otsuThreshold', () => {
  it('returns a binary mask (0 or 255 only)', () => {
    // Bimodal grayscale: half 50 (background), half 200 (foreground)
    const gray = new Uint8Array(256)
    gray.fill(50, 0, 128)
    gray.fill(200, 128, 256)
    const mask = otsuThreshold(gray)
    expect(mask.every((v) => v === 0 || v === 255)).toBe(true)
  })

  it('thresholds correctly for a clearly bimodal distribution', () => {
    // 50% dark pixels (0), 50% bright pixels (255) → threshold should split them
    const gray = new Uint8Array(256)
    gray.fill(0, 0, 128)
    gray.fill(255, 128, 256)
    const mask = otsuThreshold(gray)
    // Dark pixels → 0, bright pixels → 255
    expect(mask.slice(0, 128).every((v) => v === 0)).toBe(true)
    expect(mask.slice(128, 256).every((v) => v === 255)).toBe(true)
  })

  it('handles a uniform image (all same value) without error', () => {
    const gray = solidGray(128, 64)
    // No meaningful threshold — should not throw
    expect(() => otsuThreshold(gray)).not.toThrow()
  })

  it('output length equals input length', () => {
    const gray = solidGray(100, 100)
    expect(otsuThreshold(gray).length).toBe(100)
  })
})

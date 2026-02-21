import { describe, it, expect, vi } from 'vitest'
import { detectPips } from './pipReader'

// Build a fake canvas object — no jsdom canvas needed
function makeCanvas(rgba: Uint8ClampedArray, w: number, h: number): HTMLCanvasElement {
  return {
    width: w,
    height: h,
    getContext: () => ({
      getImageData: () => ({ data: rgba, width: w, height: h, colorSpace: 'srgb' }),
    }),
  } as unknown as HTMLCanvasElement
}

// Build an RGBA image: white background with black 2×2 pip blobs
function makeDieFace(w: number, h: number, pipPositions: [number, number][]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4).fill(255)
  for (const [px, py] of pipPositions) {
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const i = ((py + dy) * w + (px + dx)) * 4
        data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255
      }
    }
  }
  return data
}

describe('detectPips', () => {
  it('returns 1 for a die face with one pip', async () => {
    const rgba = makeDieFace(20, 20, [[9, 9]])
    expect(await detectPips(makeCanvas(rgba, 20, 20))).toBe(1)
  })

  it('returns 3 for a die face with three pips', async () => {
    const rgba = makeDieFace(20, 20, [[2, 2], [9, 9], [16, 16]])
    expect(await detectPips(makeCanvas(rgba, 20, 20))).toBe(3)
  })

  it('returns 6 for a die face with six pips', async () => {
    const rgba = makeDieFace(30, 30, [
      [2, 2], [16, 2],
      [2, 14], [16, 14],
      [2, 26], [16, 26],
    ])
    expect(await detectPips(makeCanvas(rgba, 30, 30))).toBe(6)
  })

  it('returns 0 for a blank white canvas', async () => {
    const rgba = new Uint8ClampedArray(20 * 20 * 4).fill(255)
    expect(await detectPips(makeCanvas(rgba, 20, 20))).toBe(0)
  })

  it('throws if canvas context is unavailable', async () => {
    const canvas = { width: 10, height: 10, getContext: () => null } as unknown as HTMLCanvasElement
    await expect(detectPips(canvas)).rejects.toThrow()
  })
})

import { describe, expect, it } from 'vitest'

import { dilate, resizeTo64 } from './normalize'

const SIZE = 64

function solid(value: number, w: number, h: number): Uint8Array {
  return new Uint8Array(w * h).fill(value)
}

describe('resizeTo64', () => {
  it('returns a Uint8Array of length 64×64', () => {
    const input = solid(128, 32, 32)
    const result = resizeTo64(input, 32, 32)
    expect(result.length).toBe(SIZE * SIZE)
  })

  it('preserves pixel values for a solid-color image', () => {
    const input = solid(200, 16, 16)
    const result = resizeTo64(input, 16, 16)
    // All output pixels should be 200
    expect(result.every((v) => v === 200)).toBe(true)
  })

  it('is a no-op when the input is already 64×64', () => {
    const input = solid(77, 64, 64)
    const result = resizeTo64(input, 64, 64)
    expect(result).toEqual(input)
  })

  it('scales up a small image to 64×64', () => {
    // 2×2 image: top-left=0, top-right=255, bottom-left=0, bottom-right=0
    const input = new Uint8Array([0, 255, 0, 0])
    const result = resizeTo64(input, 2, 2)
    expect(result.length).toBe(SIZE * SIZE)
    // Top-right quadrant should be brighter (255)
    expect(result[32]).toBe(255)  // pixel at (32, 0)
  })

  it('scales down a large image to 64×64', () => {
    const input = solid(100, 128, 128)
    const result = resizeTo64(input, 128, 128)
    expect(result.length).toBe(SIZE * SIZE)
    expect(result.every((v) => v === 100)).toBe(true)
  })
})

describe('dilate', () => {
  it('returns a Uint8Array of the same length', () => {
    const input = solid(0, SIZE, SIZE)
    expect(dilate(input, SIZE, SIZE).length).toBe(SIZE * SIZE)
  })

  it('leaves an all-black image unchanged', () => {
    const input = solid(0, SIZE, SIZE)
    const result = dilate(input, SIZE, SIZE)
    expect(result.every((v) => v === 0)).toBe(true)
  })

  it('leaves an all-white image unchanged', () => {
    const input = solid(255, SIZE, SIZE)
    const result = dilate(input, SIZE, SIZE)
    expect(result.every((v) => v === 255)).toBe(true)
  })

  it('expands a single white pixel to a small region', () => {
    const input = solid(0, SIZE, SIZE)
    input[32 * SIZE + 32] = 255  // single white pixel at center
    const result = dilate(input, SIZE, SIZE)
    // All 8 neighbors should now also be 255
    expect(result[31 * SIZE + 31]).toBe(255)  // top-left
    expect(result[31 * SIZE + 32]).toBe(255)  // top
    expect(result[31 * SIZE + 33]).toBe(255)  // top-right
    expect(result[32 * SIZE + 31]).toBe(255)  // left
    expect(result[32 * SIZE + 33]).toBe(255)  // right
    expect(result[33 * SIZE + 31]).toBe(255)  // bottom-left
    expect(result[33 * SIZE + 32]).toBe(255)  // bottom
    expect(result[33 * SIZE + 33]).toBe(255)  // bottom-right
  })

  it('applies the kernel iterations times', () => {
    const input = solid(0, SIZE, SIZE)
    input[32 * SIZE + 32] = 255  // center pixel

    const once = dilate(input, SIZE, SIZE, 1)
    const twice = dilate(input, SIZE, SIZE, 2)

    // After 2 iterations, the dilation should be larger
    const countOnes = (img: Uint8Array) => img.filter((v) => v === 255).length
    expect(countOnes(twice)).toBeGreaterThan(countOnes(once))
  })
})

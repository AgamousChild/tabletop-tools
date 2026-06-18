import { describe, expect, it } from 'vitest'

import { distance, midpoint, offset } from './point'

describe('distance', () => {
  it('returns 0 for the same point', () => {
    expect(distance({ x: 3, y: 4 }, { x: 3, y: 4 })).toBe(0)
  })

  it('returns 0 for origin to itself', () => {
    expect(distance({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(0)
  })

  it('returns correct horizontal distance', () => {
    expect(distance({ x: 0, y: 0 }, { x: 5, y: 0 })).toBe(5)
  })

  it('returns correct vertical distance', () => {
    expect(distance({ x: 0, y: 0 }, { x: 0, y: 7 })).toBe(7)
  })

  it('returns correct diagonal distance (3-4-5 triangle)', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
  })

  it('is symmetric', () => {
    const a = { x: 1, y: 2 }
    const b = { x: 4, y: 6 }
    expect(distance(a, b)).toBeCloseTo(distance(b, a))
  })
})

describe('offset', () => {
  it('offsets by positive dx and dy', () => {
    expect(offset({ x: 1, y: 2 }, 3, 4)).toEqual({ x: 4, y: 6 })
  })

  it('offsets by negative dx and dy', () => {
    expect(offset({ x: 5, y: 5 }, -2, -3)).toEqual({ x: 3, y: 2 })
  })

  it('offsets by zero returns the same point value', () => {
    expect(offset({ x: 7, y: 8 }, 0, 0)).toEqual({ x: 7, y: 8 })
  })

  it('does not mutate the original point', () => {
    const p = { x: 1, y: 1 }
    offset(p, 10, 10)
    expect(p).toEqual({ x: 1, y: 1 })
  })
})

describe('midpoint', () => {
  it('returns midpoint of two identical points', () => {
    expect(midpoint({ x: 4, y: 4 }, { x: 4, y: 4 })).toEqual({ x: 4, y: 4 })
  })

  it('returns midpoint of horizontal pair', () => {
    expect(midpoint({ x: 0, y: 0 }, { x: 10, y: 0 })).toEqual({ x: 5, y: 0 })
  })

  it('returns midpoint of vertical pair', () => {
    expect(midpoint({ x: 0, y: 0 }, { x: 0, y: 6 })).toEqual({ x: 0, y: 3 })
  })

  it('returns midpoint of diagonal pair', () => {
    expect(midpoint({ x: 1, y: 1 }, { x: 3, y: 5 })).toEqual({ x: 2, y: 3 })
  })

  it('is symmetric', () => {
    const a = { x: 2, y: 8 }
    const b = { x: 6, y: 4 }
    expect(midpoint(a, b)).toEqual(midpoint(b, a))
  })
})

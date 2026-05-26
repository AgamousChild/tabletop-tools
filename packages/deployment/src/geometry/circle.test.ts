import { describe, expect, it } from 'vitest'

import { pointInCircle, pointInQuarterCircle } from './circle'

describe('pointInCircle', () => {
  const center = { x: 5, y: 5 }
  const radius = 3

  it('returns true for the center point', () => {
    expect(pointInCircle(center, center, radius)).toBe(true)
  })

  it('returns true for a point clearly inside', () => {
    expect(pointInCircle({ x: 5, y: 6 }, center, radius)).toBe(true)
  })

  it('returns true for a point on the boundary', () => {
    // Point at exactly radius distance: (5+3, 5) = (8, 5)
    expect(pointInCircle({ x: 8, y: 5 }, center, radius)).toBe(true)
  })

  it('returns false for a point just outside', () => {
    // Point at distance > radius: (5+3.1, 5)
    expect(pointInCircle({ x: 8.1, y: 5 }, center, radius)).toBe(false)
  })

  it('returns false for a point clearly outside', () => {
    expect(pointInCircle({ x: 0, y: 0 }, center, radius)).toBe(false)
  })

  it('works with radius 0 (only center is inside)', () => {
    expect(pointInCircle(center, center, 0)).toBe(true)
    expect(pointInCircle({ x: 5.1, y: 5 }, center, 0)).toBe(false)
  })
})

describe('pointInQuarterCircle', () => {
  // Center at origin, radius 10 for easy math
  const center = { x: 0, y: 0 }
  const radius = 10

  describe('top-left quadrant (x <= 0, y <= 0)', () => {
    it('returns true for a point inside the top-left arc', () => {
      // (-5, -5): distance ~7.07 < 10, and x<=0, y<=0
      expect(pointInQuarterCircle({ x: -5, y: -5 }, center, radius, 'top-left')).toBe(true)
    })

    it('returns false for a point in the wrong quadrant (top-right)', () => {
      expect(pointInQuarterCircle({ x: 5, y: -5 }, center, radius, 'top-left')).toBe(false)
    })

    it('returns false for a point in the correct quadrant but outside the arc', () => {
      expect(pointInQuarterCircle({ x: -8, y: -8 }, center, radius, 'top-left')).toBe(false)
    })
  })

  describe('top-right quadrant (x >= 0, y <= 0)', () => {
    it('returns true for a point inside the top-right arc', () => {
      expect(pointInQuarterCircle({ x: 5, y: -5 }, center, radius, 'top-right')).toBe(true)
    })

    it('returns false for a point in the wrong quadrant (bottom-right)', () => {
      expect(pointInQuarterCircle({ x: 5, y: 5 }, center, radius, 'top-right')).toBe(false)
    })
  })

  describe('bottom-left quadrant (x <= 0, y >= 0)', () => {
    it('returns true for a point inside the bottom-left arc', () => {
      expect(pointInQuarterCircle({ x: -5, y: 5 }, center, radius, 'bottom-left')).toBe(true)
    })

    it('returns false for a point in the wrong quadrant (bottom-right)', () => {
      expect(pointInQuarterCircle({ x: 5, y: 5 }, center, radius, 'bottom-left')).toBe(false)
    })
  })

  describe('bottom-right quadrant (x >= 0, y >= 0)', () => {
    it('returns true for a point inside the bottom-right arc', () => {
      expect(pointInQuarterCircle({ x: 5, y: 5 }, center, radius, 'bottom-right')).toBe(true)
    })

    it('returns false for a point in the wrong quadrant (top-right)', () => {
      expect(pointInQuarterCircle({ x: 5, y: -5 }, center, radius, 'bottom-right')).toBe(false)
    })

    it('returns false for a point in correct quadrant but outside radius', () => {
      expect(pointInQuarterCircle({ x: 9, y: 9 }, center, radius, 'bottom-right')).toBe(false)
    })
  })
})

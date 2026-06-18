import { describe, expect, it } from 'vitest'

import type { Point, Rect } from '../types'
import { pointInPolygon, pointInRect, rectsOverlap } from './polygon'

// Rect: center={x:5,y:5}, width=4, height=4 → x∈[3,7], y∈[3,7]
const rect: Rect = { center: { x: 5, y: 5 }, width: 4, height: 4 }

describe('pointInRect', () => {
  it('returns true for center point', () => {
    expect(pointInRect({ x: 5, y: 5 }, rect)).toBe(true)
  })

  it('returns true for a point clearly inside', () => {
    expect(pointInRect({ x: 4, y: 4 }, rect)).toBe(true)
  })

  it('returns true for a point on the left edge (inclusive)', () => {
    expect(pointInRect({ x: 3, y: 5 }, rect)).toBe(true)
  })

  it('returns true for a point on the right edge (inclusive)', () => {
    expect(pointInRect({ x: 7, y: 5 }, rect)).toBe(true)
  })

  it('returns true for a point on the top edge (inclusive)', () => {
    expect(pointInRect({ x: 5, y: 3 }, rect)).toBe(true)
  })

  it('returns true for a point on the bottom edge (inclusive)', () => {
    expect(pointInRect({ x: 5, y: 7 }, rect)).toBe(true)
  })

  it('returns true for a corner point (inclusive)', () => {
    expect(pointInRect({ x: 3, y: 3 }, rect)).toBe(true)
  })

  it('returns false for a point outside left', () => {
    expect(pointInRect({ x: 2, y: 5 }, rect)).toBe(false)
  })

  it('returns false for a point outside right', () => {
    expect(pointInRect({ x: 8, y: 5 }, rect)).toBe(false)
  })

  it('returns false for a point outside top', () => {
    expect(pointInRect({ x: 5, y: 1 }, rect)).toBe(false)
  })

  it('returns false for a point outside bottom', () => {
    expect(pointInRect({ x: 5, y: 10 }, rect)).toBe(false)
  })
})

describe('rectsOverlap', () => {
  // rectA: x∈[3,7], y∈[3,7]
  const rectA: Rect = { center: { x: 5, y: 5 }, width: 4, height: 4 }

  it('returns true for identical rects', () => {
    expect(rectsOverlap(rectA, rectA)).toBe(true)
  })

  it('returns true for partially overlapping rects', () => {
    // rectB: x∈[5,9], y∈[3,7] — overlaps in x∈[5,7]
    const rectB: Rect = { center: { x: 7, y: 5 }, width: 4, height: 4 }
    expect(rectsOverlap(rectA, rectB)).toBe(true)
  })

  it('returns true for rects that share only an edge', () => {
    // rectB: x∈[7,11], y∈[3,7] — touches at x=7
    const rectB: Rect = { center: { x: 9, y: 5 }, width: 4, height: 4 }
    expect(rectsOverlap(rectA, rectB)).toBe(true)
  })

  it('returns false for clearly separated rects (horizontal)', () => {
    // rectB: x∈[9,13] — gap between x=7 and x=9
    const rectB: Rect = { center: { x: 11, y: 5 }, width: 4, height: 4 }
    expect(rectsOverlap(rectA, rectB)).toBe(false)
  })

  it('returns false for clearly separated rects (vertical)', () => {
    // rectB: y∈[9,13] — gap between y=7 and y=9
    const rectB: Rect = { center: { x: 5, y: 11 }, width: 4, height: 4 }
    expect(rectsOverlap(rectA, rectB)).toBe(false)
  })

  it('returns false for rects separated diagonally', () => {
    const rectB: Rect = { center: { x: 15, y: 15 }, width: 4, height: 4 }
    expect(rectsOverlap(rectA, rectB)).toBe(false)
  })
})

describe('pointInPolygon', () => {
  // Simple square: (0,0),(10,0),(10,10),(0,10)
  const square: Point[] = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ]

  it('returns true for a point clearly inside', () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true)
  })

  it('returns true for a point near but inside the boundary', () => {
    expect(pointInPolygon({ x: 1, y: 1 }, square)).toBe(true)
  })

  it('returns false for a point clearly outside', () => {
    expect(pointInPolygon({ x: 15, y: 15 }, square)).toBe(false)
  })

  it('returns false for a point left of the polygon', () => {
    expect(pointInPolygon({ x: -1, y: 5 }, square)).toBe(false)
  })

  it('returns false for a point above the polygon', () => {
    expect(pointInPolygon({ x: 5, y: -1 }, square)).toBe(false)
  })

  // L-shaped polygon
  const lShape: Point[] = [
    { x: 0, y: 0 },
    { x: 6, y: 0 },
    { x: 6, y: 4 },
    { x: 3, y: 4 },
    { x: 3, y: 8 },
    { x: 0, y: 8 },
  ]

  it('returns true for a point inside the L-shape (lower-right section)', () => {
    expect(pointInPolygon({ x: 5, y: 2 }, lShape)).toBe(true)
  })

  it('returns true for a point inside the L-shape (upper-left section)', () => {
    expect(pointInPolygon({ x: 1, y: 6 }, lShape)).toBe(true)
  })

  it('returns false for the concave cut-out region of L-shape', () => {
    expect(pointInPolygon({ x: 5, y: 6 }, lShape)).toBe(false)
  })
})

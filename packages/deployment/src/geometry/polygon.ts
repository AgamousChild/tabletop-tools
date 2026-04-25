import type { Point, Rect } from '../types'

/** Returns the axis-aligned bounding box corners for a Rect. */
function rectBounds(r: Rect): { minX: number; maxX: number; minY: number; maxY: number } {
  const hw = r.width / 2
  const hh = r.height / 2
  return {
    minX: r.center.x - hw,
    maxX: r.center.x + hw,
    minY: r.center.y - hh,
    maxY: r.center.y + hh,
  }
}

/** AABB containment test, inclusive of edges. */
export function pointInRect(p: Point, r: Rect): boolean {
  const { minX, maxX, minY, maxY } = rectBounds(r)
  return p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY
}

/** AABB overlap test, inclusive of shared edges. */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  const ba = rectBounds(a)
  const bb = rectBounds(b)
  return ba.minX <= bb.maxX && ba.maxX >= bb.minX && ba.minY <= bb.maxY && ba.maxY >= bb.minY
}

/**
 * Ray casting algorithm for point-in-polygon.
 * Counts the number of times a horizontal ray from p to +∞ crosses an edge.
 * Odd crossings = inside.
 */
export function pointInPolygon(p: Point, polygon: Point[]): boolean {
  const n = polygon.length
  let inside = false
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i]!.x
    const yi = polygon[i]!.y
    const xj = polygon[j]!.x
    const yj = polygon[j]!.y

    const intersects =
      yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi

    if (intersects) inside = !inside
  }
  return inside
}

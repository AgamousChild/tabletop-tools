import type { Point } from '../types'

/** Returns true if p is within radius of center (inclusive of boundary). */
export function pointInCircle(p: Point, center: Point, radius: number): boolean {
  const dx = p.x - center.x
  const dy = p.y - center.y
  return dx * dx + dy * dy <= radius * radius
}

/**
 * Returns true if p is within the given quarter-circle arc.
 * Used for Search and Destroy deployment exclusion zones.
 *
 * Coordinate convention: x increases right, y increases down.
 * - top-left:     x <= center.x AND y <= center.y
 * - top-right:    x >= center.x AND y <= center.y
 * - bottom-left:  x <= center.x AND y >= center.y
 * - bottom-right: x >= center.x AND y >= center.y
 */
export function pointInQuarterCircle(
  p: Point,
  center: Point,
  radius: number,
  quadrant: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right',
): boolean {
  if (!pointInCircle(p, center, radius)) return false

  const dx = p.x - center.x
  const dy = p.y - center.y

  switch (quadrant) {
    case 'top-left':
      return dx <= 0 && dy <= 0
    case 'top-right':
      return dx >= 0 && dy <= 0
    case 'bottom-left':
      return dx <= 0 && dy >= 0
    case 'bottom-right':
      return dx >= 0 && dy >= 0
  }
}

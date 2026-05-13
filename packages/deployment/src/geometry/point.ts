import type { Point } from '../types'

/** Euclidean distance between two points. */
export function distance(a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return Math.sqrt(dx * dx + dy * dy)
}

/** Returns a new point offset from p by (dx, dy). Does not mutate p. */
export function offset(p: Point, dx: number, dy: number): Point {
  return { x: p.x + dx, y: p.y + dy }
}

/** Returns the midpoint between two points. */
export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

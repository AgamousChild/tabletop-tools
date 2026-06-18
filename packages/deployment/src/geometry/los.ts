import type { LineSegment, Point, Rect, TerrainPiece } from '../types'
import { pointInRect } from './polygon'

/**
 * Returns the four edges of a Rect as line segments.
 * Edges: top, bottom, left, right.
 */
function rectEdges(rect: Rect): LineSegment[] {
  const hw = rect.width / 2
  const hh = rect.height / 2
  const { x, y } = rect.center
  const tl: Point = { x: x - hw, y: y - hh }
  const tr: Point = { x: x + hw, y: y - hh }
  const bl: Point = { x: x - hw, y: y + hh }
  const br: Point = { x: x + hw, y: y + hh }
  return [
    { a: tl, b: tr }, // top
    { a: bl, b: br }, // bottom
    { a: tl, b: bl }, // left
    { a: tr, b: br }, // right
  ]
}

/**
 * Cross product of 2D vectors (p1→p2) and (p1→p3).
 * Positive = p3 is to the left of p1→p2.
 * Negative = p3 is to the right.
 * Zero = collinear.
 */
function cross(p1: Point, p2: Point, p3: Point): number {
  return (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x)
}

/**
 * Returns true if point p lies on the segment [a, b] (assumes collinear).
 */
function onSegment(a: Point, b: Point, p: Point): boolean {
  return (
    Math.min(a.x, b.x) <= p.x &&
    p.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= p.y &&
    p.y <= Math.max(a.y, b.y)
  )
}

/**
 * Tests whether two line segments (p1–p2) and (p3–p4) intersect.
 * Handles the collinear/touching endpoint cases.
 */
function segmentsIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const d1 = cross(p3, p4, p1)
  const d2 = cross(p3, p4, p2)
  const d3 = cross(p1, p2, p3)
  const d4 = cross(p1, p2, p4)

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true
  }

  if (d1 === 0 && onSegment(p3, p4, p1)) return true
  if (d2 === 0 && onSegment(p3, p4, p2)) return true
  if (d3 === 0 && onSegment(p1, p2, p3)) return true
  if (d4 === 0 && onSegment(p1, p2, p4)) return true

  return false
}

/**
 * Returns true if the line segment crosses any edge of the rectangle.
 */
export function lineIntersectsRect(line: LineSegment, rect: Rect): boolean {
  return rectEdges(rect).some((edge) => segmentsIntersect(line.a, line.b, edge.a, edge.b))
}

/**
 * Determines whether `from` has line of sight to `to`, given the terrain.
 *
 * Rules:
 * - If both points are inside the same LOS-blocking terrain piece → true (can see each other)
 * - If the target is inside a LOS-blocking terrain piece and the shooter is outside → false (hidden)
 * - If any LOS-blocking terrain footprint edge crosses the line → false (blocked)
 * - Otherwise → true
 */
export function hasLOS(from: Point, to: Point, terrain: TerrainPiece[]): boolean {
  const losBlockers = terrain.filter((t) => t.losBlocking)

  for (const piece of losBlockers) {
    const fromInside = pointInRect(from, piece.footprint)
    const toInside = pointInRect(to, piece.footprint)

    // Both inside same terrain: always visible
    if (fromInside && toInside) return true

    // Target is hidden inside terrain, shooter is outside
    if (toInside && !fromInside) return false
  }

  // Check if any LOS-blocking terrain's footprint edge crosses the LOS line
  const line: LineSegment = { a: from, b: to }
  for (const piece of losBlockers) {
    const fromInside = pointInRect(from, piece.footprint)

    // If the shooter is inside this terrain, the edges of this terrain don't block
    // their outgoing LOS (they're already inside — they can shoot out)
    if (fromInside) continue

    if (lineIntersectsRect(line, piece.footprint)) return false
  }

  return true
}

/**
 * Returns true if the target is hidden from every position in the positions array.
 * A target is "visible" from a position if hasLOS returns true.
 */
export function isHiddenFromAllPositions(
  target: Point,
  positions: Point[],
  terrain: TerrainPiece[],
): boolean {
  return positions.every((pos) => !hasLOS(pos, target, terrain))
}

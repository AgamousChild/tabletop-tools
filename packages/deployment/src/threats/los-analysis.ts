import type { TerrainPiece, Point } from '../types'
import type { DeploymentZone } from '../zones/deployment-zones'
import { distance } from '../geometry/point'

const MM_PER_INCH = 25.4

/**
 * Finds terrain pieces relevant for hiding in or near the deployment zone.
 *
 * A terrain piece qualifies if:
 *  1. Its center is inside the zone (deploy directly into it), OR
 *  2. `scoutRange` is provided and its center is within `scoutRange` of the
 *     nearest point on the zone boundary (can scout into it).
 *
 * Zone boundary proximity is approximated by finding the closest point on the
 * zone bounding box to the terrain center; if within scoutRange AND the piece
 * is NOT already inside the zone, it is included via the scout condition.
 */
export function findHidingSpots(
  terrain: TerrainPiece[],
  zone: DeploymentZone,
  scoutRange?: number,
): TerrainPiece[] {
  return terrain.filter((piece) => {
    const center = piece.footprint.center

    // Condition 1: terrain center is directly inside the zone
    if (zone.contains(center)) return true

    // Condition 2: within scout range of the zone boundary
    if (scoutRange !== undefined) {
      const distToZone = distanceToBoundsEdge(center, zone)
      if (distToZone <= scoutRange) return true
    }

    return false
  })
}

/**
 * Estimates how many models with `baseSizeMm` bases fit inside a terrain piece.
 *
 * Calculation:
 *  - Terrain footprint area in sq inches
 *  - Base circle area in sq inches (diameter = baseSizeMm / 25.4)
 *  - Divide, floor, return at least 1
 */
export function estimateTerrainCapacity(
  terrain: TerrainPiece,
  baseSizeMm: number,
): number {
  const footprintArea = terrain.footprint.width * terrain.footprint.height
  const baseDiameterIn = baseSizeMm / MM_PER_INCH
  const baseRadius = baseDiameterIn / 2
  const baseArea = Math.PI * baseRadius * baseRadius
  const raw = Math.floor(footprintArea / baseArea)
  return Math.max(1, raw)
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Approximate distance from a point to the nearest edge of the zone bounding
 * box. Used for scout-range checks on terrain outside the zone.
 *
 * Returns 0 if the point is inside the bounding box (covered by zone.contains).
 */
function distanceToBoundsEdge(p: Point, zone: DeploymentZone): number {
  const { bounds } = zone
  const hw = bounds.width / 2
  const hh = bounds.height / 2
  const minX = bounds.center.x - hw
  const maxX = bounds.center.x + hw
  const minY = bounds.center.y - hh
  const maxY = bounds.center.y + hh

  // Clamp p to the bounding box to find the closest point on/in the box
  const closestX = Math.max(minX, Math.min(maxX, p.x))
  const closestY = Math.max(minY, Math.min(maxY, p.y))

  return distance(p, { x: closestX, y: closestY })
}

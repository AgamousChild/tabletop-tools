import type { Point, GameRulesConfig } from '../types'
import type { DeploymentZone } from './deployment-zones'
import { distance } from '../geometry/point'

// ── Shared helpers ────────────────────────────────────────────────────────────

/**
 * Returns true if the point is more than `minDistance` inches from ALL enemy models.
 * Exclusive: a point exactly `minDistance` away is NOT valid.
 */
function clearOfEnemyModels(point: Point, enemyModels: Point[], minDistance: number): boolean {
  return enemyModels.every((model) => distance(point, model) > minDistance)
}

/**
 * Estimates the minimum distance from `point` to the nearest point inside
 * `enemyZone` by sampling the zone's bounding box edges and using the
 * bounding box clamping approach.
 *
 * This is a practical approximation: it finds the nearest point on the
 * enemy zone's bounding box AABB, which serves as a lower-bound on the
 * true distance to the zone (the zone may be smaller than the bounding box
 * due to arc exclusions, so the true nearest point could be further away).
 *
 * For safety (conservative: fewer false "clear" results), we use the bounding
 * box distance as the estimate. If the distance to the bounding box is > threshold,
 * the point is definitely clear. If it is <= threshold, we consider the point too
 * close (even if the actual zone boundary is slightly further due to the arc).
 *
 * This matches the task's guidance: "check distance from the candidate point
 * to the enemy zone bounding box edges."
 */
function distanceToZoneBounds(point: Point, zone: DeploymentZone): number {
  const { center, width, height } = zone.bounds
  const hw = width / 2
  const hh = height / 2

  const minX = center.x - hw
  const maxX = center.x + hw
  const minY = center.y - hh
  const maxY = center.y + hh

  // Clamp point to AABB to find nearest point on/in the bounding box
  const clampedX = Math.max(minX, Math.min(maxX, point.x))
  const clampedY = Math.max(minY, Math.min(maxY, point.y))

  return distance(point, { x: clampedX, y: clampedY })
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns true if an Infiltrator unit can be placed at `point`.
 *
 * Requirements (40K 10e, p. 44):
 *   1. More than `rules.infiltratorExclusionModels` (9") from all enemy models.
 *   2. More than `rules.infiltratorExclusionZone` (9") from the enemy deployment zone.
 *
 * Zone distance is approximated via bounding box distance (see `distanceToZoneBounds`).
 */
export function canInfiltrate(
  point: Point,
  enemyModels: Point[],
  enemyZone: DeploymentZone,
  rules: GameRulesConfig,
): boolean {
  if (!clearOfEnemyModels(point, enemyModels, rules.infiltratorExclusionModels)) {
    return false
  }
  if (distanceToZoneBounds(point, enemyZone) <= rules.infiltratorExclusionZone) {
    return false
  }
  return true
}

/**
 * Returns true if a Scout unit can move to `point` after deployment.
 *
 * Requirements (40K 10e):
 *   1. More than `rules.scoutExclusionModels` (9") from all enemy models.
 *   2. No deployment zone restriction (scouts can move anywhere otherwise legal).
 */
export function canScoutMoveTo(
  point: Point,
  enemyModels: Point[],
  rules: GameRulesConfig,
): boolean {
  return clearOfEnemyModels(point, enemyModels, rules.scoutExclusionModels)
}

/**
 * Returns true if a unit can Deep Strike to `point`.
 *
 * Requirements (40K 10e):
 *   1. More than `rules.deepStrikeExclusion` (9") from all enemy models.
 *   2. No deployment zone restriction.
 */
export function canDeepStrike(
  point: Point,
  enemyModels: Point[],
  rules: GameRulesConfig,
): boolean {
  return clearOfEnemyModels(point, enemyModels, rules.deepStrikeExclusion)
}

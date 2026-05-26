import { distance } from '../geometry/point'
import type { BaseSize, GameRulesConfig, Point } from '../types'

// 1 inch = 25.4 mm

/**
 * Converts a base size (mm) to inches.
 *
 * Used to determine the physical footprint of a model for overlap checking.
 * 'oval-75x42' uses the larger 75mm dimension (2.953"). 'hull' is approximated at 3".
 */
export function baseSizeInches(base: BaseSize): number {
  if (base === 'oval-75x42') return 75 / 25.4
  if (base === 'hull') return 3
  return (base as number) / 25.4
}

/**
 * Returns true if the given model positions form a coherent unit per 40K 10e rules.
 *
 * Algorithm:
 *   - 0 models: incoherent (invalid unit)
 *   - 1 model:  always coherent
 *   - < largeUnitThreshold models: each model must have >= minConnections (1) neighbor within
 *     coherency.distance inches
 *   - >= largeUnitThreshold models: each model must have >= minConnectionsLarge (2) neighbors
 *
 * Distance is measured center-to-center. Models are "connected" if distance is STRICTLY
 * less than rules.coherency.distance (exclusive boundary — exactly 2" is not coherent).
 */
export function isCoherent(positions: Point[], rules: GameRulesConfig): boolean {
  const n = positions.length
  if (n === 0) return false
  if (n === 1) return true

  const {
    distance: coherencyDist,
    minConnections,
    minConnectionsLarge,
    largeUnitThreshold,
  } = rules.coherency
  const requiredConnections = n >= largeUnitThreshold ? minConnectionsLarge : minConnections

  for (let i = 0; i < n; i++) {
    let neighborCount = 0
    for (let j = 0; j < n; j++) {
      if (i === j) continue
      if (distance(positions[i]!, positions[j]!) < coherencyDist) {
        neighborCount++
      }
    }
    if (neighborCount < requiredConnections) return false
  }

  return true
}

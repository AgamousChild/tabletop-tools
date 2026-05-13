import type { Point, TerrainPiece, GameRulesConfig, BaseSize } from '../types'
import type { DeploymentZone } from '../zones/deployment-zones'
import { canInfiltrate } from '../zones/exclusion-zones'
import { distance } from '../geometry/point'
import { isCoherent } from './coherency'
import { baseSizeInches } from './coherency'

/**
 * Returns true if the given model positions constitute a legal placement on the board.
 *
 * Checks (in order):
 * 1. Every position is inside the deployment zone (for 'deploy' method).
 * 2. No position is within `baseSizeInches(baseSize)` of any already-placed model (no physical overlap).
 * 3. Coherency passes.
 * 4. If method is 'infiltrate': each position passes `canInfiltrate()`.
 *
 * Note: terrain overlap is NOT checked — models can be inside ruins per 40K rules.
 */
export function isLegalPlacement(
  positions: Point[],
  zone: DeploymentZone,
  terrain: TerrainPiece[],
  occupiedPositions: Point[],
  baseSize: BaseSize,
  rules: GameRulesConfig,
  options?: {
    method?: 'deploy' | 'infiltrate'
    enemyModels?: Point[]
    enemyZone?: DeploymentZone
  },
): boolean {
  const method = options?.method ?? 'deploy'

  // 1. Zone containment
  for (const pos of positions) {
    if (!zone.contains(pos)) return false
  }

  // 2. No physical overlap with already-placed models
  const baseRadius = baseSizeInches(baseSize)
  for (const pos of positions) {
    for (const occupied of occupiedPositions) {
      if (distance(pos, occupied) < baseRadius) return false
    }
  }

  // 3. Coherency
  if (!isCoherent(positions, rules)) return false

  // 4. Infiltrate restriction
  if (method === 'infiltrate') {
    const enemyModels = options?.enemyModels ?? []
    const enemyZone = options?.enemyZone
    if (!enemyZone) return false
    for (const pos of positions) {
      if (!canInfiltrate(pos, enemyModels, enemyZone, rules)) return false
    }
  }

  // Suppress unused parameter warning for terrain (terrain overlap not checked per rules)
  void terrain

  return true
}

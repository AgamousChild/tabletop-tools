import type { EnemyUnit, GameRulesConfig, TerrainPiece, ThreatOverlay, Point } from '../types'
import type { DeploymentZone } from '../zones/deployment-zones'
import { distance } from '../geometry/point'
import { hasLOS } from '../geometry/los'
import { maxShootingThreat, maxMeleeThreat, THREAT_WEIGHT } from './threat-range'

const DEFAULT_GRID_RESOLUTION = 2 // inches per cell
const SAMPLE_STEP = 3 // inches between sampled enemy positions

/**
 * Sample positions from the enemy zone at SAMPLE_STEP intervals within bounds.
 * Only includes points that pass `zone.contains`.
 */
function sampleZonePositions(zone: DeploymentZone): Point[] {
  const { bounds } = zone
  const hw = bounds.width / 2
  const hh = bounds.height / 2
  const minX = bounds.center.x - hw
  const maxX = bounds.center.x + hw
  const minY = bounds.center.y - hh
  const maxY = bounds.center.y + hh

  const positions: Point[] = []
  for (let y = minY + SAMPLE_STEP / 2; y < maxY; y += SAMPLE_STEP) {
    for (let x = minX + SAMPLE_STEP / 2; x < maxX; x += SAMPLE_STEP) {
      const p: Point = { x, y }
      if (zone.contains(p)) positions.push(p)
    }
  }
  return positions
}

/**
 * Convert a grid cell index to world-space center coordinates.
 *
 * The board's origin (0,0) is at the table center.
 * Row 0 = top of board (y = -depth/2), col 0 = left (x = -width/2).
 */
function cellCenter(
  row: number,
  col: number,
  boardWidth: number,
  boardDepth: number,
  resolution: number,
): Point {
  const x = -boardWidth / 2 + (col + 0.5) * resolution
  const y = -boardDepth / 2 + (row + 0.5) * resolution
  return { x, y }
}

/**
 * Max ranged weapon range for a unit (ignoring melee weapons).
 * Returns 0 for melee-only units.
 */
function maxWeaponRange(unit: EnemyUnit): number {
  let max = 0
  for (const w of unit.weapons) {
    if (w.range === 'melee') continue
    if (w.range > max) max = w.range
  }
  return max
}

/**
 * Generate shooting and melee heat maps across the battlefield.
 *
 * Algorithm:
 *  1. Build a grid at `gridResolution` inches per cell.
 *  2. Sample positions from the enemy zone every SAMPLE_STEP inches.
 *  3. For each grid cell × each unit × each sampled enemy position:
 *     - Shooting: after moving (up to unit.move), can the enemy shoot at this cell?
 *       Simplification: we advance the enemy position toward the cell by unit.move,
 *       then check if maxWeaponRange reaches, and hasLOS.
 *     - Melee: if dist(enemyPos, cell) <= maxMeleeThreat, threat is present.
 *  4. Accumulate score weighted by unit.threatLevel.
 */
export function generateThreatMap(
  battlefield: { width: number; depth: number; terrain: TerrainPiece[] },
  enemyZone: DeploymentZone,
  enemyUnits: EnemyUnit[],
  rules: GameRulesConfig,
  gridResolution: number = DEFAULT_GRID_RESOLUTION,
): ThreatOverlay {
  const { width, depth, terrain } = battlefield
  const numRows = Math.ceil(depth / gridResolution)
  const numCols = Math.ceil(width / gridResolution)

  // Initialise heat maps to zero
  const shootingHeatMap: number[][] = Array.from({ length: numRows }, () =>
    Array.from<number>({ length: numCols }).fill(0),
  )
  const meleeHeatMap: number[][] = Array.from({ length: numRows }, () =>
    Array.from<number>({ length: numCols }).fill(0),
  )

  if (enemyUnits.length === 0) {
    return { shootingHeatMap, meleeHeatMap, gridResolution }
  }

  const enemyPositions = sampleZonePositions(enemyZone)
  if (enemyPositions.length === 0) {
    return { shootingHeatMap, meleeHeatMap, gridResolution }
  }

  for (let row = 0; row < numRows; row++) {
    for (let col = 0; col < numCols; col++) {
      const cell = cellCenter(row, col, width, depth, gridResolution)

      for (const unit of enemyUnits) {
        const weight = THREAT_WEIGHT[unit.threatLevel]
        const weaponRange = maxWeaponRange(unit)
        const meleeThreat = maxMeleeThreat(unit, rules)
        const shootingThreat = maxShootingThreat(unit, rules)

        for (const enemyPos of enemyPositions) {
          const dist = distance(enemyPos, cell)

          // ── Shooting threat ───────────────────────────────────────────────
          // The enemy can move up to unit.move toward the cell, then shoot.
          // Effective threat = the enemy moved as close as possible, then weapon range.
          // We approximate: if dist <= shootingThreat (move + range), they can threaten.
          // Then check LOS from the advanced position toward the cell.
          if (weaponRange > 0 && dist <= shootingThreat) {
            // Project enemy position toward the cell by unit.move (clamped)
            const moveAmount = Math.min(unit.move, dist)
            const dx = cell.x - enemyPos.x
            const dy = cell.y - enemyPos.y
            const distToCell = dist // same as dist
            const advancedPos: Point =
              distToCell > 0
                ? {
                    x: enemyPos.x + (dx / distToCell) * moveAmount,
                    y: enemyPos.y + (dy / distToCell) * moveAmount,
                  }
                : enemyPos

            if (hasLOS(advancedPos, cell, terrain)) {
              shootingHeatMap[row]![col] += weight
            }
          }

          // ── Melee threat ──────────────────────────────────────────────────
          if (dist <= meleeThreat) {
            meleeHeatMap[row]![col] += weight
          }
        }
      }
    }
  }

  return { shootingHeatMap, meleeHeatMap, gridResolution }
}

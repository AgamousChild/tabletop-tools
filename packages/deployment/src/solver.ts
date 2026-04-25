import type {
  DeploymentInput,
  DeploymentPlan,
  DeploymentUnit,
  FormationType,
  ModelPlacement,
  Point,
  UnitPlacement,
} from './types'
import { computeDeploymentZone, computeEnemyZone } from './zones/deployment-zones'
import type { DeploymentZone } from './zones/deployment-zones'
import { generateThreatMap } from './threats/threat-map'
import { findHidingSpots } from './threats/los-analysis'
import { classifyObjectives } from './objectives/classify'
import { assignRoles } from './units/role-assignment'
import { computeDropOrder } from './units/drop-order'
import { generateFormations } from './placement/formations'
import type { Formation } from './placement/formations'
import { isLegalPlacement } from './placement/legal-check'
import { scorePosition } from './placement/scoring'
import type { ScoringContext } from './placement/scoring'
import { distance } from './geometry/point'

// ── Constants ────────────────────────────────────────────────────────────────

/** Spacing (inches) between sampled candidate positions in the deployment zone. */
const CANDIDATE_GRID_STEP = 3

/** Spacing (inches) for infiltrator candidate positions (wider area, coarser grid). */
const INFILTRATOR_GRID_STEP = 3

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Sample candidate center positions from a zone on a regular grid.
 * Returns only points where `zone.contains()` is true.
 */
function samplePositions(zone: DeploymentZone, step: number): Point[] {
  const { bounds } = zone
  const hw = bounds.width / 2
  const hh = bounds.height / 2
  const minX = bounds.center.x - hw
  const maxX = bounds.center.x + hw
  const minY = bounds.center.y - hh
  const maxY = bounds.center.y + hh

  const positions: Point[] = []
  for (let y = minY + step / 2; y < maxY; y += step) {
    for (let x = minX + step / 2; x < maxX; x += step) {
      const p: Point = { x, y }
      if (zone.contains(p)) positions.push(p)
    }
  }
  return positions
}

/**
 * Build an expanded zone for infiltrators: covers the full board minus the enemy zone.
 * Infiltrators can deploy anywhere on the board that passes `canInfiltrate` checks
 * (which `isLegalPlacement` handles via the 'infiltrate' method).
 */
function makeInfiltrateZone(
  tableWidth: number,
  tableDepth: number,
  enemyZone: DeploymentZone,
): DeploymentZone {
  const hw = tableWidth / 2
  const hd = tableDepth / 2
  return {
    contains: (p: Point) => {
      // Must be on the board
      if (p.x <= -hw || p.x >= hw || p.y <= -hd || p.y >= hd) return false
      // Must NOT be in the enemy zone
      return !enemyZone.contains(p)
    },
    bounds: {
      center: { x: 0, y: 0 },
      width: tableWidth,
      height: tableDepth,
    },
  }
}

/**
 * Translate a formation's relative positions to absolute world-space given a center point.
 */
function translateFormation(center: Point, formation: Formation): Point[] {
  return formation.positions.map((p) => ({
    x: center.x + p.x,
    y: center.y + p.y,
  }))
}

/**
 * Build ModelPlacement array from world-space positions.
 */
function toModelPlacements(worldPositions: Point[]): ModelPlacement[] {
  return worldPositions.map((pos, i) => ({
    modelIndex: i,
    position: pos,
  }))
}

/**
 * Get all embarked unit IDs from the army's transport declarations.
 */
function getEmbarkedUnitIds(input: DeploymentInput): Set<string> {
  const ids = new Set<string>()
  for (const transport of input.army.transports) {
    for (const id of transport.embarkedUnitIds) {
      ids.add(id)
    }
  }
  return ids
}

// ── Solver ───────────────────────────────────────────────────────────────────

/**
 * Top-level deployment solver. Orchestrates all 9 phases of the deployment algorithm:
 *
 * 1. Calculate deployment zones
 * 2. Build threat map
 * 3. Classify objectives
 * 4. Assign unit roles
 * 5. Compute drop order
 * 6-9. Place each unit (or assign to reserves)
 *
 * Returns a complete DeploymentPlan.
 */
export function solveDeployment(input: DeploymentInput): DeploymentPlan {
  const { rules, battlefield, enemy } = input

  // ── Phase 1: Calculate Zones ─────────────────────────────────────────────
  const zoneOpts = {
    type: battlefield.deploymentType,
    playerZone: battlefield.playerZone,
    tableWidth: battlefield.width,
    tableDepth: battlefield.depth,
  }
  const playerZone = computeDeploymentZone(zoneOpts)
  const enemyZone = computeEnemyZone(zoneOpts)

  // ── Phase 2: Build Threat Map ────────────────────────────────────────────
  const threats = generateThreatMap(
    { width: battlefield.width, depth: battlefield.depth, terrain: battlefield.terrain },
    enemyZone,
    enemy.units,
    rules,
  )

  // ── Phase 3: Classify Objectives ─────────────────────────────────────────
  const objectives = classifyObjectives(battlefield.objectives, playerZone, enemyZone)

  // ── Phase 4: Assign Unit Roles ───────────────────────────────────────────
  const unitsWithRoles = assignRoles(input.army.units)

  // ── Phase 5: Compute Drop Order ──────────────────────────────────────────
  const dropOrder = computeDropOrder(unitsWithRoles)

  // ── Phase 6-9: Place Units ───────────────────────────────────────────────
  const embarkedIds = getEmbarkedUnitIds(input)
  const occupiedPositions: Point[] = []
  const placements: UnitPlacement[] = []

  // Pre-compute zones for infiltrators
  const infiltrateZone = makeInfiltrateZone(battlefield.width, battlefield.depth, enemyZone)

  // Scoring context (shared across all placements)
  const scoringContext: ScoringContext = {
    battlefield: {
      width: battlefield.width,
      depth: battlefield.depth,
      terrain: battlefield.terrain,
    },
    objectives,
    threats,
    enemyZone,
    occupiedPositions,
    rules,
  }

  for (const unitId of dropOrder) {
    const unit = unitsWithRoles.find((u) => u.id === unitId)
    if (!unit) continue

    // Skip embarked units — they ride inside their transport
    if (embarkedIds.has(unitId)) {
      continue
    }

    // Deep strike units go to reserves
    if (unit.tacticalRole === 'deep-strike') {
      placements.push({
        unitId,
        formation: 'block',
        models: [],
        reasoning: `${unit.name} held in reserves for deep strike arrival`,
        deploymentMethod: 'deploy',
        reservesCandidate: true,
        reservesReason: 'Deep strike unit — arrives from reserves',
      })
      continue
    }

    // Determine which zone and method to use
    const isInfiltrator = unit.tacticalRole === 'infiltrator'
    const deployZone = isInfiltrator ? infiltrateZone : playerZone
    const deployMethod: 'deploy' | 'infiltrate' = isInfiltrator ? 'infiltrate' : 'deploy'

    // Generate candidate positions
    const step = isInfiltrator ? INFILTRATOR_GRID_STEP : CANDIDATE_GRID_STEP
    const candidatePositions = samplePositions(deployZone, step)

    // Generate formation options
    const formations = generateFormations(unit.models, unit.baseSize, rules)
    if (formations.length === 0) continue

    // Evaluate all position × formation combinations
    let bestScore = -Infinity
    let bestCenter: Point | null = null
    let bestFormation: Formation | null = null
    let bestWorldPositions: Point[] | null = null

    for (const center of candidatePositions) {
      for (const formation of formations) {
        const worldPositions = translateFormation(center, formation)

        // Check legality
        const legal = isLegalPlacement(
          worldPositions,
          deployZone,
          battlefield.terrain,
          occupiedPositions,
          unit.baseSize,
          rules,
          isInfiltrator
            ? { method: 'infiltrate', enemyModels: [], enemyZone }
            : undefined,
        )
        if (!legal) continue

        // Score
        const score = scorePosition(center, formation, unit, scoringContext)
        if (score.total > bestScore) {
          bestScore = score.total
          bestCenter = center
          bestFormation = formation
          bestWorldPositions = worldPositions
        }
      }
    }

    if (bestCenter && bestFormation && bestWorldPositions) {
      // For scout units, check if there's a better hiding spot within scout range
      let scoutDestination: Point | undefined
      if (unit.tacticalRole === 'scout' && unit.abilities.scouts !== undefined) {
        scoutDestination = findScoutDestination(
          bestCenter,
          unit,
          battlefield.terrain,
          playerZone,
          unit.abilities.scouts,
        )
      }

      placements.push({
        unitId,
        formation: bestFormation.type,
        models: toModelPlacements(bestWorldPositions),
        reasoning: buildReasoning(unit, bestCenter, bestFormation.type, bestScore),
        deploymentMethod: deployMethod,
        scoutDestination,
        reservesCandidate: false,
      })

      // Record occupied positions for subsequent units
      for (const pos of bestWorldPositions) {
        occupiedPositions.push(pos)
      }
    } else {
      // Fallback: could not find a legal position — mark as reserves candidate
      placements.push({
        unitId,
        formation: 'block',
        models: [],
        reasoning: `${unit.name} could not be legally placed — assigned to reserves`,
        deploymentMethod: 'deploy',
        reservesCandidate: true,
        reservesReason: 'No legal placement found within deployment zone',
      })
    }
  }

  // ── Build Plan ─────────────────────────────────────────────────────────────
  const placedCount = placements.filter((p) => p.models.length > 0).length
  const reservesCount = placements.filter((p) => p.reservesCandidate).length

  return {
    placements,
    dropOrder,
    objectives,
    threats,
    reasoning: `Deployment plan for ${input.army.units.length} units: ${placedCount} placed on table, ${reservesCount} in reserves.`,
  }
}

// ── Scout destination ────────────────────────────────────────────────────────

/**
 * After placing a scout unit, check if there's a hiding spot (LOS-blocking terrain)
 * within scout range that the unit could move to pre-game.
 * Returns the terrain center if found, undefined otherwise.
 */
function findScoutDestination(
  deployCenter: Point,
  unit: DeploymentUnit,
  terrain: import('./types').TerrainPiece[],
  playerZone: DeploymentZone,
  scoutRange: number,
): Point | undefined {
  const hidingSpots = findHidingSpots(terrain, playerZone, scoutRange)

  let bestSpot: Point | undefined
  let bestDist = Infinity

  for (const spot of hidingSpots) {
    const spotCenter = spot.footprint.center
    const dist = distance(deployCenter, spotCenter)
    // Must be within scout range and closer to the board center (more aggressive)
    if (dist <= scoutRange && dist < bestDist) {
      // Prefer spots closer to the board center (y closer to 0)
      const boardCenterDist = distance(spotCenter, { x: 0, y: 0 })
      if (boardCenterDist < distance(deployCenter, { x: 0, y: 0 })) {
        bestDist = dist
        bestSpot = spotCenter
      }
    }
  }

  return bestSpot
}

// ── Reasoning ────────────────────────────────────────────────────────────────

function buildReasoning(
  unit: DeploymentUnit,
  center: Point,
  formation: FormationType,
  score: number,
): string {
  const role = unit.tacticalRole ?? 'unknown'
  const x = Math.round(center.x * 10) / 10
  const y = Math.round(center.y * 10) / 10
  return `Placed ${unit.name} at (${x}, ${y}) in ${formation} formation as ${role} (score: ${score})`
}

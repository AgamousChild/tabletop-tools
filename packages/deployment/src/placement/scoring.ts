import { hasLOS, isHiddenFromAllPositions } from '../geometry/los'
import { distance } from '../geometry/point'
import { pointInRect } from '../geometry/polygon'
import type {
  DeploymentUnit,
  GameRulesConfig,
  Objective,
  Point,
  TerrainPiece,
  ThreatOverlay,
} from '../types'
import type { DeploymentZone } from '../zones/deployment-zones'
import type { Formation } from './formations'

// ── Public types ──────────────────────────────────────────────────────────────

export interface PositionScore {
  cover: number // 0-10: how well hidden from enemy shooting
  threatExposure: number // 0-10: how many enemy units can reach (lower = safer, inverted)
  chargeThreat: number // 0-10: melee threat specifically (lower = safer, inverted)
  objectiveProximity: number // 0-10: closeness to relevant objective
  firingLanes: number // 0-10: for shooting units, how many targets reachable
  screenCoverage: number // 0-10: deep strike denial area
  infiltratorDenial: number // 0-10: blocks enemy infiltrator positions
  scoutValue: number // 0-10: quality of post-scout position
  counterScout: number // 0-10: blocks enemy scout destinations
  turn1Survival: number // 0-10: survives if opponent goes first
  roleFit: number // 0-10: position matches unit's tactical role
  total: number // weighted sum, normalised to 0-100
}

export interface ScoringContext {
  battlefield: {
    width: number
    depth: number
    terrain: TerrainPiece[]
  }
  objectives: Objective[]
  threats: ThreatOverlay
  enemyZone: DeploymentZone
  occupiedPositions: Point[]
  rules: GameRulesConfig
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ENEMY_SAMPLE_STEP = 4 // inches between sampled enemy positions for LOS checks
const MAX_OBJECTIVE_DISTANCE = 30 // inches — beyond this, score = 0
const DEEP_STRIKE_EXCLUSION_RADIUS = 9 // standard 9" bubble

// ── Heat-map lookup ───────────────────────────────────────────────────────────

/**
 * Convert a world-space point to grid row/col indices.
 *
 * Board origin is at table center. Row 0 = y = -depth/2, col 0 = x = -width/2.
 */
function worldToCell(
  p: Point,
  boardWidth: number,
  boardDepth: number,
  resolution: number,
): { row: number; col: number } {
  const col = Math.floor((p.x + boardWidth / 2) / resolution)
  const row = Math.floor((p.y + boardDepth / 2) / resolution)
  return { row, col }
}

/**
 * Look up the heat-map value at a world-space point.
 * Returns 0 if the point is outside the map bounds.
 */
function lookupHeatMap(
  heatMap: number[][],
  p: Point,
  boardWidth: number,
  boardDepth: number,
  resolution: number,
): number {
  const { row, col } = worldToCell(p, boardWidth, boardDepth, resolution)
  const numRows = heatMap.length
  const numCols = heatMap[0]?.length ?? 0
  if (row < 0 || row >= numRows || col < 0 || col >= numCols) return 0
  return heatMap[row]![col]!
}

/**
 * Find the maximum value in a heat map.
 */
function heatMapMax(heatMap: number[][]): number {
  let max = 0
  for (const row of heatMap) {
    for (const val of row) {
      if (val > max) max = val
    }
  }
  return max
}

// ── Enemy zone sampling ───────────────────────────────────────────────────────

/**
 * Sample positions from the enemy zone at ENEMY_SAMPLE_STEP intervals.
 */
function sampleEnemyPositions(enemyZone: DeploymentZone): Point[] {
  const { bounds } = enemyZone
  const hw = bounds.width / 2
  const hh = bounds.height / 2
  const minX = bounds.center.x - hw
  const maxX = bounds.center.x + hw
  const minY = bounds.center.y - hh
  const maxY = bounds.center.y + hh

  const positions: Point[] = []
  for (let y = minY + ENEMY_SAMPLE_STEP / 2; y < maxY; y += ENEMY_SAMPLE_STEP) {
    for (let x = minX + ENEMY_SAMPLE_STEP / 2; x < maxX; x += ENEMY_SAMPLE_STEP) {
      const p: Point = { x, y }
      if (enemyZone.contains(p)) positions.push(p)
    }
  }
  return positions
}

// ── World positions from formation ───────────────────────────────────────────

/**
 * Translate a formation's relative positions into world space given a center.
 */
function formationWorldPositions(center: Point, formation: Formation): Point[] {
  return formation.positions.map((p) => ({
    x: center.x + p.x,
    y: center.y + p.y,
  }))
}

// ── Individual scoring factors ────────────────────────────────────────────────

/**
 * Cover (0-10):
 * - Center inside any LOS-blocking terrain footprint → 10
 * - Hidden from ALL sampled enemy positions (behind terrain) → 8
 * - Hidden from >50% of enemy positions → 5
 * - Otherwise (open) → 1
 */
function scoreCover(center: Point, terrain: TerrainPiece[], enemyPositions: Point[]): number {
  // Check if center is inside any terrain footprint
  for (const piece of terrain) {
    if (pointInRect(center, piece.footprint)) return 10
  }

  // Check LOS from sampled enemy positions
  if (enemyPositions.length === 0) return 1

  if (isHiddenFromAllPositions(center, enemyPositions, terrain)) return 8

  const hiddenCount = enemyPositions.filter((pos) => !hasLOS(pos, center, terrain)).length
  const hiddenFraction = hiddenCount / enemyPositions.length

  if (hiddenFraction > 0.5) return 5
  return 1
}

/**
 * Threat Exposure (0-10, inverted — 10 means SAFE):
 * Normalize shooting heat map value at center: 0 threat → 10, max threat → 0.
 */
function scoreThreatExposure(
  center: Point,
  threats: ThreatOverlay,
  boardWidth: number,
  boardDepth: number,
): number {
  const value = lookupHeatMap(
    threats.shootingHeatMap,
    center,
    boardWidth,
    boardDepth,
    threats.gridResolution,
  )
  const max = heatMapMax(threats.shootingHeatMap)
  if (max === 0) return 10
  return Math.round((1 - value / max) * 10)
}

/**
 * Charge Threat (0-10, inverted — 10 means SAFE):
 * Normalize melee heat map value at center.
 */
function scoreChargeThreat(
  center: Point,
  threats: ThreatOverlay,
  boardWidth: number,
  boardDepth: number,
): number {
  const value = lookupHeatMap(
    threats.meleeHeatMap,
    center,
    boardWidth,
    boardDepth,
    threats.gridResolution,
  )
  const max = heatMapMax(threats.meleeHeatMap)
  if (max === 0) return 10
  return Math.round((1 - value / max) * 10)
}

/**
 * Objective Proximity (0-10):
 * - Find the closest objective matching the unit's role.
 * - Distance 0 → 10, distance >= MAX_OBJECTIVE_DISTANCE → 0, linear.
 */
function scoreObjectiveProximity(
  center: Point,
  unit: DeploymentUnit,
  objectives: Objective[],
): number {
  const relevant = relevantObjectives(unit, objectives)
  if (relevant.length === 0) return 5 // neutral if no relevant objectives

  const minDist = Math.min(...relevant.map((o) => distance(center, o.position)))
  if (minDist >= MAX_OBJECTIVE_DISTANCE) return 0
  return Math.round(10 * (1 - minDist / MAX_OBJECTIVE_DISTANCE))
}

/**
 * Returns objectives relevant to the unit's tactical role.
 */
function relevantObjectives(unit: DeploymentUnit, objectives: Objective[]): Objective[] {
  const role = unit.tacticalRole
  switch (role) {
    case 'holder':
      return objectives.filter((o) => o.classification === 'home')
    case 'anchor':
      return objectives.filter((o) => o.classification === 'expansion')
    case 'screen':
      return objectives.filter((o) => o.classification === 'center')
    case 'gunline':
      return objectives.filter((o) => o.classification === 'home' || o.classification === 'safe')
    default:
      return objectives
  }
}

/**
 * Firing Lanes (0-10):
 * - Non-shooting roles: 5 (neutral)
 * - Sample positions in enemy zone, count how many have LOS from center
 * - Scale: 0 visible → 0, all visible → 10
 */
function scoreFiringLanes(
  center: Point,
  unit: DeploymentUnit,
  terrain: TerrainPiece[],
  enemyPositions: Point[],
): number {
  const role = unit.tacticalRole
  if (role !== 'gunline' && role !== 'mid-range-shooter') return 5

  if (enemyPositions.length === 0) return 5

  const visibleCount = enemyPositions.filter((pos) => hasLOS(center, pos, terrain)).length
  return Math.round((visibleCount / enemyPositions.length) * 10)
}

/**
 * Screen Coverage (0-10):
 * - Non-screen roles: 5 (neutral)
 * - Calculate approximate area denied by placing each model's 9" deep-strike bubble
 * - Score based on total spread of model positions in the formation
 * - Wider spread = higher score (normalised against a reference spread)
 */
function scoreScreenCoverage(center: Point, formation: Formation, unit: DeploymentUnit): number {
  if (unit.tacticalRole !== 'screen') return 5

  const worldPositions = formationWorldPositions(center, formation)
  if (worldPositions.length === 0) return 5

  // Measure the spread of model positions (bounding box area + radius bonus)
  const xs = worldPositions.map((p) => p.x)
  const ys = worldPositions.map((p) => p.y)
  const spreadX = Math.max(...xs) - Math.min(...xs)
  const spreadY = Math.max(...ys) - Math.min(...ys)

  // The denied area radius per model is DEEP_STRIKE_EXCLUSION_RADIUS (9").
  // For a single model at (cx, cy) the diameter covered is 18".
  // For a spread formation, total coverage ≈ spread + 2 * 9" (one radius on each end).
  const effectiveCoverage = Math.max(spreadX, spreadY) + 2 * DEEP_STRIKE_EXCLUSION_RADIUS

  // A single model covers 18" diameter — that's our baseline.
  // Max useful coverage ~= battlefield width or depth (44" or 30").
  // Score linearly from baseline (18") → 10 at ~40" coverage.
  const baseline = 2 * DEEP_STRIKE_EXCLUSION_RADIUS // 18"
  const max = 40
  const clamped = Math.min(effectiveCoverage, max)
  const normalised = (clamped - baseline) / (max - baseline)

  // Score from 5 (baseline single model) to 10 (maximal spread)
  return Math.round(5 + normalised * 5)
}

/**
 * Turn 1 Survival (0-10):
 * - Inside terrain → 10
 * - Behind LOS-blocking terrain (hidden from all enemy) → 8
 * - Out of enemy max charge threat range (low melee score) → 7
 * - Tough unit (toughness >= 6, invuln) in open → 5
 * - Open and fragile → 0-2
 */
function scoreTurn1Survival(
  center: Point,
  unit: DeploymentUnit,
  terrain: TerrainPiece[],
  enemyPositions: Point[],
  threats: ThreatOverlay,
  boardWidth: number,
  boardDepth: number,
): number {
  // Inside terrain → maximum survival
  for (const piece of terrain) {
    if (pointInRect(center, piece.footprint)) return 10
  }

  // Behind LOS-blocking terrain
  if (enemyPositions.length > 0 && isHiddenFromAllPositions(center, enemyPositions, terrain)) {
    return 8
  }

  // Check melee threat — if no charge threat, decent survival
  const meleeValue = lookupHeatMap(
    threats.meleeHeatMap,
    center,
    boardWidth,
    boardDepth,
    threats.gridResolution,
  )
  const maxMelee = heatMapMax(threats.meleeHeatMap)
  const isSafeFromCharge = maxMelee === 0 || meleeValue / maxMelee < 0.1
  if (isSafeFromCharge) return 7

  // Tough unit with invuln
  const isTough = unit.toughness >= 6 && unit.invulnSave !== undefined
  if (isTough) return 5

  // Fragile in open with charge threat
  return 1
}

/**
 * Role Fit (0-10):
 * How well the position matches the unit's tactical role.
 */
function scoreRoleFit(
  center: Point,
  unit: DeploymentUnit,
  objectives: Objective[],
  firingLanes: number,
  boardDepth: number,
): number {
  const role = unit.tacticalRole

  switch (role) {
    case 'holder': {
      const homeObjs = objectives.filter((o) => o.classification === 'home')
      if (homeObjs.length === 0) return 5
      const minDist = Math.min(...homeObjs.map((o) => distance(center, o.position)))
      return minDist < 1 ? 10 : Math.round(10 * Math.max(0, 1 - minDist / MAX_OBJECTIVE_DISTANCE))
    }

    case 'anchor': {
      const expObjs = objectives.filter((o) => o.classification === 'expansion')
      if (expObjs.length === 0) return 5
      const minDist = Math.min(...expObjs.map((o) => distance(center, o.position)))
      return Math.round(10 * Math.max(0, 1 - minDist / MAX_OBJECTIVE_DISTANCE))
    }

    case 'gunline': {
      // Backfield = y > boardDepth/4 (bottom third of table in screen coords)
      // Combined with having good firing lanes
      const backfieldY = boardDepth / 4
      const isBackfield = center.y > backfieldY
      if (isBackfield && firingLanes >= 7) return 10
      if (isBackfield) return 7
      if (firingLanes >= 7) return 6
      return 3
    }

    case 'hammer': {
      // Hidden position with proximity to center (charge path)
      // Covered by cover score — just check distance to board center
      const distToCenter = distance(center, { x: 0, y: 0 })
      return Math.round(10 * Math.max(0, 1 - distToCenter / (boardDepth / 2)))
    }

    case 'screen': {
      // Forward: closer to enemy is better for screen (within own deployment)
      // Score based on proximity to board center (y=0)
      const distToCenter = Math.abs(center.y)
      return Math.round(10 * Math.max(0, 1 - distToCenter / (boardDepth / 2)))
    }

    case 'transport': {
      // At zone edge (low y = forward edge) facing center
      // Score: closer to y=0 line (zone boundary) = better
      const distToEdge = Math.abs(center.y)
      return Math.round(10 * Math.max(0, 1 - distToEdge / (boardDepth / 2)))
    }

    case 'deep-strike':
      return 0 // should not be scored during deployment

    default:
      return 5 // neutral for unhandled roles
  }
}

// ── Role weights ──────────────────────────────────────────────────────────────

interface WeightMap {
  cover: number
  threatExposure: number
  chargeThreat: number
  objectiveProximity: number
  firingLanes: number
  screenCoverage: number
  infiltratorDenial: number
  scoutValue: number
  counterScout: number
  turn1Survival: number
  roleFit: number
}

function getWeights(role: DeploymentUnit['tacticalRole']): WeightMap {
  const base: WeightMap = {
    cover: 1,
    threatExposure: 1,
    chargeThreat: 1,
    objectiveProximity: 1,
    firingLanes: 1,
    screenCoverage: 1,
    infiltratorDenial: 1,
    scoutValue: 1,
    counterScout: 1,
    turn1Survival: 1,
    roleFit: 1,
  }

  switch (role) {
    case 'holder':
      return { ...base, objectiveProximity: 3, turn1Survival: 2, roleFit: 2 }
    case 'gunline':
      return { ...base, cover: 2, firingLanes: 3, turn1Survival: 2 }
    case 'hammer':
      return { ...base, cover: 3, turn1Survival: 3, roleFit: 2 }
    case 'screen':
      return { ...base, screenCoverage: 3, roleFit: 2 }
    case 'anchor':
      return { ...base, objectiveProximity: 2, turn1Survival: 2, chargeThreat: 2 }
    default:
      return base
  }
}

/**
 * Compute the weighted total score, normalised to 0-100.
 */
function computeTotal(scores: Omit<PositionScore, 'total'>, weights: WeightMap): number {
  const keys = Object.keys(weights) as Array<keyof WeightMap>
  let weightedSum = 0
  let totalWeight = 0
  for (const key of keys) {
    const w = weights[key]
    weightedSum += scores[key] * w
    totalWeight += w
  }
  // Each factor is 0-10, so max possible = 10 * totalWeight
  // Normalise to 0-100
  return Math.round((weightedSum / (10 * totalWeight)) * 100)
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Score a position for a unit given the battlefield context.
 *
 * Each factor is scored 0-10. The total is a role-weighted sum normalised to 0-100.
 */
export function scorePosition(
  center: Point,
  formation: Formation,
  unit: DeploymentUnit,
  context: ScoringContext,
): PositionScore {
  const { battlefield, objectives, threats, enemyZone } = context
  const { width, depth, terrain } = battlefield

  // Sample enemy positions once — reused by multiple factors
  const enemyPositions = sampleEnemyPositions(enemyZone)

  const cover = scoreCover(center, terrain, enemyPositions)
  const threatExposure = scoreThreatExposure(center, threats, width, depth)
  const chargeThreat = scoreChargeThreat(center, threats, width, depth)
  const objectiveProximity = scoreObjectiveProximity(center, unit, objectives)
  const firingLanes = scoreFiringLanes(center, unit, terrain, enemyPositions)
  const screenCoverage = scoreScreenCoverage(center, formation, unit)

  // Specialist scores — neutral until refined
  const infiltratorDenial = 5
  const scoutValue = 5
  const counterScout = 5

  const turn1Survival = scoreTurn1Survival(
    center,
    unit,
    terrain,
    enemyPositions,
    threats,
    width,
    depth,
  )
  const roleFit = scoreRoleFit(center, unit, objectives, firingLanes, depth)

  const partial: Omit<PositionScore, 'total'> = {
    cover,
    threatExposure,
    chargeThreat,
    objectiveProximity,
    firingLanes,
    screenCoverage,
    infiltratorDenial,
    scoutValue,
    counterScout,
    turn1Survival,
    roleFit,
  }

  const weights = getWeights(unit.tacticalRole)
  const total = computeTotal(partial, weights)

  return { ...partial, total }
}

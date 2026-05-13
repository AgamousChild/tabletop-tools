import type { Point, GameRulesConfig, BaseSize, FormationType } from '../types'
import { isCoherent } from './coherency'

export interface Formation {
  type: FormationType
  positions: Point[]
}

// Spacing between model centers in inches. Must be strictly less than coherency distance (2").
const STANDARD_SPACING = 1.5
const CLUSTER_SPACING = 1.3
const CHAIN_SPACING = 1.8

/**
 * Centers an array of positions around (0,0) by subtracting the centroid.
 */
function centerPositions(positions: Point[]): Point[] {
  const cx = positions.reduce((sum, p) => sum + p.x, 0) / positions.length
  const cy = positions.reduce((sum, p) => sum + p.y, 0) / positions.length
  return positions.map((p) => ({ x: p.x - cx, y: p.y - cy }))
}

/**
 * Block: grid arrangement, spacing 1.5".
 *
 * Layout strategy: fill as many complete rows as possible, with any remainder
 * placed in the last row. To ensure coherency for large units (≥7 models needing
 * 2 neighbors), the last row is only left incomplete when it has at least 2 models
 * (so end models still have a neighbor to the left/right) AND is adjacent to a
 * full row above it (providing vertical neighbors).
 *
 * If the remainder would leave a single orphan model, we instead use a slightly
 * wider row arrangement. Specifically: cols = ceil(n / rows) with rows increasing
 * until no row has fewer than 2 models (when large unit).
 */
function buildBlock(modelCount: number, isLargeUnit: boolean): Point[] {
  let cols = Math.ceil(Math.sqrt(modelCount))
  let rows = Math.ceil(modelCount / cols)

  // For large units, if the last row would have only 1 model, increase cols
  // so that the last row has at least 2 models (ensuring 2 neighbors for all models)
  if (isLargeUnit) {
    while (modelCount % cols === 1 && cols < modelCount) {
      cols++
      rows = Math.ceil(modelCount / cols)
    }
  }

  const positions: Point[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (positions.length >= modelCount) break
      positions.push({ x: c * STANDARD_SPACING, y: r * STANDARD_SPACING })
    }
  }
  return centerPositions(positions)
}

/**
 * Line: single file along x-axis, 1.5" spacing.
 * Only generated for units with < largeUnitThreshold models (single-file fails large unit coherency).
 */
function buildLine(modelCount: number): Point[] {
  const positions = Array.from({ length: modelCount }, (_, i) => ({
    x: i * STANDARD_SPACING,
    y: 0,
  }))
  return centerPositions(positions)
}

/**
 * Wide Line: 2 rows, staggered (offset by half spacing).
 * Row 1: ceil(n/2) models. Row 2: floor(n/2) models.
 * Rows are 1.5" apart. Row 2 is staggered by 0.75" (half spacing) for a more natural look.
 *
 * For large units (>=7), wide line satisfies 2-neighbor coherency:
 * - Row 1 models have neighbors on left/right in row 1 AND the staggered model above in row 2.
 * - For the ends of row 1, the adjacent model in row 2 is close enough.
 *
 * To guarantee coherency for large units, we use a row spacing of STANDARD_SPACING so
 * the diagonal distance between staggered models is sqrt(0.75^2 + 1.5^2) ≈ 1.68" < 2".
 * This means each interior model has multiple neighbors.
 */
function buildWideLine(modelCount: number): Point[] {
  const row1Count = Math.ceil(modelCount / 2)
  const row2Count = Math.floor(modelCount / 2)
  const positions: Point[] = []
  for (let i = 0; i < row1Count; i++) {
    positions.push({ x: i * STANDARD_SPACING, y: 0 })
  }
  // Stagger row 2 by half spacing so diagonal distance = sqrt(0.75^2 + 1.5^2) ≈ 1.68" < 2"
  for (let i = 0; i < row2Count; i++) {
    positions.push({ x: i * STANDARD_SPACING + STANDARD_SPACING / 2, y: STANDARD_SPACING })
  }
  return centerPositions(positions)
}

/**
 * Dog Bone: 3 models clustered at each end, remaining models in a chain between.
 * Satisfies large unit coherency (each model has ≥2 neighbors):
 * - Cluster models: each has 2 other cluster models as neighbors, plus possibly one chain neighbor.
 * - Chain models: left and right chain neighbors (or cluster if at the end of the chain).
 *
 * Only generated for units with >= largeUnitThreshold (7) models.
 * Minimum: 6 models (3+0chain+3). Below 7 it won't be generated.
 */
function buildDogBone(modelCount: number): Point[] {
  const clusterSize = 3
  const chainCount = modelCount - 2 * clusterSize

  // Left cluster: a tight triangle
  // Model 0: origin, Model 1: +clusterSpacing, Model 2: above midpoint
  const leftCluster: Point[] = [
    { x: 0, y: 0 },
    { x: CLUSTER_SPACING, y: 0 },
    { x: CLUSTER_SPACING / 2, y: CLUSTER_SPACING * 0.9 },
  ]

  // Chain: starts after left cluster, spaced CHAIN_SPACING apart
  const chainStart = CLUSTER_SPACING + CHAIN_SPACING
  const chain: Point[] = Array.from({ length: chainCount }, (_, i) => ({
    x: chainStart + i * CHAIN_SPACING,
    y: 0,
  }))

  // Right cluster: mirror of left, positioned after chain
  const rightStart = chainStart + (chainCount > 0 ? (chainCount - 1) * CHAIN_SPACING + CHAIN_SPACING : 0)
  const rightCluster: Point[] = [
    { x: rightStart, y: 0 },
    { x: rightStart + CLUSTER_SPACING, y: 0 },
    { x: rightStart + CLUSTER_SPACING / 2, y: CLUSTER_SPACING * 0.9 },
  ]

  const positions = [...leftCluster, ...chain, ...rightCluster]
  return centerPositions(positions)
}

/**
 * Blob: hexagonal close-packed arrangement — looks like a loose cluster.
 *
 * Uses a hexagonal grid with 1.5" spacing so every model has 6 potential neighbors,
 * guaranteeing coherency even for large units (≥7 models needing 2 neighbors).
 *
 * Models are placed by spiral BFS from center outward to produce a roughly circular shape.
 * Odd rows are offset by half spacing (staggered) to form the hex grid.
 */
function buildBlob(modelCount: number): Point[] {
  if (modelCount === 1) return [{ x: 0, y: 0 }]

  const S = STANDARD_SPACING // 1.5" — row and column spacing
  const rowSpacing = S * (Math.sqrt(3) / 2) // hex grid row spacing ≈ 1.3"

  // Generate a large hex grid centered at origin, sorted by distance from center
  const gridSize = Math.ceil(Math.sqrt(modelCount)) + 2
  const candidates: { x: number; y: number; dist: number }[] = []

  for (let row = -gridSize; row <= gridSize; row++) {
    const xOffset = (row % 2 !== 0 ? S / 2 : 0)
    for (let col = -gridSize; col <= gridSize; col++) {
      const x = col * S + xOffset
      const y = row * rowSpacing
      const dist = Math.sqrt(x * x + y * y)
      candidates.push({ x, y, dist })
    }
  }

  candidates.sort((a, b) => a.dist - b.dist)
  const positions = candidates.slice(0, modelCount).map(({ x, y }) => ({ x, y }))
  return centerPositions(positions)
}

/**
 * Generates all applicable formation templates for a unit of `modelCount` models.
 *
 * Formations generated:
 * - Block: always
 * - Line: only for small units (< largeUnitThreshold)
 * - Wide Line: always
 * - Dog Bone: only for large units (>= largeUnitThreshold)
 * - Blob: always
 *
 * Each formation is verified to be coherent before being returned.
 * Positions are relative to (0, 0).
 */
export function generateFormations(
  modelCount: number,
  _baseSize: BaseSize,
  rules: GameRulesConfig,
): Formation[] {
  if (modelCount <= 0) return []

  const { largeUnitThreshold } = rules.coherency
  const isLargeUnit = modelCount >= largeUnitThreshold

  const candidates: Array<{ type: FormationType; positions: Point[] }> = []

  // Block: always applicable
  candidates.push({ type: 'block', positions: buildBlock(modelCount, isLargeUnit) })

  // Line: only for small units (large units fail single-file coherency)
  if (!isLargeUnit) {
    candidates.push({ type: 'line', positions: buildLine(modelCount) })
  }

  // Wide Line: always applicable
  candidates.push({ type: 'wide-line', positions: buildWideLine(modelCount) })

  // Dog Bone: only for large units
  if (isLargeUnit) {
    candidates.push({ type: 'dog-bone', positions: buildDogBone(modelCount) })
  }

  // Blob: always applicable
  candidates.push({ type: 'blob', positions: buildBlob(modelCount) })

  // Filter to only coherent formations
  return candidates.filter(({ positions }) => isCoherent(positions, rules))
}

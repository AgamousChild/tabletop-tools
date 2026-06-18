import { pointInQuarterCircle } from '../geometry/circle'
import type { DeploymentType, PlayerZone, Point, Rect } from '../types'

// ── Public API ────────────────────────────────────────────────────────────────

export interface DeploymentZone {
  /** Returns true if the given point is inside this deployment zone. */
  contains: (p: Point) => boolean
  /** Axis-aligned bounding box for position sampling within the zone. */
  bounds: Rect
}

export interface DeploymentZoneOpts {
  type: DeploymentType
  playerZone: PlayerZone
  tableWidth: number
  tableDepth: number
}

export function computeDeploymentZone(opts: DeploymentZoneOpts): DeploymentZone {
  return computeZone(opts.type, opts.playerZone, opts.tableWidth, opts.tableDepth)
}

/**
 * Computes the enemy deployment zone, which is the zone that the opponent
 * occupies. For Search and Destroy this is the diagonally opposite quadrant;
 * for Dawn of War this is the opposite half.
 */
export function computeEnemyZone(opts: DeploymentZoneOpts): DeploymentZone {
  const enemyPlayerZone = oppositeZone(opts.playerZone)
  return computeZone(opts.type, enemyPlayerZone, opts.tableWidth, opts.tableDepth)
}

// ── Zone dispatch ─────────────────────────────────────────────────────────────

function computeZone(
  type: DeploymentType,
  playerZone: PlayerZone,
  tableWidth: number,
  tableDepth: number,
): DeploymentZone {
  switch (type) {
    case 'search-and-destroy':
      return searchAndDestroyZone(playerZone, tableWidth, tableDepth)
    case 'dawn-of-war':
      return dawnOfWarZone(playerZone, tableWidth, tableDepth)
    case 'hammer-and-anvil':
    case 'crucible-of-battle':
    case 'tipping-point':
    case 'sweeping-engagement':
      throw new Error(`computeDeploymentZone: '${type}' is not yet implemented`)
  }
}

// ── Opposite zone mapping ─────────────────────────────────────────────────────

/**
 * Returns the zone the opponent occupies given the player's zone.
 * Diagonal for corner zones; opposite half for edge zones.
 */
function oppositeZone(zone: PlayerZone): PlayerZone {
  const opposites: Record<PlayerZone, PlayerZone> = {
    'top-left': 'bottom-right',
    'top-right': 'bottom-left',
    'bottom-left': 'top-right',
    'bottom-right': 'top-left',
    top: 'bottom',
    bottom: 'top',
    left: 'right',
    right: 'left',
  }
  return opposites[zone]
}

// ── Search and Destroy ────────────────────────────────────────────────────────
//
// Coordinate system: origin at table center, y increases downward (screen coords).
//   top-left:     x < 0, y < 0
//   top-right:    x > 0, y < 0
//   bottom-left:  x < 0, y > 0
//   bottom-right: x > 0, y > 0
//
// Each player gets their diagonal quadrant MINUS a 9" quarter-circle from center.
// The quadrant boundaries are exclusive (points on axes are not in any quadrant).

const SEARCH_AND_DESTROY_ARC_RADIUS = 9

function searchAndDestroyZone(
  playerZone: PlayerZone,
  tableWidth: number,
  tableDepth: number,
): DeploymentZone {
  const hw = tableWidth / 2
  const hd = tableDepth / 2
  const origin: Point = { x: 0, y: 0 }
  const arcR = SEARCH_AND_DESTROY_ARC_RADIUS

  // Validate that Search and Destroy only applies to corner zones
  if (!isCornerZone(playerZone)) {
    throw new Error(`Search and Destroy requires a corner playerZone, got '${playerZone}'`)
  }

  const quadrant = playerZone // top-left | top-right | bottom-left | bottom-right

  // The contains function: point must be in the quadrant (strictly) AND outside the arc
  const contains = (p: Point): boolean => {
    if (!inQuadrant(p, quadrant)) return false
    if (pointInQuarterCircle(p, origin, arcR, quadrant)) return false
    return true
  }

  // Bounding box: the full quadrant rectangle (the arc exclusion makes it slightly
  // tighter, but for sampling purposes the quadrant rect is correct)
  const bounds = quadrantBounds(quadrant, hw, hd)

  return { contains, bounds }
}

/** Returns true if p is strictly inside the named quadrant (excludes axes). */
function inQuadrant(
  p: Point,
  quadrant: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right',
): boolean {
  switch (quadrant) {
    case 'top-left':
      return p.x < 0 && p.y < 0
    case 'top-right':
      return p.x > 0 && p.y < 0
    case 'bottom-left':
      return p.x < 0 && p.y > 0
    case 'bottom-right':
      return p.x > 0 && p.y > 0
  }
}

function isCornerZone(
  zone: PlayerZone,
): zone is 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' {
  return (
    zone === 'top-left' || zone === 'top-right' || zone === 'bottom-left' || zone === 'bottom-right'
  )
}

/** Bounding rect for a quadrant, centered within the quadrant. */
function quadrantBounds(
  quadrant: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right',
  hw: number,
  hd: number,
): Rect {
  const w = hw
  const h = hd
  switch (quadrant) {
    case 'top-left':
      return { center: { x: -hw / 2, y: -hd / 2 }, width: w, height: h }
    case 'top-right':
      return { center: { x: hw / 2, y: -hd / 2 }, width: w, height: h }
    case 'bottom-left':
      return { center: { x: -hw / 2, y: hd / 2 }, width: w, height: h }
    case 'bottom-right':
      return { center: { x: hw / 2, y: hd / 2 }, width: w, height: h }
  }
}

// ── Dawn of War ───────────────────────────────────────────────────────────────
//
// Each player gets a strip 24" deep along the long edge (full table width).
// There is a 4" no-man's-land gap in the middle (2" each side of center).
//
// Screen coords (y increases downward):
//   "top" player zone:    y < -2   (the strip from y=-22 to y=-2, exclusive of boundary)
//   "bottom" player zone: y > 2    (the strip from y=2 to y=22, exclusive of boundary)
//
// Points on the boundary (y = ±2) are excluded (no-man's-land edge).

const DAWN_OF_WAR_GAP_HALF = 2 // 2" from center each side = 4" total gap

function dawnOfWarZone(
  playerZone: PlayerZone,
  tableWidth: number,
  tableDepth: number,
): DeploymentZone {
  if (!isEdgeZone(playerZone, 'top-bottom')) {
    throw new Error(`Dawn of War requires 'top' or 'bottom' playerZone, got '${playerZone}'`)
  }

  const hw = tableWidth / 2
  const hd = tableDepth / 2
  const gap = DAWN_OF_WAR_GAP_HALF

  const isTop = playerZone === 'top'

  const contains = (p: Point): boolean => {
    // Must be within table bounds on the x axis
    if (p.x <= -hw || p.x >= hw) return false
    // Top player: y must be strictly less than -gap (further into negative y)
    // Bottom player: y must be strictly greater than +gap
    if (isTop) return p.y < -gap
    return p.y > gap
  }

  // The bounding box covers the 24" deployment strip.
  // For "top": center.y = -(gap + zoneDepth/2) where zoneDepth = hd - gap = 22 - 2 = 20"
  const zoneDepth = hd - gap
  const bounds: Rect = isTop
    ? { center: { x: 0, y: -(gap + zoneDepth / 2) }, width: tableWidth, height: zoneDepth }
    : { center: { x: 0, y: gap + zoneDepth / 2 }, width: tableWidth, height: zoneDepth }

  return { contains, bounds }
}

function isEdgeZone(zone: PlayerZone, axis: 'top-bottom' | 'left-right'): boolean {
  if (axis === 'top-bottom') return zone === 'top' || zone === 'bottom'
  return zone === 'left' || zone === 'right'
}

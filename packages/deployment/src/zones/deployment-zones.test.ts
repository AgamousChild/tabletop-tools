import { describe, expect, it } from 'vitest'

import { computeDeploymentZone, computeEnemyZone } from './deployment-zones'

// Standard 60x44 table, origin at center.
// Screen coords: y increases downward. "top" = negative y, "bottom" = positive y.
const W = 60
const D = 44

// ── Search and Destroy ────────────────────────────────────────────────────────

describe('Search and Destroy — bottom-left player', () => {
  const zone = computeDeploymentZone({
    type: 'search-and-destroy',
    playerZone: 'bottom-left',
    tableWidth: W,
    tableDepth: D,
  })

  it('contains a corner point deep in the quadrant', () => {
    // (-25, 18): far into the bottom-left quadrant, well beyond 9"
    expect(zone.contains({ x: -25, y: 18 })).toBe(true)
  })

  it('excludes the exact center (0,0)', () => {
    expect(zone.contains({ x: 0, y: 0 })).toBe(false)
  })

  it('excludes a point within 9" of center in the correct quadrant', () => {
    // (-5, 5): distance ~7.07" from center, in bottom-left quadrant → excluded by arc
    expect(zone.contains({ x: -5, y: 5 })).toBe(false)
  })

  it('excludes a point exactly on the 9" arc boundary', () => {
    // On the arc: distance exactly 9" at (-9, 0) — on the x-axis boundary of quadrant
    // Use a point precisely 9" away diagonally: (-9/√2, 9/√2) ≈ (-6.364, 6.364)
    const r = 9
    const x = -(r / Math.sqrt(2))
    const y = r / Math.sqrt(2)
    expect(zone.contains({ x, y })).toBe(false)
  })

  it('contains a point just beyond 9" from center in the quadrant', () => {
    // (-9.5, 0.5): distance ~9.51", in bottom-left quadrant → outside arc → inside zone
    expect(zone.contains({ x: -9.5, y: 0.5 })).toBe(true)
  })

  it('excludes a point in the wrong quadrant (top-right)', () => {
    expect(zone.contains({ x: 20, y: -15 })).toBe(false)
  })

  it('excludes a point in an adjacent quadrant (top-left)', () => {
    expect(zone.contains({ x: -20, y: -15 })).toBe(false)
  })

  it('excludes a point on the x=0 boundary (not in quadrant)', () => {
    expect(zone.contains({ x: 0, y: 15 })).toBe(false)
  })

  it('has correct bounds covering the bottom-left quadrant', () => {
    const { bounds } = zone
    // Bounds should be in the bottom-left quadrant: negative x, positive y
    expect(bounds.center.x).toBeLessThan(0)
    expect(bounds.center.y).toBeGreaterThan(0)
    expect(bounds.width).toBeLessThanOrEqual(W / 2)
    expect(bounds.height).toBeLessThanOrEqual(D / 2)
  })
})

describe('Search and Destroy — top-right player', () => {
  const zone = computeDeploymentZone({
    type: 'search-and-destroy',
    playerZone: 'top-right',
    tableWidth: W,
    tableDepth: D,
  })

  it('contains a corner point in the top-right quadrant', () => {
    expect(zone.contains({ x: 25, y: -18 })).toBe(true)
  })

  it('excludes a point near center', () => {
    expect(zone.contains({ x: 5, y: -5 })).toBe(false)
  })

  it('excludes the enemy (bottom-left) quadrant', () => {
    expect(zone.contains({ x: -25, y: 18 })).toBe(false)
  })
})

describe('computeEnemyZone — Search and Destroy bottom-left player', () => {
  const enemyZone = computeEnemyZone({
    type: 'search-and-destroy',
    playerZone: 'bottom-left',
    tableWidth: W,
    tableDepth: D,
  })

  it('enemy zone is the diagonally opposite quadrant (top-right)', () => {
    // top-right: x > 0, y < 0
    expect(enemyZone.contains({ x: 25, y: -18 })).toBe(true)
  })

  it('enemy zone excludes bottom-left (player zone)', () => {
    expect(enemyZone.contains({ x: -25, y: 18 })).toBe(false)
  })

  it('enemy zone excludes center arc', () => {
    expect(enemyZone.contains({ x: 5, y: -5 })).toBe(false)
  })
})

// ── Dawn of War ──────────────────────────────────────────────────────────────

describe('Dawn of War — top player', () => {
  const zone = computeDeploymentZone({
    type: 'dawn-of-war',
    playerZone: 'top',
    tableWidth: W,
    tableDepth: D,
  })

  it('contains a point in the top half beyond 2" from center', () => {
    // y = -15: 15" from center toward top, well inside top 24"
    expect(zone.contains({ x: 0, y: -15 })).toBe(true)
  })

  it('contains a point at the far top edge', () => {
    expect(zone.contains({ x: 10, y: -20 })).toBe(true)
  })

  it('excludes the no-man-s-land (y between -2 and 2)', () => {
    expect(zone.contains({ x: 0, y: -1 })).toBe(false)
    expect(zone.contains({ x: 0, y: 1 })).toBe(false)
    expect(zone.contains({ x: 0, y: 0 })).toBe(false)
  })

  it('excludes the bottom half', () => {
    expect(zone.contains({ x: 0, y: 15 })).toBe(false)
    expect(zone.contains({ x: -10, y: 20 })).toBe(false)
  })

  it('excludes points exactly at the no-man-s-land boundary (y=-2)', () => {
    // The boundary at y=-2 is excluded (no-man's-land starts there)
    expect(zone.contains({ x: 0, y: -2 })).toBe(false)
  })

  it('contains a point just past the no-man-s-land (y just beyond -2)', () => {
    expect(zone.contains({ x: 0, y: -2.1 })).toBe(true)
  })
})

describe('Dawn of War — bottom player', () => {
  const zone = computeDeploymentZone({
    type: 'dawn-of-war',
    playerZone: 'bottom',
    tableWidth: W,
    tableDepth: D,
  })

  it('contains a point in the bottom half beyond 2" from center', () => {
    expect(zone.contains({ x: 0, y: 15 })).toBe(true)
  })

  it('excludes the top half', () => {
    expect(zone.contains({ x: 0, y: -15 })).toBe(false)
  })

  it('excludes the no-man-s-land', () => {
    expect(zone.contains({ x: 0, y: 1 })).toBe(false)
  })
})

describe('computeEnemyZone — Dawn of War top player', () => {
  const enemyZone = computeEnemyZone({
    type: 'dawn-of-war',
    playerZone: 'top',
    tableWidth: W,
    tableDepth: D,
  })

  it('enemy zone is the bottom half', () => {
    expect(enemyZone.contains({ x: 0, y: 15 })).toBe(true)
  })

  it('enemy zone excludes the top (player zone)', () => {
    expect(enemyZone.contains({ x: 0, y: -15 })).toBe(false)
  })

  it('enemy zone excludes no-man-s-land', () => {
    expect(enemyZone.contains({ x: 0, y: 1 })).toBe(false)
  })
})

// ── Not-yet-implemented types ─────────────────────────────────────────────────

describe('Unimplemented deployment types', () => {
  it('throws for hammer-and-anvil', () => {
    expect(() =>
      computeDeploymentZone({
        type: 'hammer-and-anvil',
        playerZone: 'top',
        tableWidth: W,
        tableDepth: D,
      }),
    ).toThrow('not yet implemented')
  })

  it('throws for crucible-of-battle', () => {
    expect(() =>
      computeDeploymentZone({
        type: 'crucible-of-battle',
        playerZone: 'top',
        tableWidth: W,
        tableDepth: D,
      }),
    ).toThrow('not yet implemented')
  })
})

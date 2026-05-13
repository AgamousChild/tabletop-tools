import { describe, it, expect } from 'vitest'
import { findHidingSpots, estimateTerrainCapacity } from './los-analysis'
import type { TerrainPiece } from '../types'
import type { DeploymentZone } from '../zones/deployment-zones'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTerrain(id: string, cx: number, cy: number, w = 8, h = 6): TerrainPiece {
  return {
    id,
    position: { x: cx, y: cy },
    footprint: { center: { x: cx, y: cy }, width: w, height: h },
    losBlocking: true,
  }
}

/** Zone: bottom strip y in [2, 22], x in [-30, 30] (Dawn of War bottom player) */
function makeBottomZone(): DeploymentZone {
  return {
    bounds: { center: { x: 0, y: 12 }, width: 60, height: 20 },
    contains: (p) => p.x > -30 && p.x < 30 && p.y > 2 && p.y < 22,
  }
}

// ── findHidingSpots ───────────────────────────────────────────────────────────

describe('findHidingSpots', () => {
  it('returns terrain whose center is inside the zone', () => {
    const inside = makeTerrain('inside', 5, 10)   // y=10 → inside bottom zone [2,22]
    const outside = makeTerrain('outside', 5, -10) // y=-10 → not in bottom zone

    const zone = makeBottomZone()
    const result = findHidingSpots([inside, outside], zone)

    expect(result.map((t) => t.id)).toContain('inside')
    expect(result.map((t) => t.id)).not.toContain('outside')
  })

  it('returns terrain within scout range of the zone edge when scoutRange provided', () => {
    // Piece at y=1 — just outside zone (zone starts at y>2).
    // Scout range of 3 → include pieces whose center is within 3" of the zone boundary.
    const nearEdge = makeTerrain('near', 0, 1)   // 1" outside zone edge at y=2 → 1" away
    const farOutside = makeTerrain('far', 0, -15) // 17" outside → too far

    const zone = makeBottomZone()
    const result = findHidingSpots([nearEdge, farOutside], zone, 3)

    expect(result.map((t) => t.id)).toContain('near')
    expect(result.map((t) => t.id)).not.toContain('far')
  })

  it('terrain inside zone is returned even without scout range', () => {
    const inside = makeTerrain('inside', 0, 12)
    const zone = makeBottomZone()
    const result = findHidingSpots([inside], zone)
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('inside')
  })

  it('terrain far outside zone is not returned even with generous scout range', () => {
    const far = makeTerrain('far', 0, -30)
    const zone = makeBottomZone()
    const result = findHidingSpots([far], zone, 10)
    expect(result).toHaveLength(0)
  })

  it('empty terrain list → empty result', () => {
    expect(findHidingSpots([], makeBottomZone(), 6)).toHaveLength(0)
  })

  it('returns multiple pieces inside zone', () => {
    const a = makeTerrain('a', -10, 5)
    const b = makeTerrain('b', 0, 12)
    const c = makeTerrain('c', 10, 20)
    const zone = makeBottomZone()
    const result = findHidingSpots([a, b, c], zone)
    expect(result).toHaveLength(3)
  })
})

// ── estimateTerrainCapacity ───────────────────────────────────────────────────

describe('estimateTerrainCapacity', () => {
  it('large terrain + small bases = many models', () => {
    // 8" × 6" terrain = 48 sq in
    // 25mm base = ~0.98 in diameter → area ~ 0.75 sq in
    // Expect significantly more than 1 model
    const terrain = makeTerrain('t1', 0, 0, 8, 6)
    const count = estimateTerrainCapacity(terrain, 25)
    expect(count).toBeGreaterThan(5)
  })

  it('small terrain + large bases = few models', () => {
    // 4" × 3" terrain = 12 sq in
    // 80mm base = ~3.15 in diameter → area ~ 7.77 sq in
    // Expect 1 or 2 models
    const terrain = makeTerrain('t2', 0, 0, 4, 3)
    const count = estimateTerrainCapacity(terrain, 80)
    expect(count).toBeLessThanOrEqual(3)
  })

  it('returns at least 1 when terrain is big enough for one base', () => {
    // 3" × 3" terrain, 25mm base (~0.98") — should fit at least 1
    const terrain = makeTerrain('t3', 0, 0, 3, 3)
    const count = estimateTerrainCapacity(terrain, 25)
    expect(count).toBeGreaterThanOrEqual(1)
  })

  it('larger terrain always has >= capacity of smaller terrain (same base size)', () => {
    const large = makeTerrain('lg', 0, 0, 12, 10)
    const small = makeTerrain('sm', 0, 0, 4, 3)
    const capLarge = estimateTerrainCapacity(large, 32)
    const capSmall = estimateTerrainCapacity(small, 32)
    expect(capLarge).toBeGreaterThanOrEqual(capSmall)
  })

  it('result is always a positive integer', () => {
    const terrain = makeTerrain('t4', 0, 0, 6, 4)
    const count = estimateTerrainCapacity(terrain, 40)
    expect(count).toBeGreaterThanOrEqual(1)
    expect(Number.isInteger(count)).toBe(true)
  })
})

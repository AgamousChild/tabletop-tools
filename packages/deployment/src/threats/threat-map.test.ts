import { describe, expect, it } from 'vitest'

import type { EnemyUnit, TerrainPiece } from '../types'
import { DEFAULT_10E_RULES } from '../types'
import type { DeploymentZone } from '../zones/deployment-zones'
import { generateThreatMap } from './threat-map'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeUnit(overrides: Partial<EnemyUnit> = {}): EnemyUnit {
  return {
    id: 'u1',
    name: 'Test Unit',
    models: 5,
    move: 6,
    abilities: {},
    weapons: [{ name: 'Bolter', range: 24 }],
    threatLevel: 'medium',
    ...overrides,
  }
}

/** Enemy zone covering the top strip of a 60x44 board (y in [-22, -2]) */
function makeTopEnemyZone(): DeploymentZone {
  return {
    bounds: { center: { x: 0, y: -12 }, width: 60, height: 20 },
    contains: (p) => p.x > -30 && p.x < 30 && p.y > -22 && p.y < -2,
  }
}

const BOARD = { width: 60, depth: 44, terrain: [] as TerrainPiece[] }

// ── Grid dimensions ───────────────────────────────────────────────────────────

describe('generateThreatMap grid dimensions', () => {
  it('default resolution 2: 30 cols × 22 rows for 60×44 board', () => {
    const result = generateThreatMap(BOARD, makeTopEnemyZone(), [], DEFAULT_10E_RULES)
    expect(result.gridResolution).toBe(2)
    expect(result.shootingHeatMap.length).toBe(22) // rows = depth / resolution
    expect(result.shootingHeatMap[0]!.length).toBe(30) // cols = width / resolution
    expect(result.meleeHeatMap.length).toBe(22)
    expect(result.meleeHeatMap[0]!.length).toBe(30)
  })

  it('resolution 4: 15 cols × 11 rows for 60×44 board', () => {
    const result = generateThreatMap(BOARD, makeTopEnemyZone(), [], DEFAULT_10E_RULES, 4)
    expect(result.gridResolution).toBe(4)
    expect(result.shootingHeatMap.length).toBe(11)
    expect(result.shootingHeatMap[0]!.length).toBe(15)
  })

  it('resolution 1: 60 cols × 44 rows', () => {
    const result = generateThreatMap(BOARD, makeTopEnemyZone(), [], DEFAULT_10E_RULES, 1)
    expect(result.shootingHeatMap.length).toBe(44)
    expect(result.shootingHeatMap[0]!.length).toBe(60)
  })
})

// ── Empty army ────────────────────────────────────────────────────────────────

describe('generateThreatMap empty army', () => {
  it('all zeros when no enemy units', () => {
    const result = generateThreatMap(BOARD, makeTopEnemyZone(), [], DEFAULT_10E_RULES)
    const allShootingZero = result.shootingHeatMap.every((row) => row.every((v) => v === 0))
    const allMeleeZero = result.meleeHeatMap.every((row) => row.every((v) => v === 0))
    expect(allShootingZero).toBe(true)
    expect(allMeleeZero).toBe(true)
  })
})

// ── Melee unit threat ─────────────────────────────────────────────────────────

describe('generateThreatMap melee unit', () => {
  it('cells near enemy zone have high melee scores; far cells have lower scores', () => {
    const unit = makeUnit({
      move: 6,
      weapons: [{ name: 'Chainsword', range: 'melee' }],
      threatLevel: 'high',
    })
    const result = generateThreatMap(BOARD, makeTopEnemyZone(), [unit], DEFAULT_10E_RULES)

    // The heat map uses board coords mapped to grid indices.
    // Enemy zone is at y in [-22, -2] (top of board).
    // Near the zone = top rows of the map.
    // maxMeleeThreat(unit) = 6 + 12 = 18" (no advance/charge).
    // A cell at y = -2 (just below enemy zone edge) should have melee threat.
    // A cell at y = +22 (bottom of board, ~44" away) should have zero melee threat.

    // Top row (closest to enemy zone in the grid) — rows are indexed from top
    // Board y range: -22 to +22, grid row 0 = y=-22, last row = y=+22
    // "Near zone" rows are at the top of the grid
    const topRowSum = result.meleeHeatMap[0]!.reduce((a, b) => a + b, 0)
    // Bottom row = far from enemy zone
    const bottomRowSum = result.meleeHeatMap[result.meleeHeatMap.length - 1]!.reduce(
      (a, b) => a + b,
      0,
    )

    // Top row should have some threat, bottom should have less (or zero)
    expect(topRowSum).toBeGreaterThan(0)
    expect(topRowSum).toBeGreaterThanOrEqual(bottomRowSum)
  })

  it('no shooting threat for melee-only unit', () => {
    const unit = makeUnit({
      move: 6,
      weapons: [{ name: 'Chainsword', range: 'melee' }],
    })
    const result = generateThreatMap(BOARD, makeTopEnemyZone(), [unit], DEFAULT_10E_RULES)
    const allShootingZero = result.shootingHeatMap.every((row) => row.every((v) => v === 0))
    expect(allShootingZero).toBe(true)
  })
})

// ── Shooting threat ───────────────────────────────────────────────────────────

describe('generateThreatMap shooting unit', () => {
  it('shooting threat is present in cells within weapon range + move of enemy zone', () => {
    const unit = makeUnit({
      move: 6,
      weapons: [{ name: 'Lascannon', range: 36 }],
      threatLevel: 'high',
    })
    const result = generateThreatMap(BOARD, makeTopEnemyZone(), [unit], DEFAULT_10E_RULES)

    // Total shooting score should be > 0 somewhere on the board
    const totalShooting = result.shootingHeatMap.flat().reduce((a, b) => a + b, 0)
    expect(totalShooting).toBeGreaterThan(0)
  })

  it('threat weight: high threat unit scores more than low threat unit', () => {
    const boardNoTerrain = { ...BOARD, terrain: [] }
    const zone = makeTopEnemyZone()

    const highUnit = makeUnit({ threatLevel: 'high', weapons: [{ name: 'Gun', range: 24 }] })
    const lowUnit = makeUnit({ threatLevel: 'low', weapons: [{ name: 'Gun', range: 24 }] })

    const highResult = generateThreatMap(boardNoTerrain, zone, [highUnit], DEFAULT_10E_RULES)
    const lowResult = generateThreatMap(boardNoTerrain, zone, [lowUnit], DEFAULT_10E_RULES)

    const highTotal = highResult.shootingHeatMap.flat().reduce((a, b) => a + b, 0)
    const lowTotal = lowResult.shootingHeatMap.flat().reduce((a, b) => a + b, 0)

    expect(highTotal).toBeGreaterThan(lowTotal)
  })
})

// ── LOS blocking ──────────────────────────────────────────────────────────────

describe('generateThreatMap LOS blocking', () => {
  it('LOS-blocking terrain reduces shooting threat behind it', () => {
    // Place a big terrain block in the middle of the board
    const blockingTerrain: TerrainPiece = {
      id: 't1',
      position: { x: 0, y: 0 },
      footprint: { center: { x: 0, y: 0 }, width: 20, height: 4 },
      losBlocking: true,
    }
    const boardWithTerrain = { ...BOARD, terrain: [blockingTerrain] }

    const unit = makeUnit({ move: 6, weapons: [{ name: 'Gun', range: 24 }] })

    const withTerrain = generateThreatMap(
      boardWithTerrain,
      makeTopEnemyZone(),
      [unit],
      DEFAULT_10E_RULES,
    )
    const withoutTerrain = generateThreatMap(BOARD, makeTopEnemyZone(), [unit], DEFAULT_10E_RULES)

    const totalWithTerrain = withTerrain.shootingHeatMap.flat().reduce((a, b) => a + b, 0)
    const totalWithout = withoutTerrain.shootingHeatMap.flat().reduce((a, b) => a + b, 0)

    // Terrain blocks some LOS → lower total shooting score
    expect(totalWithTerrain).toBeLessThan(totalWithout)
  })
})

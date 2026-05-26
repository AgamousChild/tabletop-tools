import { describe, expect, it } from 'vitest'

import type { TerrainPiece } from '../types'
import { DEFAULT_10E_RULES } from '../types'
import { computeDeploymentZone } from '../zones/deployment-zones'
import { isLegalPlacement } from './legal-check'

const rules = DEFAULT_10E_RULES

// Dawn of War zone: bottom player gets y > 2 strip
const bottomZone = computeDeploymentZone({
  type: 'dawn-of-war',
  playerZone: 'bottom',
  tableWidth: 44,
  tableDepth: 60,
})

// Enemy zone: top player zone
const topZone = computeDeploymentZone({
  type: 'dawn-of-war',
  playerZone: 'top',
  tableWidth: 44,
  tableDepth: 60,
})

const noTerrain: TerrainPiece[] = []
const noOccupied: { x: number; y: number }[] = []

// 5 models in a tight line inside the zone (y=10, various x)
function makePositions(count: number, startX = -5, y = 10, spacing = 1.5) {
  return Array.from({ length: count }, (_, i) => ({ x: startX + i * spacing, y }))
}

describe('isLegalPlacement', () => {
  describe('zone containment (deploy method)', () => {
    it('returns true when all models are inside the zone', () => {
      const positions = makePositions(5)
      expect(isLegalPlacement(positions, bottomZone, noTerrain, noOccupied, 32, rules)).toBe(true)
    })

    it('returns false when one model is outside the zone', () => {
      const positions = makePositions(5)
      // Move last model outside zone (into no-man's land at y=1, which is outside bottom zone)
      positions[4] = { x: 0, y: 1 }
      expect(isLegalPlacement(positions, bottomZone, noTerrain, noOccupied, 32, rules)).toBe(false)
    })

    it('returns false when all models are outside the zone', () => {
      // All at y=-10 (top zone, not bottom)
      const positions = makePositions(5, -5, -10)
      expect(isLegalPlacement(positions, bottomZone, noTerrain, noOccupied, 32, rules)).toBe(false)
    })
  })

  describe('base overlap with already-placed models', () => {
    it('returns true when no position is near occupied positions', () => {
      const positions = makePositions(3, 0, 10)
      const occupied = [{ x: -10, y: 10 }] // far away
      expect(isLegalPlacement(positions, bottomZone, noTerrain, occupied, 32, rules)).toBe(true)
    })

    it('returns false when a model overlaps an already-placed model', () => {
      const positions = makePositions(3, 0, 10)
      // occupied model is at the same position as positions[0] — definitely overlapping
      const occupied = [{ x: 0, y: 10 }]
      expect(isLegalPlacement(positions, bottomZone, noTerrain, occupied, 32, rules)).toBe(false)
    })

    it('returns false when a model is too close to an occupied model (within base size)', () => {
      const positions = [{ x: 5, y: 10 }]
      // 32mm base ≈ 1.26". Place occupied model 0.5" away — they overlap
      const occupied = [{ x: 5.5, y: 10 }]
      expect(isLegalPlacement(positions, bottomZone, noTerrain, occupied, 32, rules)).toBe(false)
    })

    it('returns true when models are at safe distance from occupied (> base size apart)', () => {
      const positions = [{ x: 5, y: 10 }]
      // 32mm ≈ 1.26". Place occupied model 1.5" away — safe
      const occupied = [{ x: 6.5, y: 10 }]
      expect(isLegalPlacement(positions, bottomZone, noTerrain, occupied, 32, rules)).toBe(true)
    })
  })

  describe('coherency check', () => {
    it('returns true for coherent placement', () => {
      // 5 models 1.5" apart inside zone — coherent
      const positions = makePositions(5, -3, 10, 1.5)
      expect(isLegalPlacement(positions, bottomZone, noTerrain, noOccupied, 32, rules)).toBe(true)
    })

    it('returns false for incoherent placement', () => {
      // 5 models 3" apart — outside coherency distance (2")
      const positions = makePositions(5, -6, 10, 3)
      expect(isLegalPlacement(positions, bottomZone, noTerrain, noOccupied, 32, rules)).toBe(false)
    })
  })

  describe('infiltrate method', () => {
    it('returns true when all positions are >9" from enemy models', () => {
      const positions = makePositions(3, -2, 10)
      // Enemy models are at y=-20 (far away in enemy zone)
      const enemyModels = [{ x: 0, y: -20 }]
      expect(
        isLegalPlacement(positions, bottomZone, noTerrain, noOccupied, 32, rules, {
          method: 'infiltrate',
          enemyModels,
          enemyZone: topZone,
        }),
      ).toBe(true)
    })

    it('returns false when a position is <9" from an enemy model', () => {
      const positions = makePositions(3, -2, 10)
      // Enemy model 5" away (inside 9" exclusion)
      const enemyModels = [{ x: 0, y: 5 }]
      expect(
        isLegalPlacement(positions, bottomZone, noTerrain, noOccupied, 32, rules, {
          method: 'infiltrate',
          enemyModels,
          enemyZone: topZone,
        }),
      ).toBe(false)
    })

    it('returns false when a position is too close to the enemy zone', () => {
      // Bottom player using infiltrate: positions near the center are too close to enemy zone
      // Enemy zone starts at y < -2, so distance from y=10 to zone top boundary is about 12"
      // Enemy zone starts at y < -2: closest edge is at y=-2, so distance from (0,3) is ~5" — inside 9"
      const positions = [{ x: 0, y: 3 }]
      const enemyModels: { x: number; y: number }[] = []
      expect(
        isLegalPlacement(positions, bottomZone, noTerrain, noOccupied, 32, rules, {
          method: 'infiltrate',
          enemyModels,
          enemyZone: topZone,
        }),
      ).toBe(false)
    })

    it('uses deploy method by default (no infiltrate check)', () => {
      // Should pass without infiltrate enemy model check
      const positions = makePositions(3, -2, 10)
      // Even with enemies close, deploy method doesn't check infiltrate
      expect(isLegalPlacement(positions, bottomZone, noTerrain, noOccupied, 32, rules)).toBe(true)
    })
  })

  describe('edge cases', () => {
    it('returns false for empty positions array (no models = incoherent)', () => {
      expect(isLegalPlacement([], bottomZone, noTerrain, noOccupied, 32, rules)).toBe(false)
    })

    it('returns true for a single model placed legally', () => {
      expect(
        isLegalPlacement([{ x: 0, y: 10 }], bottomZone, noTerrain, noOccupied, 32, rules),
      ).toBe(true)
    })

    it('hull base size is handled for a single vehicle', () => {
      // A single hull-based model (vehicle) is always coherent and legal when inside zone
      expect(
        isLegalPlacement([{ x: 0, y: 10 }], bottomZone, noTerrain, noOccupied, 'hull', rules),
      ).toBe(true)
    })
  })
})

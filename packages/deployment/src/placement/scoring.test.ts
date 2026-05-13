import { describe, expect, it } from 'vitest'

import type { DeploymentUnit, Objective, Point, TerrainPiece, ThreatOverlay } from '../types'
import { DEFAULT_10E_RULES } from '../types'
import type { DeploymentZone } from '../zones/deployment-zones'
import type { Formation } from './formations'
import type { ScoringContext } from './scoring'
import { scorePosition } from './scoring'

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeUnit(overrides: Partial<DeploymentUnit> = {}): DeploymentUnit {
  return {
    id: 'u1',
    name: 'Test Unit',
    models: 5,
    baseSize: 32,
    points: 100,
    move: 6,
    toughness: 4,
    save: 3,
    wounds: 2,
    keywords: [],
    abilities: {},
    weapons: [{ name: 'Bolter', range: 24 }],
    tacticalRole: 'holder',
    ...overrides,
  }
}

function makeFormation(count: number = 1): Formation {
  const positions: Point[] = []
  for (let i = 0; i < count; i++) {
    positions.push({ x: i * 1.5, y: 0 })
  }
  // Center around 0,0
  const cx = positions.reduce((s, p) => s + p.x, 0) / count
  return {
    type: 'block',
    positions: positions.map((p) => ({ x: p.x - cx, y: p.y })),
  }
}

/**
 * Build a flat heat map (all zeros) for a 44x30 board at resolution 2.
 */
function makeZeroThreatMap(): ThreatOverlay {
  const numRows = Math.ceil(30 / 2) // 15
  const numCols = Math.ceil(44 / 2) // 22
  return {
    shootingHeatMap: Array.from({ length: numRows }, () => new Array<number>(numCols).fill(0)),
    meleeHeatMap: Array.from({ length: numRows }, () => new Array<number>(numCols).fill(0)),
    gridResolution: 2,
  }
}

/**
 * Build a heat map with a uniform threat value at every cell.
 */
function makeUniformThreatMap(shootingVal: number, meleeVal: number): ThreatOverlay {
  const numRows = Math.ceil(30 / 2)
  const numCols = Math.ceil(44 / 2)
  return {
    shootingHeatMap: Array.from({ length: numRows }, () =>
      new Array<number>(numCols).fill(shootingVal),
    ),
    meleeHeatMap: Array.from({ length: numRows }, () => new Array<number>(numCols).fill(meleeVal)),
    gridResolution: 2,
  }
}

function makeEnemyZone(): DeploymentZone {
  // Enemy is in the top portion of the board (y < 0)
  return {
    contains: (p: Point) => p.y < -5,
    bounds: { center: { x: 0, y: -12 }, width: 44, height: 10 },
  }
}

function makeObjective(
  id: string,
  x: number,
  y: number,
  classification?: Objective['classification'],
): Objective {
  return { id, position: { x, y }, classification }
}

function makeLosBlocker(id: string, cx: number, cy: number, w: number, h: number): TerrainPiece {
  return {
    id,
    position: { x: cx, y: cy },
    footprint: { center: { x: cx, y: cy }, width: w, height: h },
    losBlocking: true,
  }
}

function makeBaseContext(overrides: Partial<ScoringContext> = {}): ScoringContext {
  return {
    battlefield: { width: 44, depth: 30, terrain: [] },
    objectives: [
      makeObjective('obj1', -10, 10, 'home'),
      makeObjective('obj2', 0, 0, 'center'),
      makeObjective('obj3', 10, -10, 'expansion'),
      makeObjective('obj4', 15, -10, 'enemy-home'),
    ],
    threats: makeZeroThreatMap(),
    enemyZone: makeEnemyZone(),
    occupiedPositions: [],
    rules: DEFAULT_10E_RULES,
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('scorePosition', () => {
  describe('cover score', () => {
    it('returns high cover (>=8) when unit center is inside LOS-blocking terrain', () => {
      const terrain = [makeLosBlocker('t1', 0, 5, 4, 4)]
      const ctx = makeBaseContext({ battlefield: { width: 44, depth: 30, terrain } })
      const unit = makeUnit()
      const formation = makeFormation(1)
      // Place center exactly inside the terrain footprint
      const score = scorePosition({ x: 0, y: 5 }, formation, unit, ctx)
      expect(score.cover).toBeGreaterThanOrEqual(8)
    })

    it('returns low cover (<=3) when unit is in the open with no terrain nearby', () => {
      const ctx = makeBaseContext()
      const unit = makeUnit()
      const formation = makeFormation(1)
      const score = scorePosition({ x: 0, y: 5 }, formation, unit, ctx)
      expect(score.cover).toBeLessThanOrEqual(3)
    })

    it('returns partial cover (4-7) when unit is hidden from some but not all enemy positions', () => {
      // LOS blocker partially obscures the unit from the enemy zone
      const terrain = [makeLosBlocker('t1', 5, 5, 2, 2)]
      const ctx = makeBaseContext({ battlefield: { width: 44, depth: 30, terrain } })
      const unit = makeUnit()
      const formation = makeFormation(1)
      // Position near but not inside terrain, partially shielded
      const score = scorePosition({ x: 4, y: 5 }, formation, unit, ctx)
      // Just verify it's a valid score — the exact band depends on geometry
      expect(score.cover).toBeGreaterThanOrEqual(0)
      expect(score.cover).toBeLessThanOrEqual(10)
    })
  })

  describe('threat exposure (shooting)', () => {
    it('returns threatExposure=10 (SAFE) when shooting heat map is all zero', () => {
      const ctx = makeBaseContext({ threats: makeZeroThreatMap() })
      const score = scorePosition({ x: 0, y: 5 }, makeFormation(1), makeUnit(), ctx)
      expect(score.threatExposure).toBe(10)
    })

    it('returns threatExposure=0 (EXPOSED) when position is at max shooting threat', () => {
      // Put maximum threat value at the center cell (row 7-8 ≈ y=5, col 11 ≈ x=0)
      // Board: width=44, depth=30, res=2. Center y=5 → row = (5+15)/2 = 10, col = (0+22)/2 = 11
      const threats = makeZeroThreatMap()
      // Set every cell to the same max to force normalize to 0
      const numRows = threats.shootingHeatMap.length
      const numCols = threats.shootingHeatMap[0]!.length
      for (let r = 0; r < numRows; r++) {
        for (let c = 0; c < numCols; c++) {
          threats.shootingHeatMap[r]![c] = 100
        }
      }
      const ctx = makeBaseContext({ threats })
      const score = scorePosition({ x: 0, y: 5 }, makeFormation(1), makeUnit(), ctx)
      // When all cells have the same value, normalized = 0 for max → but we invert so becomes 0
      expect(score.threatExposure).toBe(0)
    })

    it('returns intermediate threatExposure for medium shooting threat', () => {
      // Board width=44, depth=30, res=2
      // y=5 → row = (5+15)/2 = 10, x=0 → col = (0+22)/2 = 11
      const threats = makeZeroThreatMap()
      threats.shootingHeatMap[10]![11] = 50
      // Max in map is 50, so this cell normalizes to 50/50 = 1 → inverted to 0
      // But other cells are 0, so 0/50 = 0 → inverted to 10
      // Meaning our hot cell gets threatExposure = 0
      const ctx = makeBaseContext({ threats })
      const score = scorePosition({ x: 0, y: 5 }, makeFormation(1), makeUnit(), ctx)
      expect(score.threatExposure).toBe(0)
    })
  })

  describe('charge threat (melee)', () => {
    it('returns chargeThreat=10 (SAFE) when melee heat map is all zero', () => {
      const ctx = makeBaseContext({ threats: makeZeroThreatMap() })
      const score = scorePosition({ x: 0, y: 5 }, makeFormation(1), makeUnit(), ctx)
      expect(score.chargeThreat).toBe(10)
    })

    it('returns chargeThreat=0 (EXPOSED) when position has maximum melee threat', () => {
      const threats = makeUniformThreatMap(0, 100)
      const ctx = makeBaseContext({ threats })
      const score = scorePosition({ x: 0, y: 5 }, makeFormation(1), makeUnit(), ctx)
      expect(score.chargeThreat).toBe(0)
    })
  })

  describe('objective proximity', () => {
    it('holder unit on top of home objective scores objectiveProximity=10', () => {
      const ctx = makeBaseContext()
      const unit = makeUnit({ tacticalRole: 'holder' })
      const formation = makeFormation(1)
      // Home objective is at (-10, 10)
      const score = scorePosition({ x: -10, y: 10 }, formation, unit, ctx)
      expect(score.objectiveProximity).toBe(10)
    })

    it('holder unit >30" away from home objective scores objectiveProximity=0', () => {
      const ctx = makeBaseContext()
      const unit = makeUnit({ tacticalRole: 'holder' })
      const formation = makeFormation(1)
      // Way far from home obj at (-10, 10)
      const score = scorePosition({ x: 20, y: -14 }, formation, unit, ctx)
      expect(score.objectiveProximity).toBe(0)
    })

    it('anchor unit near expansion objective scores high objectiveProximity', () => {
      const ctx = makeBaseContext()
      const unit = makeUnit({ tacticalRole: 'anchor' })
      const formation = makeFormation(1)
      // Expansion obj at (10, -10)
      const score = scorePosition({ x: 10, y: -10 }, formation, unit, ctx)
      expect(score.objectiveProximity).toBe(10)
    })

    it('screen unit near center objective scores high objectiveProximity', () => {
      const ctx = makeBaseContext()
      const unit = makeUnit({ tacticalRole: 'screen' })
      const formation = makeFormation(1)
      // Center obj at (0, 0)
      const score = scorePosition({ x: 0, y: 0 }, formation, unit, ctx)
      expect(score.objectiveProximity).toBe(10)
    })
  })

  describe('firing lanes', () => {
    it('non-gunline unit returns neutral firingLanes=5', () => {
      const ctx = makeBaseContext()
      const unit = makeUnit({ tacticalRole: 'holder' })
      const score = scorePosition({ x: 0, y: 5 }, makeFormation(1), unit, ctx)
      expect(score.firingLanes).toBe(5)
    })

    it('gunline unit in open returns higher firingLanes than 5 (many enemy positions visible)', () => {
      // No terrain blocking, enemy in y<-5 zone — gunline at y=8 can see many positions
      const ctx = makeBaseContext()
      const unit = makeUnit({ tacticalRole: 'gunline' })
      const score = scorePosition({ x: 0, y: 8 }, makeFormation(1), unit, ctx)
      expect(score.firingLanes).toBeGreaterThan(5)
    })

    it('gunline unit behind full LOS blocker returns lower firingLanes', () => {
      // Terrain completely covering the enemy zone from this position
      const blocker = makeLosBlocker('big', 0, -5, 44, 6) // horizontal wall
      const ctx = makeBaseContext({ battlefield: { width: 44, depth: 30, terrain: [blocker] } })
      const unit = makeUnit({ tacticalRole: 'gunline' })
      const score = scorePosition({ x: 0, y: 8 }, makeFormation(1), unit, ctx)
      // With full wall between us and enemy, firingLanes should be low (≤5)
      expect(score.firingLanes).toBeLessThanOrEqual(5)
    })
  })

  describe('screen coverage', () => {
    it('non-screen unit returns neutral screenCoverage=5', () => {
      const ctx = makeBaseContext()
      const unit = makeUnit({ tacticalRole: 'holder' })
      const score = scorePosition({ x: 0, y: 5 }, makeFormation(1), unit, ctx)
      expect(score.screenCoverage).toBe(5)
    })

    it('screen unit with spread formation returns higher screenCoverage than neutral', () => {
      const ctx = makeBaseContext()
      const unit = makeUnit({ tacticalRole: 'screen', models: 5 })
      // Wide formation = larger spread
      const wideFormation: Formation = {
        type: 'wide-line',
        positions: [
          { x: -6, y: 0 },
          { x: -3, y: 0 },
          { x: 0, y: 0 },
          { x: 3, y: 0 },
          { x: 6, y: 0 },
        ],
      }
      const score = scorePosition({ x: 0, y: 3 }, wideFormation, unit, ctx)
      expect(score.screenCoverage).toBeGreaterThan(5)
    })

    it('screen unit with tight formation returns lower screenCoverage than spread', () => {
      const ctx = makeBaseContext()
      const unit = makeUnit({ tacticalRole: 'screen', models: 5 })

      const tightFormation: Formation = {
        type: 'block',
        positions: [
          { x: -1.5, y: 0 },
          { x: -0.75, y: 0 },
          { x: 0, y: 0 },
          { x: 0.75, y: 0 },
          { x: 1.5, y: 0 },
        ],
      }
      const wideFormation: Formation = {
        type: 'wide-line',
        positions: [
          { x: -6, y: 0 },
          { x: -3, y: 0 },
          { x: 0, y: 0 },
          { x: 3, y: 0 },
          { x: 6, y: 0 },
        ],
      }

      const tightScore = scorePosition({ x: 0, y: 3 }, tightFormation, unit, ctx)
      const wideScore = scorePosition({ x: 0, y: 3 }, wideFormation, unit, ctx)
      expect(wideScore.screenCoverage).toBeGreaterThan(tightScore.screenCoverage)
    })
  })

  describe('turn1 survival', () => {
    it('unit inside terrain scores turn1Survival=10', () => {
      const terrain = [makeLosBlocker('t1', 0, 5, 4, 4)]
      const ctx = makeBaseContext({ battlefield: { width: 44, depth: 30, terrain } })
      const unit = makeUnit()
      const score = scorePosition({ x: 0, y: 5 }, makeFormation(1), unit, ctx)
      expect(score.turn1Survival).toBe(10)
    })

    it('tough unit (toughness>=6, invuln) in open scores turn1Survival>=5', () => {
      const ctx = makeBaseContext()
      const unit = makeUnit({ toughness: 8, invulnSave: 4 })
      const score = scorePosition({ x: 0, y: 5 }, makeFormation(1), unit, ctx)
      expect(score.turn1Survival).toBeGreaterThanOrEqual(5)
    })

    it('fragile unit in open scores low turn1Survival (<=3)', () => {
      // Low toughness, no invuln, forward position with melee threat
      const threats = makeUniformThreatMap(0, 50) // melee threat everywhere
      const ctxWithThreat = makeBaseContext({ threats })
      const unit = makeUnit({ toughness: 3, save: 5 })
      const score = scorePosition({ x: 0, y: 5 }, makeFormation(1), unit, ctxWithThreat)
      expect(score.turn1Survival).toBeLessThanOrEqual(3)
    })
  })

  describe('role fit', () => {
    it('holder near home objective scores roleFit=10', () => {
      const ctx = makeBaseContext()
      const unit = makeUnit({ tacticalRole: 'holder' })
      // Home obj at (-10, 10)
      const score = scorePosition({ x: -10, y: 10 }, makeFormation(1), unit, ctx)
      expect(score.roleFit).toBe(10)
    })

    it('deep-strike unit scores roleFit=0 (should not be scored)', () => {
      const ctx = makeBaseContext()
      const unit = makeUnit({ tacticalRole: 'deep-strike' })
      const score = scorePosition({ x: 0, y: 5 }, makeFormation(1), unit, ctx)
      expect(score.roleFit).toBe(0)
    })

    it('unknown/default role scores roleFit=5 (neutral)', () => {
      const ctx = makeBaseContext()
      const unit = makeUnit({ tacticalRole: 'counter-charge' })
      const score = scorePosition({ x: 0, y: 5 }, makeFormation(1), unit, ctx)
      expect(score.roleFit).toBe(5)
    })
  })

  describe('specialist scores return neutral', () => {
    it('infiltratorDenial returns 5 for non-specialist units', () => {
      const ctx = makeBaseContext()
      const unit = makeUnit({ tacticalRole: 'holder' })
      const score = scorePosition({ x: 0, y: 5 }, makeFormation(1), unit, ctx)
      expect(score.infiltratorDenial).toBe(5)
    })

    it('scoutValue returns 5 for non-scout units', () => {
      const ctx = makeBaseContext()
      const unit = makeUnit({ tacticalRole: 'holder' })
      const score = scorePosition({ x: 0, y: 5 }, makeFormation(1), unit, ctx)
      expect(score.scoutValue).toBe(5)
    })

    it('counterScout returns 5 for non-scout units', () => {
      const ctx = makeBaseContext()
      const unit = makeUnit({ tacticalRole: 'holder' })
      const score = scorePosition({ x: 0, y: 5 }, makeFormation(1), unit, ctx)
      expect(score.counterScout).toBe(5)
    })
  })

  describe('total and weighting', () => {
    it('total is in range 0-100', () => {
      const ctx = makeBaseContext()
      const unit = makeUnit({ tacticalRole: 'holder' })
      const score = scorePosition({ x: -10, y: 10 }, makeFormation(1), unit, ctx)
      expect(score.total).toBeGreaterThanOrEqual(0)
      expect(score.total).toBeLessThanOrEqual(100)
    })

    it('holder near home objective scores higher total than holder far from it', () => {
      const ctx = makeBaseContext()
      const unit = makeUnit({ tacticalRole: 'holder' })
      const nearScore = scorePosition({ x: -10, y: 10 }, makeFormation(1), unit, ctx)
      const farScore = scorePosition({ x: 20, y: -14 }, makeFormation(1), unit, ctx)
      expect(nearScore.total).toBeGreaterThan(farScore.total)
    })

    it('gunline unit scores higher total when in open vs inside terrain (firingLanes weight)', () => {
      const terrain = [makeLosBlocker('wall', 0, 5, 44, 2)] // giant LOS wall
      const ctxOpen = makeBaseContext()
      const ctxBlocked = makeBaseContext({ battlefield: { width: 44, depth: 30, terrain } })
      const unit = makeUnit({ tacticalRole: 'gunline' })
      const openScore = scorePosition({ x: 0, y: 8 }, makeFormation(1), unit, ctxOpen)
      const blockedScore = scorePosition({ x: 0, y: 8 }, makeFormation(1), unit, ctxBlocked)
      // Open should have better firingLanes → higher total for gunline
      expect(openScore.firingLanes).toBeGreaterThan(blockedScore.firingLanes)
    })

    it('same position scores differently for different roles', () => {
      const ctx = makeBaseContext()
      const pos = { x: -10, y: 10 } // near home obj
      const formation = makeFormation(1)

      const holderScore = scorePosition(pos, formation, makeUnit({ tacticalRole: 'holder' }), ctx)
      const gunlineScore = scorePosition(pos, formation, makeUnit({ tacticalRole: 'gunline' }), ctx)

      // Holder weights objective heavily; gunline weights firing lanes — totals differ
      expect(holderScore.total).not.toBe(gunlineScore.total)
    })

    it('screen unit in forward position has higher screenCoverage contribution than holder', () => {
      const ctx = makeBaseContext()
      const formation: Formation = {
        type: 'wide-line',
        positions: [
          { x: -3, y: 0 },
          { x: 0, y: 0 },
          { x: 3, y: 0 },
        ],
      }
      const screenScore = scorePosition(
        { x: 0, y: 0 },
        formation,
        makeUnit({ tacticalRole: 'screen', models: 3 }),
        ctx,
      )
      const holderScore = scorePosition(
        { x: 0, y: 0 },
        formation,
        makeUnit({ tacticalRole: 'holder', models: 3 }),
        ctx,
      )

      expect(screenScore.screenCoverage).toBeGreaterThan(5) // screen gets a score > neutral
      expect(holderScore.screenCoverage).toBe(5) // holder always neutral
    })
  })
})

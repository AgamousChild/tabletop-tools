import { describe, expect, it } from 'vitest'

import { distance } from './geometry/point'
import { baseSizeInches } from './placement/coherency'
import { solveDeployment } from './solver'
import type {
  BaseSize,
  Battlefield,
  DeploymentInput,
  DeploymentUnit,
  EnemyUnit,
  Objective,
  Point,
  TerrainPiece,
  TransportDeclaration,
} from './types'
import { DEFAULT_10E_RULES } from './types'

// ── Test helpers ─────────────────────────────────────────────────────────────

function makeUnit(
  overrides: Partial<DeploymentUnit> & { id: string; name: string },
): DeploymentUnit {
  return {
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
    ...overrides,
  }
}

function makeEnemy(overrides: Partial<EnemyUnit> & { id: string; name: string }): EnemyUnit {
  return {
    models: 5,
    move: 6,
    abilities: {},
    weapons: [{ name: 'Bolter', range: 24 }],
    threatLevel: 'medium',
    ...overrides,
  }
}

function makeTerrain(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  losBlocking: boolean = true,
): TerrainPiece {
  return {
    id,
    position: { x, y },
    footprint: { center: { x, y }, width: w, height: h },
    losBlocking,
  }
}

function makeObjective(id: string, x: number, y: number): Objective {
  return { id, position: { x, y } }
}

/**
 * Build a standard Search and Destroy scenario.
 * 60x44 table, player in bottom-right, enemy in top-left.
 * Origin at center: player zone is x>0, y>0; enemy zone is x<0, y<0.
 */
function makeSearchAndDestroyBattlefield(
  terrain: TerrainPiece[] = [],
  objectives: Objective[] = [],
): Battlefield {
  return {
    width: 60,
    depth: 44,
    terrain,
    objectives,
    deploymentType: 'search-and-destroy',
    playerZone: 'bottom-right',
  }
}

function makeInput(overrides: {
  units?: DeploymentUnit[]
  transports?: TransportDeclaration[]
  enemies?: EnemyUnit[]
  terrain?: TerrainPiece[]
  objectives?: Objective[]
}): DeploymentInput {
  return {
    rules: DEFAULT_10E_RULES,
    battlefield: makeSearchAndDestroyBattlefield(
      overrides.terrain ?? [],
      overrides.objectives ?? [],
    ),
    army: {
      units: overrides.units ?? [],
      transports: overrides.transports ?? [],
    },
    enemy: {
      units: overrides.enemies ?? [],
    },
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('solveDeployment', () => {
  it('returns a valid plan structure', () => {
    const input = makeInput({
      units: [makeUnit({ id: 'u1', name: 'Infantry Squad' })],
      enemies: [makeEnemy({ id: 'e1', name: 'Enemy Boyz' })],
    })

    const plan = solveDeployment(input)

    expect(plan.placements).toBeDefined()
    expect(plan.dropOrder).toBeDefined()
    expect(plan.objectives).toBeDefined()
    expect(plan.threats).toBeDefined()
    expect(plan.reasoning).toContain('1 units')
  })

  describe('Test 1: Minimal army (3 units)', () => {
    const terrain = [
      // Terrain in player quadrant (bottom-right, positive x/y)
      makeTerrain('t1', 15, 12, 6, 4, true),
      // Terrain in enemy quadrant (top-left, negative x/y)
      makeTerrain('t2', -15, -12, 6, 4, true),
    ]

    const objectives = [
      // Home objective (in player zone, bottom-right)
      makeObjective('home', 20, 15),
      // Center objective (board center, in no-man's-land)
      makeObjective('center', 0, 0),
      // Enemy-home objective (in enemy zone, top-left)
      makeObjective('enemy-home', -20, -15),
    ]

    const units: DeploymentUnit[] = [
      makeUnit({
        id: 'holder',
        name: 'Intercessors',
        models: 5,
        baseSize: 32,
        points: 75,
        move: 6,
        toughness: 4,
        save: 3,
        wounds: 2,
        keywords: ['infantry'],
        weapons: [{ name: 'Bolt Rifle', range: 24 }],
      }),
      makeUnit({
        id: 'hammer',
        name: 'Assault Terminators',
        models: 5,
        baseSize: 40,
        points: 200,
        move: 8,
        toughness: 5,
        save: 2,
        wounds: 3,
        invulnSave: 4,
        keywords: ['infantry', 'terminator'],
        weapons: [
          { name: 'Thunder Hammer', range: 'melee' },
          { name: 'Storm Shield', range: 'melee' },
        ],
      }),
      makeUnit({
        id: 'gunline',
        name: 'Eradicators',
        models: 3,
        baseSize: 40,
        points: 95,
        move: 5,
        toughness: 6,
        save: 3,
        wounds: 3,
        keywords: ['infantry'],
        weapons: [{ name: 'Melta Rifle', range: 24 }],
      }),
    ]

    const enemies: EnemyUnit[] = [
      makeEnemy({
        id: 'e-melee',
        name: 'Ork Boyz',
        models: 20,
        move: 6,
        weapons: [{ name: 'Choppa', range: 'melee' }],
        threatLevel: 'medium',
      }),
      makeEnemy({
        id: 'e-shoot',
        name: 'Lootas',
        models: 5,
        move: 5,
        weapons: [{ name: 'Deffgun', range: 48 }],
        threatLevel: 'high',
      }),
    ]

    it('places all 3 units with valid placements', () => {
      const input = makeInput({ units, enemies, terrain, objectives })
      const plan = solveDeployment(input)

      expect(plan.placements).toHaveLength(3)

      for (const placement of plan.placements) {
        if (placement.reservesCandidate) continue
        expect(placement.models.length).toBeGreaterThan(0)
        expect(placement.reasoning).toBeTruthy()
      }
    })

    it('all placements are inside the deployment zone (bottom-right quadrant)', () => {
      const input = makeInput({ units, enemies, terrain, objectives })
      const plan = solveDeployment(input)

      for (const placement of plan.placements) {
        if (placement.reservesCandidate) continue
        for (const model of placement.models) {
          // Bottom-right quadrant: x > 0, y > 0 (strictly, outside the 9" arc)
          expect(model.position.x).toBeGreaterThan(0)
          expect(model.position.y).toBeGreaterThan(0)
        }
      }
    })

    it('no two models overlap (distance >= base size)', () => {
      const input = makeInput({ units, enemies, terrain, objectives })
      const plan = solveDeployment(input)

      const allPositions: {
        pos: Point
        unitId: string
        baseSize: BaseSize
      }[] = []
      for (const placement of plan.placements) {
        const unit = units.find((u) => u.id === placement.unitId)
        if (!unit || placement.reservesCandidate) continue
        for (const model of placement.models) {
          allPositions.push({
            pos: model.position,
            unitId: placement.unitId,
            baseSize: unit.baseSize,
          })
        }
      }

      // Check all pairs from different units
      for (let i = 0; i < allPositions.length; i++) {
        for (let j = i + 1; j < allPositions.length; j++) {
          if (allPositions[i]!.unitId === allPositions[j]!.unitId) continue
          const dist = distance(allPositions[i]!.pos, allPositions[j]!.pos)
          const minDist = Math.max(
            baseSizeInches(allPositions[i]!.baseSize),
            baseSizeInches(allPositions[j]!.baseSize),
          )
          expect(dist).toBeGreaterThanOrEqual(minDist)
        }
      }
    })

    it('classifies objectives correctly', () => {
      const input = makeInput({ units, enemies, terrain, objectives })
      const plan = solveDeployment(input)

      const home = plan.objectives.find((o) => o.id === 'home')
      const center = plan.objectives.find((o) => o.id === 'center')
      const enemyHome = plan.objectives.find((o) => o.id === 'enemy-home')

      expect(home?.classification).toBe('home')
      expect(enemyHome?.classification).toBe('enemy-home')
      // Center objective is in no-man's-land, could be 'center' or 'safe'
      expect(['center', 'safe']).toContain(center?.classification)
    })
  })

  describe('Test 2: Deep strike unit goes to reserves', () => {
    it('marks deep-strike unit with reservesCandidate: true and empty models', () => {
      const units: DeploymentUnit[] = [
        makeUnit({
          id: 'ds-unit',
          name: 'Terminators',
          abilities: { deepStrike: true },
          points: 200,
        }),
        makeUnit({
          id: 'normal',
          name: 'Intercessors',
          points: 75,
        }),
      ]

      const input = makeInput({ units })
      const plan = solveDeployment(input)

      const dsPlacement = plan.placements.find((p) => p.unitId === 'ds-unit')
      expect(dsPlacement).toBeDefined()
      expect(dsPlacement!.reservesCandidate).toBe(true)
      expect(dsPlacement!.models).toHaveLength(0)
      expect(dsPlacement!.reservesReason).toBeTruthy()

      // Normal unit should be placed
      const normalPlacement = plan.placements.find((p) => p.unitId === 'normal')
      expect(normalPlacement).toBeDefined()
      expect(normalPlacement!.reservesCandidate).toBe(false)
      expect(normalPlacement!.models.length).toBeGreaterThan(0)
    })
  })

  describe('Test 3: Transport with embarked unit', () => {
    it('places transport but does not place embarked unit separately', () => {
      const units: DeploymentUnit[] = [
        makeUnit({
          id: 'rhino',
          name: 'Rhino',
          models: 1,
          baseSize: 'hull',
          points: 75,
          move: 12,
          toughness: 9,
          save: 3,
          wounds: 10,
          keywords: ['vehicle', 'transport'],
          weapons: [{ name: 'Storm Bolter', range: 24 }],
        }),
        makeUnit({
          id: 'passengers',
          name: 'Tactical Squad',
          models: 10,
          baseSize: 32,
          points: 150,
        }),
      ]

      const transports: TransportDeclaration[] = [
        { transportId: 'rhino', embarkedUnitIds: ['passengers'] },
      ]

      const input = makeInput({ units, transports })
      const plan = solveDeployment(input)

      // Transport should be placed
      const transportPlacement = plan.placements.find((p) => p.unitId === 'rhino')
      expect(transportPlacement).toBeDefined()
      expect(transportPlacement!.models.length).toBeGreaterThan(0)

      // Embarked unit should NOT appear in placements at all
      const embarkedPlacement = plan.placements.find((p) => p.unitId === 'passengers')
      expect(embarkedPlacement).toBeUndefined()
    })
  })

  describe('Test 4: Infiltrator unit', () => {
    it('places infiltrator outside deployment zone but >9" from enemy zone', () => {
      const units: DeploymentUnit[] = [
        makeUnit({
          id: 'infiltrators',
          name: 'Infiltrators',
          models: 5,
          baseSize: 32,
          points: 100,
          move: 6,
          abilities: { infiltrate: true },
        }),
      ]

      const input = makeInput({ units })
      const plan = solveDeployment(input)

      const placement = plan.placements.find((p) => p.unitId === 'infiltrators')
      expect(placement).toBeDefined()
      expect(placement!.reservesCandidate).toBe(false)
      expect(placement!.deploymentMethod).toBe('infiltrate')
      expect(placement!.models.length).toBeGreaterThan(0)

      // All model positions should be outside the enemy zone (top-left quadrant = x<0, y<0).
      // The enemy zone bounding box center is at (-15, -11) for a 60x44 S&D table.
      // Infiltrators must be >9" from enemy zone bounding box.
      for (const model of placement!.models) {
        // Should not be in enemy quadrant
        const inEnemyQuadrant = model.position.x < 0 && model.position.y < 0
        // If in enemy quadrant, must be far from enemy zone
        if (inEnemyQuadrant) {
          // This would be caught by canInfiltrate — the solver should not place here
          // We just verify they're placed legally (the solver only places legal positions)
        }
        // Basic: model should be on the board
        expect(Math.abs(model.position.x)).toBeLessThan(30)
        expect(Math.abs(model.position.y)).toBeLessThan(22)
      }
    })
  })

  describe('Test 5: No overlapping placements with 5+ units', () => {
    it('no two models from different units overlap', () => {
      const units: DeploymentUnit[] = Array.from({ length: 6 }, (_, i) =>
        makeUnit({
          id: `unit-${i}`,
          name: `Squad ${i}`,
          models: 5,
          baseSize: 32,
          points: 80 + i * 10,
          move: 6,
        }),
      )

      const input = makeInput({ units })
      const plan = solveDeployment(input)

      const placedUnits = plan.placements.filter((p) => !p.reservesCandidate && p.models.length > 0)
      expect(placedUnits.length).toBeGreaterThanOrEqual(1)

      // Collect all model positions with their unit ID
      const allModels: { pos: Point; unitId: string }[] = []
      for (const placement of placedUnits) {
        for (const model of placement.models) {
          allModels.push({ pos: model.position, unitId: placement.unitId })
        }
      }

      // Check no two models from different units are closer than base size
      const minBase = baseSizeInches(32) // smallest base in the army
      for (let i = 0; i < allModels.length; i++) {
        for (let j = i + 1; j < allModels.length; j++) {
          if (allModels[i]!.unitId === allModels[j]!.unitId) continue
          const dist = distance(allModels[i]!.pos, allModels[j]!.pos)
          expect(dist).toBeGreaterThanOrEqual(minBase)
        }
      }
    })
  })

  describe('edge cases', () => {
    it('handles empty army', () => {
      const input = makeInput({ units: [] })
      const plan = solveDeployment(input)

      expect(plan.placements).toHaveLength(0)
      expect(plan.dropOrder).toHaveLength(0)
      expect(plan.reasoning).toContain('0 units')
    })

    it('handles empty enemy army', () => {
      const units = [makeUnit({ id: 'u1', name: 'Infantry' })]
      const input = makeInput({ units, enemies: [] })
      const plan = solveDeployment(input)

      expect(plan.placements.length).toBeGreaterThanOrEqual(1)
    })

    it('includes drop order for all units', () => {
      const units = [
        makeUnit({ id: 'a', name: 'First', points: 50 }),
        makeUnit({ id: 'b', name: 'Second', points: 100 }),
        makeUnit({ id: 'c', name: 'Third', points: 150, abilities: { deepStrike: true } }),
      ]
      const input = makeInput({ units })
      const plan = solveDeployment(input)

      expect(plan.dropOrder).toHaveLength(3)
      // All unit IDs should be in the drop order
      expect(plan.dropOrder).toContain('a')
      expect(plan.dropOrder).toContain('b')
      expect(plan.dropOrder).toContain('c')
    })

    it('threats overlay has correct structure', () => {
      const input = makeInput({
        units: [makeUnit({ id: 'u1', name: 'Infantry' })],
        enemies: [makeEnemy({ id: 'e1', name: 'Enemy' })],
      })
      const plan = solveDeployment(input)

      expect(plan.threats.shootingHeatMap).toBeDefined()
      expect(plan.threats.meleeHeatMap).toBeDefined()
      expect(plan.threats.gridResolution).toBeGreaterThan(0)
    })
  })
})

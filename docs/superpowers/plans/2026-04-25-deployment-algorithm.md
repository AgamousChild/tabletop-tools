# Deployment Algorithm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 40K deployment algorithm that takes a battlefield (terrain, objectives, zones) and two army lists, then produces optimal unit placements with strategic reasoning.

**Architecture:** Pure TypeScript library in `packages/deployment/` — no UI, no server, no TTS dependency. All functions are pure: inputs in, placements out. The algorithm runs 9 phases: zone calculation, threat mapping, objective analysis, unit role assignment, drop ordering, legal position checking, strategic scoring, pre-game moves, and final unit shape placement. A future `apps/deployment/` will provide UI, and TTS integration will use the package as a library.

**Tech Stack:** TypeScript, Vitest, pure math (no external deps beyond Zod for input validation)

---

## File Structure

```
packages/deployment/
  src/
    types.ts                    — All input/output types, game rules config
    index.ts                    — Barrel export

    geometry/
      point.ts                  — Point, distance, line-segment operations
      point.test.ts
      polygon.ts                — Polygon containment, intersection
      polygon.test.ts
      los.ts                    — Line of sight through terrain footprints
      los.test.ts
      circle.ts                 — Circle/arc operations (exclusion zones)
      circle.test.ts

    zones/
      deployment-zones.ts       — Zone polygon generators per mission type
      deployment-zones.test.ts
      exclusion-zones.ts        — 9" arcs, infiltrator/scout exclusion areas
      exclusion-zones.test.ts

    threats/
      threat-range.ts           — Per-unit threat range calculations (shooting + melee)
      threat-range.test.ts
      threat-map.ts             — Heat map generation across battlefield grid
      threat-map.test.ts
      los-analysis.ts           — LOS from enemy zone through terrain
      los-analysis.test.ts

    objectives/
      classify.ts               — Objective classification (home, safe, center, expansion, enemy)
      classify.test.ts

    units/
      role-assignment.ts        — Strategic purpose + tactical role assignment
      role-assignment.test.ts
      drop-order.ts             — Deployment order optimizer
      drop-order.test.ts

    placement/
      legal-check.ts            — Set 1: legal position validation
      legal-check.test.ts
      coherency.ts              — Unit coherency validation + formation generators
      coherency.test.ts
      formations.ts             — Formation shape templates (block, dog bone, line, blob)
      formations.test.ts
      scoring.ts                — Set 2: strategic position scoring
      scoring.test.ts

    solver.ts                   — Top-level solver: runs all phases, returns deployment plan
    solver.test.ts

  package.json
  tsconfig.json
  vitest.config.ts
```

---

### Task 1: Package scaffolding + types

**Files:**
- Create: `packages/deployment/package.json`
- Create: `packages/deployment/tsconfig.json`
- Create: `packages/deployment/vitest.config.ts`
- Create: `packages/deployment/src/index.ts`
- Create: `packages/deployment/src/types.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@tabletop-tools/deployment",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "vitest": "^2.0.0"
  },
  "dependencies": {
    "zod": "^3.25.76"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: { globals: true }
})
```

- [ ] **Step 4: Create types.ts with all input/output types**

```typescript
// ── Game Rules Config ─────────────────────────────────────────────────────
// All values are edition-dependent and adjustable

export interface GameRulesConfig {
  deepStrikeExclusion: number        // inches from enemy models (10th ed: 9)
  infiltratorExclusionModels: number // inches from enemy models (9)
  infiltratorExclusionZone: number   // inches from enemy deployment zone (9)
  scoutExclusionModels: number       // inches from enemy models (9)
  coherency: {
    distance: number                 // inches between models (2)
    minConnections: number           // connections for small units (1)
    minConnectionsLarge: number      // connections for large units (2)
    largeUnitThreshold: number       // model count threshold (7)
  }
  engagementRange: number            // horizontal inches (1)
  chargeRange: { min: number; max: number; avg: number }  // 2D6
  advanceRange: { min: number; max: number; avg: number }  // D6
  objectiveControlRange: number      // inches from objective center (3)
  reserves: {
    maxUnitsPct: number              // max % of units in reserves (50)
    maxPointsPct: number             // max % of points in reserves (50)
    embarkedCount: boolean           // embarked units count toward limits (true)
    noArrivalTurn1: boolean          // no reserves turn 1 (true)
    mustArriveByRound: number        // destroyed if not arrived (3)
  }
}

export const DEFAULT_10E_RULES: GameRulesConfig = {
  deepStrikeExclusion: 9,
  infiltratorExclusionModels: 9,
  infiltratorExclusionZone: 9,
  scoutExclusionModels: 9,
  coherency: {
    distance: 2,
    minConnections: 1,
    minConnectionsLarge: 2,
    largeUnitThreshold: 7,
  },
  engagementRange: 1,
  chargeRange: { min: 2, max: 12, avg: 7 },
  advanceRange: { min: 1, max: 6, avg: 3.5 },
  objectiveControlRange: 3,
  reserves: {
    maxUnitsPct: 50,
    maxPointsPct: 50,
    embarkedCount: true,
    noArrivalTurn1: true,
    mustArriveByRound: 3,
  },
}

// ── Geometry ──────────────────────────────────────────────────────────────

export interface Point {
  x: number
  y: number
}

export interface Rect {
  center: Point
  width: number
  height: number
}

export interface LineSegment {
  a: Point
  b: Point
}

// ── Battlefield ───────────────────────────────────────────────────────────

export interface TerrainPiece {
  id: string
  position: Point         // center
  footprint: Rect         // bounding box
  losBlocking: boolean    // true for ruins (all current terrain)
}

export interface Objective {
  id: string
  position: Point
  classification?: 'home' | 'safe' | 'center' | 'expansion' | 'enemy-home'
}

export type DeploymentType =
  | 'search-and-destroy'
  | 'dawn-of-war'
  | 'hammer-and-anvil'
  | 'crucible-of-battle'
  | 'tipping-point'
  | 'sweeping-engagement'

export type PlayerZone = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top' | 'bottom' | 'left' | 'right'

export interface Battlefield {
  width: number           // inches (typically 60)
  depth: number           // inches (typically 44)
  terrain: TerrainPiece[]
  objectives: Objective[]
  deploymentType: DeploymentType
  playerZone: PlayerZone
}

// ── Units ─────────────────────────────────────────────────────────────────

export type StrategicPurpose = 'scoring' | 'killing' | 'holding'

export type TacticalRole =
  | 'holder' | 'screen' | 'hammer' | 'gunline' | 'mid-range-shooter'
  | 'transport' | 'infiltrator' | 'scout' | 'deep-strike'
  | 'anchor' | 'counter-charge'

export type BaseSize = 25 | 28 | 32 | 40 | 50 | 60 | 80 | 'oval-75x42' | 'hull'

export interface DeploymentUnit {
  id: string
  name: string
  models: number
  baseSize: BaseSize
  points: number
  move: number
  toughness: number
  save: number
  wounds: number
  invulnSave?: number
  fnp?: number
  keywords: string[]
  abilities: {
    scouts?: number          // Scout X" value
    infiltrate?: boolean
    deepStrike?: boolean
    advanceAndCharge?: boolean
  }
  weapons: {
    name: string
    range: number | 'melee'
    isAssault?: boolean
    isHeavy?: boolean
  }[]
  strategicPurpose?: StrategicPurpose
  tacticalRole?: TacticalRole
}

export interface TransportDeclaration {
  transportId: string
  embarkedUnitIds: string[]
}

export interface ArmyList {
  units: DeploymentUnit[]
  transports: TransportDeclaration[]
}

// ── Enemy ─────────────────────────────────────────────────────────────────

export interface EnemyUnit {
  id: string
  name: string
  models: number
  move: number
  abilities: {
    scouts?: number
    infiltrate?: boolean
    deepStrike?: boolean
    advanceAndCharge?: boolean
  }
  weapons: {
    name: string
    range: number | 'melee'
    isAssault?: boolean
  }[]
  threatLevel: 'low' | 'medium' | 'high'  // qualitative damage output
}

export interface EnemyArmy {
  units: EnemyUnit[]
}

// ── Algorithm Input ───────────────────────────────────────────────────────

export interface DeploymentInput {
  rules: GameRulesConfig
  battlefield: Battlefield
  army: ArmyList
  enemy: EnemyArmy
}

// ── Algorithm Output ──────────────────────────────────────────────────────

export type FormationType = 'block' | 'dog-bone' | 'line' | 'wide-line' | 'blob'

export interface ModelPlacement {
  modelIndex: number
  position: Point
}

export interface UnitPlacement {
  unitId: string
  formation: FormationType
  models: ModelPlacement[]
  reasoning: string
  deploymentMethod: 'deploy' | 'infiltrate' | 'scout-destination'
  scoutDestination?: Point    // where the unit ends up after scout move
  reservesCandidate: boolean
  reservesReason?: string
}

export interface ThreatOverlay {
  shootingHeatMap: number[][]   // 2D grid of shooting threat scores
  meleeHeatMap: number[][]      // 2D grid of melee threat scores
  gridResolution: number        // inches per grid cell
}

export interface DeploymentPlan {
  placements: UnitPlacement[]
  dropOrder: string[]           // unit IDs in deployment order
  objectives: Objective[]       // with classifications filled in
  threats: ThreatOverlay
  reasoning: string             // overall deployment strategy summary
}
```

- [ ] **Step 5: Create barrel export index.ts**

```typescript
export * from './types'
```

- [ ] **Step 6: Install dependencies**

Run: `cd packages/deployment && pnpm install`

- [ ] **Step 7: Verify test runner works**

Run: `cd packages/deployment && pnpm test -- --passWithNoTests`
Expected: PASS (no tests yet)

- [ ] **Step 8: Commit**

```bash
git add packages/deployment/
git commit -m "feat(deployment): scaffold package with types and config"
```

---

### Task 2: 2D geometry primitives

**Files:**
- Create: `packages/deployment/src/geometry/point.ts`
- Create: `packages/deployment/src/geometry/point.test.ts`
- Create: `packages/deployment/src/geometry/polygon.ts`
- Create: `packages/deployment/src/geometry/polygon.test.ts`
- Create: `packages/deployment/src/geometry/circle.ts`
- Create: `packages/deployment/src/geometry/circle.test.ts`
- Create: `packages/deployment/src/geometry/los.ts`
- Create: `packages/deployment/src/geometry/los.test.ts`

- [ ] **Step 1: Write point.test.ts**

Test: distance between two points, point equality, point offset, midpoint.

```typescript
import { describe, it, expect } from 'vitest'
import { distance, offset, midpoint } from './point'

describe('distance', () => {
  it('returns 0 for same point', () => {
    expect(distance({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(0)
  })
  it('returns correct distance for horizontal', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 0 })).toBe(3)
  })
  it('returns correct distance for diagonal', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
  })
})

describe('offset', () => {
  it('offsets a point by dx dy', () => {
    expect(offset({ x: 1, y: 2 }, 3, 4)).toEqual({ x: 4, y: 6 })
  })
})

describe('midpoint', () => {
  it('returns midpoint of two points', () => {
    expect(midpoint({ x: 0, y: 0 }, { x: 4, y: 6 })).toEqual({ x: 2, y: 3 })
  })
})
```

- [ ] **Step 2: Run test — verify FAIL**

Run: `cd packages/deployment && pnpm test -- src/geometry/point.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement point.ts**

```typescript
import type { Point } from '../types'

export function distance(a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return Math.sqrt(dx * dx + dy * dy)
}

export function offset(p: Point, dx: number, dy: number): Point {
  return { x: p.x + dx, y: p.y + dy }
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}
```

- [ ] **Step 4: Run test — verify PASS**

Run: `cd packages/deployment && pnpm test -- src/geometry/point.test.ts`
Expected: PASS

- [ ] **Step 5: Write polygon.test.ts**

Test: point-in-rectangle, point-in-polygon (convex), rectangle overlap, polygon from deployment zone.

```typescript
import { describe, it, expect } from 'vitest'
import { pointInRect, pointInPolygon, rectsOverlap } from './polygon'

describe('pointInRect', () => {
  const rect = { center: { x: 10, y: 10 }, width: 6, height: 4 }

  it('returns true for point inside', () => {
    expect(pointInRect({ x: 10, y: 10 }, rect)).toBe(true)
  })
  it('returns true for point on edge', () => {
    expect(pointInRect({ x: 7, y: 10 }, rect)).toBe(true)
  })
  it('returns false for point outside', () => {
    expect(pointInRect({ x: 0, y: 0 }, rect)).toBe(false)
  })
})

describe('rectsOverlap', () => {
  it('returns true for overlapping rects', () => {
    const a = { center: { x: 0, y: 0 }, width: 4, height: 4 }
    const b = { center: { x: 2, y: 2 }, width: 4, height: 4 }
    expect(rectsOverlap(a, b)).toBe(true)
  })
  it('returns false for separated rects', () => {
    const a = { center: { x: 0, y: 0 }, width: 4, height: 4 }
    const b = { center: { x: 10, y: 10 }, width: 4, height: 4 }
    expect(rectsOverlap(a, b)).toBe(false)
  })
})

describe('pointInPolygon', () => {
  // Simple square polygon
  const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]

  it('returns true for point inside', () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true)
  })
  it('returns false for point outside', () => {
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false)
  })
})
```

- [ ] **Step 6: Implement polygon.ts**

Point-in-rectangle via bounds check. Point-in-polygon via ray casting. Rect overlap via AABB test.

- [ ] **Step 7: Run tests — verify PASS**

- [ ] **Step 8: Write circle.test.ts**

Test: point inside circle, point inside quarter circle arc (for Search and Destroy exclusion zone).

- [ ] **Step 9: Implement circle.ts**

Point-in-circle via distance check. Quarter-circle for S&D uses distance + quadrant check.

- [ ] **Step 10: Write los.test.ts**

Test: line-segment intersection with rectangle edges. LOS blocked by terrain between two points. LOS from a set of positions (enemy zone sampling).

Key tests:
- Point A can see Point B (no terrain between) → true
- Point A cannot see Point B (terrain footprint between) → false
- Point inside terrain footprint → hidden from outside points
- Two points inside same terrain → can see each other

- [ ] **Step 11: Implement los.ts**

Line-segment intersection algorithm. `hasLOS(from: Point, to: Point, terrain: TerrainPiece[]): boolean`. `isHiddenFromZone(position: Point, zonePositions: Point[], terrain: TerrainPiece[]): boolean`.

- [ ] **Step 12: Run all geometry tests — verify PASS**

Run: `cd packages/deployment && pnpm test -- src/geometry/`
Expected: All PASS

- [ ] **Step 13: Commit**

```bash
git add packages/deployment/src/geometry/
git commit -m "feat(deployment): 2D geometry primitives — point, polygon, circle, LOS"
```

---

### Task 3: Deployment zone calculator

**Files:**
- Create: `packages/deployment/src/zones/deployment-zones.ts`
- Create: `packages/deployment/src/zones/deployment-zones.test.ts`
- Create: `packages/deployment/src/zones/exclusion-zones.ts`
- Create: `packages/deployment/src/zones/exclusion-zones.test.ts`

- [ ] **Step 1: Write deployment-zones.test.ts**

Test each mission type generates the correct polygon. Key test: Search and Destroy bottom-left quadrant is the full quadrant minus 9" quarter-circle from center.

```typescript
import { describe, it, expect } from 'vitest'
import { computeDeploymentZone, isInDeploymentZone } from './deployment-zones'

describe('Search and Destroy', () => {
  const zone = computeDeploymentZone({
    type: 'search-and-destroy',
    playerZone: 'bottom-left',
    tableWidth: 60,
    tableDepth: 44,
  })

  it('includes corner point', () => {
    expect(isInDeploymentZone({ x: -28, y: -20 }, zone)).toBe(true)
  })
  it('excludes center (inside 9" arc)', () => {
    expect(isInDeploymentZone({ x: -2, y: -2 }, zone)).toBe(false)
  })
  it('excludes enemy quadrant', () => {
    expect(isInDeploymentZone({ x: 20, y: 15 }, zone)).toBe(false)
  })
  it('excludes point on the 9" arc boundary', () => {
    // Point exactly 9" from center at 45 degrees
    expect(isInDeploymentZone({ x: -6.36, y: -6.36 }, zone)).toBe(false)
  })
})
```

- [ ] **Step 2: Implement deployment-zones.ts**

For each `DeploymentType` + `PlayerZone`, generate the zone polygon. Search and Destroy: full quadrant as a rectangle, then subtract points within 9" of center.

- [ ] **Step 3: Write exclusion-zones.test.ts**

Test: infiltrator exclusion area, scout exclusion area, deep strike exclusion area. Given enemy model positions and enemy zone, compute where infiltrators/scouts CAN and CANNOT go.

- [ ] **Step 4: Implement exclusion-zones.ts**

`canInfiltrate(point, enemyModels, enemyZone, rules)` — checks >9" from models and >9" from enemy zone.
`canScoutMoveTo(point, enemyModels, rules)` — checks >9" from models only.
`canDeepStrike(point, enemyModels, rules)` — checks >9" from models.

- [ ] **Step 5: Run all zone tests — verify PASS**

- [ ] **Step 6: Commit**

```bash
git add packages/deployment/src/zones/
git commit -m "feat(deployment): deployment zone calculator + exclusion zones"
```

---

### Task 4: Threat range and threat map

**Files:**
- Create: `packages/deployment/src/threats/threat-range.ts`
- Create: `packages/deployment/src/threats/threat-range.test.ts`
- Create: `packages/deployment/src/threats/threat-map.ts`
- Create: `packages/deployment/src/threats/threat-map.test.ts`
- Create: `packages/deployment/src/threats/los-analysis.ts`
- Create: `packages/deployment/src/threats/los-analysis.test.ts`

- [ ] **Step 1: Write threat-range.test.ts**

Test per-unit threat calculation:
- Standard unit (6" move): shooting = 6 + weapon range, melee = 6 + 12 = 18
- Advance+charge unit (6" move): melee = 6 + 6 + 12 = 24
- Assault weapon unit: shooting = 6 + 6 + range
- Scout unit (6" scout, 6" move): melee = 6 + 6 + 12 = 24 (or + advance)

- [ ] **Step 2: Implement threat-range.ts**

```typescript
export function maxShootingThreat(unit: EnemyUnit): number
export function maxMeleeThreat(unit: EnemyUnit, rules: GameRulesConfig): number
export function avgMeleeThreat(unit: EnemyUnit, rules: GameRulesConfig): number
```

- [ ] **Step 3: Write threat-map.test.ts**

Test: given a battlefield grid and enemy zone, generate a heat map. Points closer to enemy zone with clear LOS should have higher threat scores.

- [ ] **Step 4: Implement threat-map.ts**

Sample the enemy zone at grid resolution. For each sample point, project each enemy unit's threat range. Accumulate scores on the grid. Weight by threat level.

- [ ] **Step 5: Write los-analysis.test.ts**

Test: given terrain and an enemy zone, which points on the board are visible from ANY position in the enemy zone after movement?

- [ ] **Step 6: Implement los-analysis.ts**

`findSafeZones(battlefield, enemyZone, terrain)` — returns areas with no LOS from enemy zone.
`findHidingSpots(terrain, deploymentZone)` — terrain pieces inside or near zone where infantry can hide.

- [ ] **Step 7: Run all threat tests — verify PASS**

- [ ] **Step 8: Commit**

```bash
git add packages/deployment/src/threats/
git commit -m "feat(deployment): threat range calc + heat map + LOS analysis"
```

---

### Task 5: Objective classification

**Files:**
- Create: `packages/deployment/src/objectives/classify.ts`
- Create: `packages/deployment/src/objectives/classify.test.ts`

- [ ] **Step 1: Write classify.test.ts**

Test with Search and Destroy layout:
- Objective inside player zone → 'home'
- Objective inside enemy zone → 'enemy-home'
- Nearest no-man's-land objective to player zone → 'safe'
- Furthest no-man's-land objective from player zone → 'expansion'
- Remaining no-man's-land objectives → 'center'

- [ ] **Step 2: Implement classify.ts**

```typescript
export function classifyObjectives(
  objectives: Objective[],
  playerZone: Zone,
  enemyZone: Zone,
): Objective[]
```

Sort no-man's-land objectives by distance to player zone. Closest = safe, furthest = expansion, rest = center.

- [ ] **Step 3: Run tests — verify PASS**

- [ ] **Step 4: Commit**

```bash
git add packages/deployment/src/objectives/
git commit -m "feat(deployment): objective classification — home, safe, center, expansion"
```

---

### Task 6: Unit role assignment + drop order

**Files:**
- Create: `packages/deployment/src/units/role-assignment.ts`
- Create: `packages/deployment/src/units/role-assignment.test.ts`
- Create: `packages/deployment/src/units/drop-order.ts`
- Create: `packages/deployment/src/units/drop-order.test.ts`

- [ ] **Step 1: Write role-assignment.test.ts**

Test: given a unit's stats and abilities, assign strategic purpose and tactical role.
- Cheap infantry (low points, no special abilities) → scoring/holder
- High damage melee unit → killing/hammer
- Tough unit with high wounds/invuln → holding/anchor
- Unit with deep strike → scoring/deep-strike (reserves candidate)
- Unit with scouts → scoring/scout or killing/scout
- Unit with infiltrate → killing/infiltrator or scoring/infiltrator

- [ ] **Step 2: Implement role-assignment.ts**

Heuristic-based: score each role based on unit stats, pick the best fit. Allow manual override via `strategicPurpose` and `tacticalRole` fields on input.

- [ ] **Step 3: Write drop-order.test.ts**

Test: given assigned roles, determine deployment order.
- Holders first (obvious position, low information)
- Transports early (hide cargo intent)
- Hammers and infiltrators last (react to enemy)

- [ ] **Step 4: Implement drop-order.ts**

```typescript
export function computeDropOrder(units: DeploymentUnit[]): string[]
```

- [ ] **Step 5: Run tests — verify PASS**

- [ ] **Step 6: Commit**

```bash
git add packages/deployment/src/units/
git commit -m "feat(deployment): unit role assignment + deployment drop order"
```

---

### Task 7: Legal position checking + coherency

**Files:**
- Create: `packages/deployment/src/placement/legal-check.ts`
- Create: `packages/deployment/src/placement/legal-check.test.ts`
- Create: `packages/deployment/src/placement/coherency.ts`
- Create: `packages/deployment/src/placement/coherency.test.ts`
- Create: `packages/deployment/src/placement/formations.ts`
- Create: `packages/deployment/src/placement/formations.test.ts`

- [ ] **Step 1: Write coherency.test.ts**

Test the coherency rules:
- 5 models in a line, 2" apart → valid (each has 1+ neighbor)
- 10 models in a line, 2" apart → INVALID (middle models only have 1 neighbor each, need 2)
- 10 models in dog bone (3-chain-3) → valid
- 10 models in 2x5 block → valid

- [ ] **Step 2: Implement coherency.ts**

```typescript
export function isCoherent(positions: Point[], baseSizeMm: number, rules: GameRulesConfig): boolean
```

Build adjacency graph, check each model has enough neighbors.

- [ ] **Step 3: Write formations.test.ts**

Test: generate formation templates for different model counts and base sizes.
- 5 models, 32mm base → line, block, blob options
- 10 models, 32mm base → block, dog bone, wide line options (no conga)
- 3 models, 50mm base → triangle, line options

- [ ] **Step 4: Implement formations.ts**

```typescript
export function generateFormations(
  modelCount: number,
  baseSize: BaseSize,
  rules: GameRulesConfig,
): Formation[]

export interface Formation {
  type: FormationType
  positions: Point[]  // relative to center
}
```

- [ ] **Step 5: Write legal-check.test.ts**

Test Set 1 checks:
- Unit wholly inside zone → legal
- Unit partially outside zone → illegal
- Unit overlapping terrain → illegal
- Unit overlapping another unit → illegal
- Infiltrator >9" from enemies and zone → legal
- Infiltrator <9" from enemy → illegal

- [ ] **Step 6: Implement legal-check.ts**

```typescript
export function isLegalPlacement(
  formation: Formation,
  center: Point,
  zone: Zone,
  terrain: TerrainPiece[],
  occupiedPositions: Point[],
  rules: GameRulesConfig,
  method: 'deploy' | 'infiltrate',
  enemyModels?: Point[],
  enemyZone?: Zone,
): boolean
```

- [ ] **Step 7: Run all placement tests — verify PASS**

- [ ] **Step 8: Commit**

```bash
git add packages/deployment/src/placement/
git commit -m "feat(deployment): legal position check, coherency, formation templates"
```

---

### Task 8: Strategic scoring

**Files:**
- Create: `packages/deployment/src/placement/scoring.ts`
- Create: `packages/deployment/src/placement/scoring.test.ts`

- [ ] **Step 1: Write scoring.test.ts**

Test each scoring factor:
- Unit inside terrain → high cover score
- Unit behind terrain → medium cover score
- Unit in open → low cover score
- Unit on home objective with holder role → high role fit score
- Hammer unit hidden behind terrain → high turn 1 survival score
- Screen unit spread wide → high screen coverage score

- [ ] **Step 2: Implement scoring.ts**

```typescript
export interface PositionScore {
  cover: number           // 0-10
  threatExposure: number  // 0-10 (lower is better, inverted for total)
  chargeThreat: number    // 0-10 (lower is better)
  objectiveProximity: number // 0-10
  firingLanes: number     // 0-10
  screenCoverage: number  // 0-10
  infiltratorDenial: number // 0-10
  scoutValue: number      // 0-10
  counterScout: number    // 0-10
  turn1Survival: number   // 0-10
  roleFit: number         // 0-10
  formation: number       // 0-10
  total: number           // weighted sum
}

export function scorePosition(
  center: Point,
  formation: Formation,
  unit: DeploymentUnit,
  battlefield: Battlefield,
  threatMap: ThreatOverlay,
  objectives: Objective[],
  occupiedPositions: Point[],
  rules: GameRulesConfig,
): PositionScore
```

Weight factors based on unit role (gunline cares about firing lanes, screen cares about coverage, hammer cares about survival).

- [ ] **Step 3: Run tests — verify PASS**

- [ ] **Step 4: Commit**

```bash
git add packages/deployment/src/placement/scoring.ts packages/deployment/src/placement/scoring.test.ts
git commit -m "feat(deployment): strategic position scoring — 12 factors"
```

---

### Task 9: Top-level solver

**Files:**
- Create: `packages/deployment/src/solver.ts`
- Create: `packages/deployment/src/solver.test.ts`
- Update: `packages/deployment/src/index.ts`

- [ ] **Step 1: Write solver.test.ts**

Integration test: given a complete DeploymentInput (battlefield + army + enemy), produce a DeploymentPlan.

Test with simplified scenario:
- 60x44 table, 2 terrain pieces, 3 objectives
- Army: 3 units (holder, hammer, screen)
- Enemy: 2 units (melee threat, shooting threat)
- Verify: holder ends up on home objective, hammer is hidden, screen is forward

- [ ] **Step 2: Implement solver.ts**

Runs all 9 phases in sequence:
1. Calculate zones
2. Build threat map
3. Classify objectives
4. Assign unit roles
5. Compute drop order
6. For each unit in drop order:
   a. Generate formation options
   b. Sample candidate positions across the zone
   c. Filter to legal positions (Set 1)
   d. Score each legal position (Set 2)
   e. Select highest-scoring position
   f. Record placement + update occupied map
7. Compute pre-game moves (scout destinations)
8. Return complete DeploymentPlan

```typescript
export function solveDeployment(input: DeploymentInput): DeploymentPlan
```

- [ ] **Step 3: Run integration tests — verify PASS**

- [ ] **Step 4: Update index.ts barrel export**

```typescript
export * from './types'
export { solveDeployment } from './solver'
export { computeDeploymentZone, isInDeploymentZone } from './zones/deployment-zones'
export { classifyObjectives } from './objectives/classify'
export { computeDropOrder } from './units/drop-order'
// ... other public APIs
```

- [ ] **Step 5: Run full test suite**

Run: `cd packages/deployment && pnpm test`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/deployment/
git commit -m "feat(deployment): top-level solver — runs all 9 phases, produces deployment plan"
```

---

### Task 10: Smoke test with real game data

**Files:**
- Create: `packages/deployment/src/scenarios/we-vs-sob.test.ts`

- [ ] **Step 1: Write a test using the actual WE vs Sororitas game**

Use the real data from our TTS game:
- Layout 1 terrain positions
- Search and Destroy deployment
- 1990pt World Eaters army
- 1965pt Adepta Sororitas army
- Verify the output produces reasonable placements

- [ ] **Step 2: Verify the deployment plan makes tactical sense**

Check:
- Sacresants or cheap unit on home objective
- Exorcist in backfield with firing lanes
- Repentia Rhino forward
- Paragons + Vahl positioned aggressively but safely
- Seraphim/Zephyrim flagged as reserves candidates
- No units placed off the table or overlapping terrain

- [ ] **Step 3: Commit**

```bash
git add packages/deployment/src/scenarios/
git commit -m "test(deployment): smoke test with real WE vs Sororitas game data"
```

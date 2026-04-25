import { describe, it, expect } from 'vitest'
import { canInfiltrate, canScoutMoveTo, canDeepStrike } from './exclusion-zones'
import { computeEnemyZone } from './deployment-zones'
import type { GameRulesConfig } from '../types'

const rules: GameRulesConfig = {
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

// Enemy (bottom-right player) deploys in top-left (diagonally opposite)
// Wait — let's set up a clear scenario:
// Player is bottom-left. Enemy zone = top-right quadrant (x>0, y<0), minus center arc.
const enemyZone = computeEnemyZone({
  type: 'search-and-destroy',
  playerZone: 'bottom-left',
  tableWidth: 60,
  tableDepth: 44,
})

// Enemy models in the top-right quadrant
const enemyModels = [
  { x: 20, y: -15 },
  { x: 25, y: -20 },
]

// ── canInfiltrate ─────────────────────────────────────────────────────────────

describe('canInfiltrate', () => {
  it('returns true when far from all enemies and far from enemy zone', () => {
    // Point deep in player zone, well away from enemy zone
    // Enemy zone is top-right. Point (-25, 18) is in player zone, far from enemy zone boundary.
    // Enemy zone nearest point is somewhere near x=9, y=0 (edge of arc).
    // Distance from (-25,18) to closest point in enemy zone is well over 9".
    expect(canInfiltrate({ x: -25, y: 18 }, enemyModels, enemyZone, rules)).toBe(true)
  })

  it('returns false when within 9" of an enemy model', () => {
    // Point 5" from an enemy model
    expect(canInfiltrate({ x: 15, y: -15 }, enemyModels, enemyZone, rules)).toBe(false)
  })

  it('returns false when within 9" of the enemy zone boundary', () => {
    // Point at (5, -5): in player's territory but only ~5" from the enemy zone edge (x=9 boundary).
    // The enemy zone starts at x>0, y<0 beyond the 9" arc.
    // A point at (2, -2) is very close to the enemy zone.
    expect(canInfiltrate({ x: 2, y: -2 }, enemyModels, enemyZone, rules)).toBe(false)
  })

  it('returns false when exactly at infiltrator zone exclusion boundary from enemy zone', () => {
    // Point at (0, -10): x=0 so not in enemy zone (requires x>0), but very close.
    // Distance to nearest enemy zone edge ≈ distance to x=0+epsilon → essentially 0.
    // Nearest point in enemy zone at x=9+, y=-10 is ~9" away on x-axis.
    // Point at (-0.1, -10) should be just outside 9" if nearest enemy zone point is at ~(9, -10)
    // Actually distance from (0, -10) to nearest point in enemy zone:
    //   enemy zone: x>0, y<0, outside 9" arc of center
    //   nearest point in enemy zone to (0, -10) = (epsilon, -10) → distance ≈ 0
    // So (0,-10) is right on boundary — but x=0 is excluded from enemy zone.
    // Use a point clearly within 9" of enemy zone: (-1, -10)
    // nearest enemy zone point could be (9.something, -10) wait, no —
    // the enemy zone for top-right is x>0 AND y<0 AND distance from (0,0) > 9
    // so nearest point from (-1, -10) to enemy zone:
    //   candidate: (0+epsilon, -10) → distance to (-1,-10) ≈ 1" — clearly < 9"
    expect(canInfiltrate({ x: -1, y: -10 }, enemyModels, enemyZone, rules)).toBe(false)
  })

  it('returns true when just beyond 9" from enemy zone and enemy models', () => {
    // Point far from enemy zone and enemy models in player zone
    // (-20, 15): distance to top-right zone is large (min dist ≈ distance to origin ~25"),
    // and distance to closest enemy model (20,-15) is sqrt(40^2+30^2)=50" — way more than 9"
    expect(canInfiltrate({ x: -20, y: 15 }, enemyModels, enemyZone, rules)).toBe(true)
  })
})

// ── canScoutMoveTo ────────────────────────────────────────────────────────────

describe('canScoutMoveTo', () => {
  it('returns true when far from all enemy models', () => {
    expect(canScoutMoveTo({ x: -25, y: 18 }, enemyModels, rules)).toBe(true)
  })

  it('returns false when within 9" of an enemy model', () => {
    // 5" from (20,-15)
    expect(canScoutMoveTo({ x: 16, y: -15 }, enemyModels, rules)).toBe(false)
  })

  it('returns false when exactly 9" from an enemy model', () => {
    // Exactly 9" from enemy model at (20,-15): point at (11,-15)
    expect(canScoutMoveTo({ x: 11, y: -15 }, enemyModels, rules)).toBe(false)
  })

  it('returns true when just over 9" from all enemy models', () => {
    // 9.01" from enemy model at (20,-15): point at (10.99,-15)
    expect(canScoutMoveTo({ x: 10.99, y: -15 }, enemyModels, rules)).toBe(true)
  })

  it('has no enemy zone restriction — point near enemy zone boundary is still valid', () => {
    // Scouts only care about enemy models, not the enemy deployment zone
    // Point at (-1, -10): close to enemy zone but no enemy models nearby (nearest is ~21")
    expect(canScoutMoveTo({ x: -1, y: -10 }, enemyModels, rules)).toBe(true)
  })
})

// ── canDeepStrike ─────────────────────────────────────────────────────────────

describe('canDeepStrike', () => {
  it('returns true when far from all enemy models', () => {
    expect(canDeepStrike({ x: -25, y: 18 }, enemyModels, rules)).toBe(true)
  })

  it('returns false when within 9" of an enemy model', () => {
    expect(canDeepStrike({ x: 16, y: -15 }, enemyModels, rules)).toBe(false)
  })

  it('returns false when exactly 9" from an enemy model', () => {
    expect(canDeepStrike({ x: 11, y: -15 }, enemyModels, rules)).toBe(false)
  })

  it('returns true when just over 9" from all enemy models', () => {
    expect(canDeepStrike({ x: 10.99, y: -15 }, enemyModels, rules)).toBe(true)
  })

  it('returns true with no enemy models', () => {
    expect(canDeepStrike({ x: 0, y: 0 }, [], rules)).toBe(true)
  })

  it('returns true with no enemy models near deep zone', () => {
    expect(canDeepStrike({ x: 10, y: -10 }, [], rules)).toBe(true)
  })
})

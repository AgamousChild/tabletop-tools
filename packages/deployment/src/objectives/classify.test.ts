import { describe, expect, it } from 'vitest'

import { distance } from '../geometry/point'
import type { Objective } from '../types'
import type { DeploymentZone } from '../zones/deployment-zones'
import { classifyObjectives } from './classify'

// ── Test fixture: Search and Destroy style layout ─────────────────────────────
//
// Origin at center, 60x44 table.
// Player: bottom-left quadrant, Enemy: top-right quadrant.
// Quarter-circle arc (r=9) excluded from each zone.

const playerZone: DeploymentZone = {
  contains: (p) => p.x < 0 && p.y < 0 && distance(p, { x: 0, y: 0 }) > 9,
  bounds: { center: { x: -15, y: -11 }, width: 30, height: 22 },
}

const enemyZone: DeploymentZone = {
  contains: (p) => p.x > 0 && p.y > 0 && distance(p, { x: 0, y: 0 }) > 9,
  bounds: { center: { x: 15, y: 11 }, width: 30, height: 22 },
}

// Five objectives at standard 40K Search-and-Destroy positions
// (-16,-12): player home   (inside player zone)
// (-4.8, 3.6): no-man's-land (quadrant mismatch)
// (4.8,-3.6): no-man's-land (quadrant mismatch)
// (16, 12): enemy home     (inside enemy zone)
// (16,-12): no-man's-land  (wrong quadrant for enemy zone)

const five: Objective[] = [
  { id: 'o1', position: { x: -16, y: -12 } },
  { id: 'o2', position: { x: -4.8, y: 3.6 } },
  { id: 'o3', position: { x: 4.8, y: -3.6 } },
  { id: 'o4', position: { x: 16, y: 12 } },
  { id: 'o5', position: { x: 16, y: -12 } },
]

describe('classifyObjectives', () => {
  // ── Standard 5-objective layout ───────────────────────────────────────────

  it('classifies the objective inside the player zone as home', () => {
    const result = classifyObjectives(five, playerZone, enemyZone)
    const o1 = result.find((o) => o.id === 'o1')!
    expect(o1.classification).toBe('home')
  })

  it('classifies the objective inside the enemy zone as enemy-home', () => {
    const result = classifyObjectives(five, playerZone, enemyZone)
    const o4 = result.find((o) => o.id === 'o4')!
    expect(o4.classification).toBe('enemy-home')
  })

  it("classifies three no-man's-land objectives into safe, center, expansion", () => {
    const result = classifyObjectives(five, playerZone, enemyZone)
    const nml = result.filter((o) => o.id === 'o2' || o.id === 'o3' || o.id === 'o5')
    const classifications = nml.map((o) => o.classification).sort()
    expect(classifications).toEqual(['center', 'expansion', 'safe'])
  })

  it("the no-man's-land objective closest to player zone center is safe", () => {
    // playerZone.bounds.center = (-15, -11)
    // o2 = (-4.8, 3.6):  dist to (-15,-11) ≈ 17.0
    // o3 = (4.8, -3.6):  dist to (-15,-11) ≈ 20.5
    // o5 = (16, -12):    dist to (-15,-11) ≈ 31.0
    // Closest = o2 → safe
    const result = classifyObjectives(five, playerZone, enemyZone)
    const o2 = result.find((o) => o.id === 'o2')!
    expect(o2.classification).toBe('safe')
  })

  it("the no-man's-land objective furthest from player zone center is expansion", () => {
    // Furthest = o5 → expansion
    const result = classifyObjectives(five, playerZone, enemyZone)
    const o5 = result.find((o) => o.id === 'o5')!
    expect(o5.classification).toBe('expansion')
  })

  it("the middle no-man's-land objective is center", () => {
    const result = classifyObjectives(five, playerZone, enemyZone)
    const o3 = result.find((o) => o.id === 'o3')!
    expect(o3.classification).toBe('center')
  })

  it('returns a new array and does not mutate the input', () => {
    const original = five.map((o) => ({ ...o }))
    classifyObjectives(five, playerZone, enemyZone)
    five.forEach((o, i) => expect(o.classification).toBe(original[i].classification))
  })

  // ── Single no-man's-land objective → center ───────────────────────────────

  it("classifies a single no-man's-land objective as center", () => {
    const objs: Objective[] = [
      { id: 'o1', position: { x: -16, y: -12 } }, // home
      { id: 'o2', position: { x: 16, y: 12 } }, // enemy-home
      { id: 'o3', position: { x: 0, y: 0 } }, // no-man's-land (center table)
    ]
    const result = classifyObjectives(objs, playerZone, enemyZone)
    expect(result.find((o) => o.id === 'o3')!.classification).toBe('center')
  })

  // ── Two no-man's-land objectives → safe + center (no expansion) ───────────

  it("with two no-man's-land objectives, the closer one is safe and further is center", () => {
    const objs: Objective[] = [
      { id: 'o1', position: { x: -16, y: -12 } }, // home
      { id: 'o2', position: { x: 16, y: 12 } }, // enemy-home
      { id: 'near', position: { x: -4.8, y: 3.6 } }, // closer to player zone center
      { id: 'far', position: { x: 16, y: -12 } }, // further
    ]
    const result = classifyObjectives(objs, playerZone, enemyZone)
    expect(result.find((o) => o.id === 'near')!.classification).toBe('safe')
    expect(result.find((o) => o.id === 'far')!.classification).toBe('center')
  })

  it("with two no-man's-land objectives, neither is classified as expansion", () => {
    const objs: Objective[] = [
      { id: 'near', position: { x: -4.8, y: 3.6 } },
      { id: 'far', position: { x: 16, y: -12 } },
    ]
    const result = classifyObjectives(objs, playerZone, enemyZone)
    expect(result.every((o) => o.classification !== 'expansion')).toBe(true)
  })

  // ── All objectives in no-man's-land ──────────────────────────────────────

  it("handles all objectives in no-man's-land (no home or enemy-home)", () => {
    // None of these are inside player or enemy zone
    const objs: Objective[] = [
      { id: 'a', position: { x: -4.8, y: 3.6 } },
      { id: 'b', position: { x: 4.8, y: -3.6 } },
      { id: 'c', position: { x: 16, y: -12 } },
    ]
    const result = classifyObjectives(objs, playerZone, enemyZone)
    const classes = result.map((o) => o.classification).sort()
    expect(classes).toEqual(['center', 'expansion', 'safe'])
  })

  it('always overwrites existing classification, recalculating from scratch', () => {
    const objs: Objective[] = [
      { id: 'o1', position: { x: -16, y: -12 }, classification: 'expansion' as const },
    ]
    const result = classifyObjectives(objs, playerZone, enemyZone)
    // Was 'expansion', should now be 'home' because it's in the player zone
    expect(result[0].classification).toBe('home')
  })
})

import { distance } from '../geometry/point'
import type { Objective } from '../types'
import type { DeploymentZone } from '../zones/deployment-zones'

/**
 * Classifies each objective relative to the player's deployment zone:
 *
 * - **home**: inside `playerZone`
 * - **enemy-home**: inside `enemyZone`
 * - **safe**: the no-man's-land objective closest to the player zone center
 * - **expansion**: the no-man's-land objective furthest from the player zone center
 * - **center**: everything else in no-man's-land
 *
 * Special cases for no-man's-land count:
 * - 0 → no no-man's-land objectives (nothing to label)
 * - 1 → center
 * - 2 → safe + center (no expansion)
 * - 3+ → safe, expansion, and center for the rest
 *
 * Always recalculates from scratch — any existing `classification` is overwritten.
 * Returns a new array; the input is not mutated.
 */
export function classifyObjectives(
  objectives: Objective[],
  playerZone: DeploymentZone,
  enemyZone: DeploymentZone,
): Objective[] {
  const zoneCenter = playerZone.bounds.center

  // Partition objectives into zone buckets
  const homeIds = new Set<string>()
  const enemyHomeIds = new Set<string>()
  const noMansLandIds: string[] = []

  for (const obj of objectives) {
    if (playerZone.contains(obj.position)) {
      homeIds.add(obj.id)
    } else if (enemyZone.contains(obj.position)) {
      enemyHomeIds.add(obj.id)
    } else {
      noMansLandIds.push(obj.id)
    }
  }

  // Sort no-man's-land objectives by distance to player zone center (ascending)
  const byDistance = noMansLandIds
    .map((id) => {
      const obj = objectives.find((o) => o.id === id)!
      return { id, dist: distance(obj.position, zoneCenter) }
    })
    .sort((a, b) => a.dist - b.dist)

  // Assign no-man's-land labels based on count
  const nmlClassification = new Map<string, Objective['classification']>()
  const count = byDistance.length

  if (count === 1) {
    nmlClassification.set(byDistance[0].id, 'center')
  } else if (count === 2) {
    nmlClassification.set(byDistance[0].id, 'safe')
    nmlClassification.set(byDistance[1].id, 'center')
  } else if (count >= 3) {
    nmlClassification.set(byDistance[0].id, 'safe')
    nmlClassification.set(byDistance[count - 1].id, 'expansion')
    for (let i = 1; i < count - 1; i++) {
      nmlClassification.set(byDistance[i].id, 'center')
    }
  }

  // Build output — new objects, never mutate input
  return objectives.map((obj): Objective => {
    if (homeIds.has(obj.id)) {
      return { ...obj, classification: 'home' }
    }
    if (enemyHomeIds.has(obj.id)) {
      return { ...obj, classification: 'enemy-home' }
    }
    const nmlClass = nmlClassification.get(obj.id)
    if (nmlClass !== undefined) {
      return { ...obj, classification: nmlClass }
    }
    // Fallback: should not be reachable
    return { ...obj }
  })
}

import type { DeploymentUnit, StrategicPurpose, TacticalRole } from '../types'

// ── Strategic Purpose ─────────────────────────────────────────────────────────

function hasMeleeWeapon(unit: DeploymentUnit): boolean {
  return unit.weapons.some((w) => w.range === 'melee')
}

function meleeWeaponCount(unit: DeploymentUnit): number {
  return unit.weapons.filter((w) => w.range === 'melee').length
}

function deriveStrategicPurpose(unit: DeploymentUnit): StrategicPurpose {
  const { toughness, invulnSave, wounds, abilities } = unit

  // Killing: advanceAndCharge is an aggressive assault marker
  if (abilities.advanceAndCharge) return 'killing'

  // Killing: multiple melee weapons → dedicated assault unit
  if (meleeWeaponCount(unit) >= 2) return 'killing'

  // Holding: high toughness, strong invuln, or high wounds
  if (toughness >= 6) return 'holding'
  if (invulnSave !== undefined && invulnSave <= 4) return 'holding'
  if (wounds >= 8) return 'holding'

  // Scoring: everything else
  return 'scoring'
}

// ── Tactical Role ─────────────────────────────────────────────────────────────

const TRANSPORT_NAME_PATTERNS = /\b(transport|rhino|chimera|razorback|land raider|repulsor|impulsor|devilfish|ghost ark|night scythe)\b/i

function deriveTransport(unit: DeploymentUnit): boolean {
  return (
    unit.keywords.some((k) => k.toLowerCase() === 'transport') ||
    (unit.keywords.some((k) => k.toLowerCase() === 'vehicle') &&
      TRANSPORT_NAME_PATTERNS.test(unit.name))
  )
}

function allOrMostlyRanged(unit: DeploymentUnit): boolean {
  const ranged = unit.weapons.filter((w) => w.range !== 'melee')
  return ranged.length > 0 && ranged.length >= unit.weapons.length - 1
}

function maxRangedRange(unit: DeploymentUnit): number {
  const rangedRanges = unit.weapons
    .filter((w) => w.range !== 'melee')
    .map((w) => w.range as number)
  return rangedRanges.length > 0 ? Math.max(...rangedRanges) : 0
}

function deriveTacticalRole(unit: DeploymentUnit, purpose: StrategicPurpose): TacticalRole {
  const { abilities, points, models, move, toughness, wounds, invulnSave } = unit

  // Special deployment abilities take priority — they define HOW the unit deploys
  if (abilities.deepStrike) return 'deep-strike'
  if (abilities.infiltrate) return 'infiltrator'
  if (abilities.scouts !== undefined) return 'scout'

  // Transport vehicles
  if (deriveTransport(unit)) return 'transport'

  // High durability anchors: wounds >= 8 or good invuln on a tough body
  if (wounds >= 8 || (invulnSave !== undefined && toughness >= 5)) return 'anchor'

  // Cheap chaff: inexpensive with enough bodies
  if (points < 80 && models >= 5) {
    // Fast/mobile chaff acts as a screen
    if (move >= 10) return 'screen'
    return 'holder'
  }

  // Ranged specialists — check weapon profile
  if (allOrMostlyRanged(unit)) {
    const maxRange = maxRangedRange(unit)
    if (maxRange >= 36) return 'gunline'
    if (maxRange >= 18) return 'mid-range-shooter'
  }

  // Melee roles — hammer charges in, counter-charge reacts
  if (hasMeleeWeapon(unit)) {
    if (purpose === 'killing') return 'counter-charge'
    if (move >= 8) return 'hammer'
  }

  return 'screen'
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Assign strategicPurpose and tacticalRole to each unit.
 * Manually set values are preserved — the caller's intent overrides heuristics.
 * Returns a new array; input is not mutated.
 */
export function assignRoles(units: DeploymentUnit[]): DeploymentUnit[] {
  return units.map((unit) => {
    const purpose = unit.strategicPurpose ?? deriveStrategicPurpose(unit)
    const role = unit.tacticalRole ?? deriveTacticalRole(unit, purpose)
    return { ...unit, strategicPurpose: purpose, tacticalRole: role }
  })
}

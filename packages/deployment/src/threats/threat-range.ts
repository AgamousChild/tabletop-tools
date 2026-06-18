import type { EnemyUnit, GameRulesConfig } from '../types'

const THREAT_WEIGHT: Record<EnemyUnit['threatLevel'], number> = {
  low: 1,
  medium: 2,
  high: 3,
}

/** Expose the weight map for consumers (e.g. heat-map scoring). */
export { THREAT_WEIGHT }

/**
 * Maximum shooting threat range for an enemy unit.
 *
 * For each ranged weapon:
 *   - Standard: unit.move + weapon.range
 *   - Assault:  unit.move + advanceRange.max + weapon.range
 *     (assault weapons fire after advancing)
 *
 * Returns the largest range across all ranged weapons.
 * Melee-only units return 0.
 */
export function maxShootingThreat(unit: EnemyUnit, rules: GameRulesConfig = DEFAULT_RULES): number {
  let max = 0
  for (const weapon of unit.weapons) {
    if (weapon.range === 'melee') continue
    const base = weapon.isAssault
      ? unit.move + rules.advanceRange.max + weapon.range
      : unit.move + weapon.range
    if (base > max) max = base
  }
  return max
}

/**
 * Maximum melee threat range for an enemy unit.
 *
 * Base:           unit.move + chargeRange.max
 * AdvanceAndCharge: unit.move + advanceRange.max + chargeRange.max
 * Scouts:         scouts + above (scouts value is a pre-game move bonus)
 */
export function maxMeleeThreat(unit: EnemyUnit, rules: GameRulesConfig): number {
  const base = unit.abilities.advanceAndCharge
    ? unit.move + rules.advanceRange.max + rules.chargeRange.max
    : unit.move + rules.chargeRange.max
  return base + (unit.abilities.scouts ?? 0)
}

/**
 * Average melee threat range for an enemy unit.
 *
 * Same formula as maxMeleeThreat but uses avg values instead of max.
 */
export function avgMeleeThreat(unit: EnemyUnit, rules: GameRulesConfig): number {
  const base = unit.abilities.advanceAndCharge
    ? unit.move + rules.advanceRange.avg + rules.chargeRange.avg
    : unit.move + rules.chargeRange.avg
  return base + (unit.abilities.scouts ?? 0)
}

// ── Internal fallback ─────────────────────────────────────────────────────────
// Used only when no rules are passed to maxShootingThreat (rare case).
// maxMeleeThreat and avgMeleeThreat always require rules (no default).

import { DEFAULT_10E_RULES as DEFAULT_RULES } from '../types'

/**
 * Attack-count invariant utilities.
 *
 * total_attacks = model_count × weapons_per_model × attacks_per_weapon
 *
 * attacks_per_weapon is the EXPECTED VALUE of the dice notation:
 *   D6 → 3.5, D3 → 2, 2D6 → 7, 2D3 → 4, D6+1 → 4.5, flat integer → itself
 *
 * Both the server router and the client pipeline use this to enforce
 * that we never persist or display a wrong total.
 */
import { resolveAvg } from '@tabletop-tools/util'

export interface AttackCountFactors {
  modelCount: number
  weaponsPerModel: number
  attacksPerWeapon: number
  totalAttacks: number
}

/**
 * Converts a dice notation string or numeric string to its expected value.
 * Supports: "3", "2.5", "D6", "d3", "2D6", "D6+1", "2D3+2", "D6-1".
 *
 * Throws on unrecognised notation — preserves this call site's original
 * error semantics (server rejects bad data before it hits the DB). See
 * packages/util/src/dice-notation.ts (D2-07 item 3) for the shared parser.
 */
export function resolveAttacksExpected(notation: string): number {
  return resolveAvg(notation, { onInvalid: 'throw' })
}

/**
 * Computes all attack-count factors and asserts the invariant.
 * Throws if any input is invalid (zero counts, unrecognised notation).
 */
export function computeTotalAttacks(
  modelCount: number,
  weaponsPerModel: number,
  attacksNotation: string,
): AttackCountFactors {
  if (modelCount <= 0) {
    throw new Error(`computeTotalAttacks: modelCount must be > 0, got ${modelCount}`)
  }
  if (weaponsPerModel <= 0) {
    throw new Error(`computeTotalAttacks: weaponsPerModel must be > 0, got ${weaponsPerModel}`)
  }

  const attacksPerWeapon = resolveAttacksExpected(attacksNotation)
  const totalAttacks = modelCount * weaponsPerModel * attacksPerWeapon

  return { modelCount, weaponsPerModel, attacksPerWeapon, totalAttacks }
}

const INVARIANT_EPSILON = 0.0001

/**
 * Asserts that the stored totalAttacks matches the product of its factors.
 * Use before any DB write to catch data integrity bugs early.
 */
export function assertAttackCountInvariant(factors: AttackCountFactors): void {
  const { modelCount, weaponsPerModel, attacksPerWeapon, totalAttacks } = factors
  const expected = modelCount * weaponsPerModel * attacksPerWeapon
  if (Math.abs(totalAttacks - expected) > INVARIANT_EPSILON) {
    throw new Error(
      `Attack-count invariant violated: ` +
        `${modelCount} × ${weaponsPerModel} × ${attacksPerWeapon} = ${expected} ` +
        `but totalAttacks = ${totalAttacks}`,
    )
  }
}

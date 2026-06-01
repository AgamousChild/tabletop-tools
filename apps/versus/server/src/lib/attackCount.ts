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

export interface AttackCountFactors {
  modelCount: number
  weaponsPerModel: number
  attacksPerWeapon: number
  totalAttacks: number
}

const DICE_NOTATION = /^(\d+)?[Dd](\d+)(?:\+(\d+))?$/

/**
 * Converts a dice notation string or numeric string to its expected value.
 * Supports: "3", "2.5", "D6", "d3", "2D6", "D6+1", "2D3+2".
 */
export function resolveAttacksExpected(notation: string): number {
  const trimmed = notation.trim()

  // Plain number (int or decimal)
  const asNum = Number(trimmed)
  if (!isNaN(asNum) && trimmed !== '') {
    return asNum
  }

  // Dice notation: [multiplier]D[sides][+bonus]
  const match = trimmed.match(DICE_NOTATION)
  if (match) {
    const multiplier = match[1] ? parseInt(match[1], 10) : 1
    const sides = parseInt(match[2], 10)
    const bonus = match[3] ? parseInt(match[3], 10) : 0
    // Expected value of one die: (sides + 1) / 2
    const dieExpected = (sides + 1) / 2
    return multiplier * dieExpected + bonus
  }

  throw new Error(`resolveAttacksExpected: unrecognised notation "${notation}"`)
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

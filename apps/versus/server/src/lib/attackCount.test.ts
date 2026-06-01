/**
 * Attack-count invariant tests.
 * Per spec §4: total_attacks = model_count × weapons_per_model × attacks_per_weapon
 * attacks_per_weapon is the EXPECTED VALUE of the dice notation (D6 → 3.5, 2D3 → 4).
 * These tests are the CRITICAL regression guard for the recurring attack-count bug.
 */
import { describe, expect, it } from 'vitest'

import {
  assertAttackCountInvariant,
  computeTotalAttacks,
  resolveAttacksExpected,
} from './attackCount'

describe('resolveAttacksExpected', () => {
  it('returns flat integer unchanged', () => {
    expect(resolveAttacksExpected('3')).toBe(3)
  })

  it('parses D6 as 3.5', () => {
    expect(resolveAttacksExpected('D6')).toBe(3.5)
  })

  it('parses d6 (lowercase) as 3.5', () => {
    expect(resolveAttacksExpected('d6')).toBe(3.5)
  })

  it('parses D3 as 2', () => {
    expect(resolveAttacksExpected('D3')).toBe(2)
  })

  it('parses 2D6 as 7', () => {
    expect(resolveAttacksExpected('2D6')).toBe(7)
  })

  it('parses 2D3 as 4', () => {
    expect(resolveAttacksExpected('2D3')).toBe(4)
  })

  it('parses D6+1 as 4.5', () => {
    expect(resolveAttacksExpected('D6+1')).toBe(4.5)
  })

  it('parses D6+2 as 5.5', () => {
    expect(resolveAttacksExpected('D6+2')).toBe(5.5)
  })

  it('parses D3+1 as 3', () => {
    expect(resolveAttacksExpected('D3+1')).toBe(3)
  })

  it('parses 2D6+3 as 10', () => {
    expect(resolveAttacksExpected('2D6+3')).toBe(10)
  })

  it('handles numeric string with decimals', () => {
    expect(resolveAttacksExpected('2.5')).toBe(2.5)
  })

  it('throws on unrecognised notation', () => {
    expect(() => resolveAttacksExpected('garbage')).toThrow()
  })
})

describe('computeTotalAttacks', () => {
  it('10 Intercessors, 1 weapon each, A=2 → 20 total attacks', () => {
    // Spec §4 worked example 1
    const result = computeTotalAttacks(10, 1, '2')
    expect(result.modelCount).toBe(10)
    expect(result.weaponsPerModel).toBe(1)
    expect(result.attacksPerWeapon).toBe(2)
    expect(result.totalAttacks).toBe(20)
  })

  it('3 Aggressors, 2 weapons each, A=D6 → 3 × 2 × 3.5 = 21', () => {
    // Spec §4 worked example 2
    const result = computeTotalAttacks(3, 2, 'D6')
    expect(result.modelCount).toBe(3)
    expect(result.weaponsPerModel).toBe(2)
    expect(result.attacksPerWeapon).toBe(3.5)
    expect(result.totalAttacks).toBeCloseTo(21)
  })

  it('1 Captain, 1 weapon, A=5 → 5', () => {
    // Spec §4 worked example 3
    const result = computeTotalAttacks(1, 1, '5')
    expect(result.totalAttacks).toBe(5)
  })

  it('enforces product invariant: totalAttacks === modelCount × weaponsPerModel × attacksPerWeapon', () => {
    const r = computeTotalAttacks(5, 3, 'D6+1')
    expect(r.totalAttacks).toBeCloseTo(r.modelCount * r.weaponsPerModel * r.attacksPerWeapon)
  })

  it('throws on zero model count', () => {
    expect(() => computeTotalAttacks(0, 1, '2')).toThrow()
  })

  it('throws on zero weapons per model', () => {
    expect(() => computeTotalAttacks(5, 0, '2')).toThrow()
  })
})

describe('assertAttackCountInvariant', () => {
  it('passes when totalAttacks matches factors within tolerance', () => {
    expect(() =>
      assertAttackCountInvariant({
        modelCount: 10,
        weaponsPerModel: 1,
        attacksPerWeapon: 2,
        totalAttacks: 20,
      }),
    ).not.toThrow()
  })

  it('throws when totalAttacks does not match product', () => {
    expect(() =>
      assertAttackCountInvariant({
        modelCount: 10,
        weaponsPerModel: 1,
        attacksPerWeapon: 2,
        totalAttacks: 18,
      }),
    ).toThrow(/invariant/)
  })

  it('passes for floating-point result within epsilon', () => {
    // 3 × 2 × 3.5 = 21.0 — should not throw due to float precision
    expect(() =>
      assertAttackCountInvariant({
        modelCount: 3,
        weaponsPerModel: 2,
        attacksPerWeapon: 3.5,
        totalAttacks: 21,
      }),
    ).not.toThrow()
  })
})

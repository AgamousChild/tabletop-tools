import { describe, expect, it } from 'vitest'

import {
  avgDamagePerAttack,
  getStrengthTier,
  getToughnessTier,
  woundRollNeeded,
} from './combat-tiers'

describe('woundRollNeeded', () => {
  it('S >= 2×T → 2+', () => {
    expect(woundRollNeeded(8, 4)).toBe(2)
    expect(woundRollNeeded(12, 4)).toBe(2)
  })

  it('S > T → 3+', () => {
    expect(woundRollNeeded(5, 4)).toBe(3)
    expect(woundRollNeeded(7, 4)).toBe(3)
  })

  it('S = T → 4+', () => {
    expect(woundRollNeeded(4, 4)).toBe(4)
  })

  it('S < T → 5+', () => {
    expect(woundRollNeeded(3, 4)).toBe(5)
  })

  it('S <= T/2 → 6+', () => {
    expect(woundRollNeeded(2, 4)).toBe(6)
    expect(woundRollNeeded(3, 8)).toBe(6)
  })
})

describe('getToughnessTier', () => {
  it('T3 is light-infantry', () => {
    expect(getToughnessTier(3)?.name).toBe('light-infantry')
  })

  it('T4 is standard-infantry', () => {
    expect(getToughnessTier(4)?.name).toBe('standard-infantry')
  })

  it('T6 is elite-infantry', () => {
    expect(getToughnessTier(6)?.name).toBe('elite-infantry')
  })

  it('T10 is heavy-vehicle', () => {
    expect(getToughnessTier(10)?.name).toBe('heavy-vehicle')
  })

  it('T12 is super-heavy', () => {
    expect(getToughnessTier(12)?.name).toBe('super-heavy')
  })
})

describe('getStrengthTier', () => {
  it('S4 is anti-light', () => {
    expect(getStrengthTier(4)?.name).toBe('anti-light')
  })

  it('S5 is anti-infantry', () => {
    expect(getStrengthTier(5)?.name).toBe('anti-infantry')
  })

  it('S9 is anti-vehicle', () => {
    expect(getStrengthTier(9)?.name).toBe('anti-vehicle')
  })
})

describe('avgDamagePerAttack', () => {
  it('calculates bolt rifle vs T4 3+ save', () => {
    // 2A, BS3+, S4, T4, AP-1, Sv3+, D1
    const dmg = avgDamagePerAttack(2, 3, 4, 4, 1, 3, 1)
    // Hit: 4/6, Wound: 3/6, Save: 3+(−1)=4+ → 3/6 save → 3/6 unsaved, D1
    // 2 * (4/6) * (3/6) * (3/6) * 1 ≈ 0.333
    expect(dmg).toBeGreaterThan(0)
    expect(dmg).toBeLessThan(1)
  })

  it('more attacks = more damage', () => {
    const dmg1 = avgDamagePerAttack(1, 3, 4, 4, 1, 3, 1)
    const dmg2 = avgDamagePerAttack(2, 3, 4, 4, 1, 3, 1)
    expect(dmg2).toBeCloseTo(dmg1 * 2, 5)
  })

  it('invulnerable save reduces damage vs high AP', () => {
    // S12, T4, AP-4 against 3+ save → modified save 7+ (no save)
    const noInvuln = avgDamagePerAttack(1, 3, 12, 4, 4, 3, 2)
    // Same but with 4++ invuln → gets a 4+ save
    const withInvuln = avgDamagePerAttack(1, 3, 12, 4, 4, 3, 2, 4)
    expect(withInvuln).toBeLessThan(noInvuln)
  })
})

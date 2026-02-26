import { describe, expect, it } from 'vitest'

import { BATTLE_SIZES, validateArmy } from './armyRules'
import type { BattleSize, ListUnit } from './armyRules'

const strikeForce2000: BattleSize = BATTLE_SIZES[2] // 2000pts, max 3

describe('BATTLE_SIZES', () => {
  it('has 4 battle sizes', () => {
    expect(BATTLE_SIZES).toHaveLength(4)
  })

  it('Incursion is 500pts with max 1 duplicate', () => {
    expect(BATTLE_SIZES[0]).toMatchObject({ points: 500, maxDuplicates: 1 })
  })

  it('Strike Force 2000 has max 3 duplicates', () => {
    expect(strikeForce2000).toMatchObject({ points: 2000, maxDuplicates: 3 })
  })
})

describe('validateArmy', () => {
  it('returns no errors for valid army', () => {
    const units: ListUnit[] = [
      { unitContentId: 'u1', unitName: 'Captain', unitPoints: 100, count: 1, isWarlord: true },
      { unitContentId: 'u2', unitName: 'Intercessors', unitPoints: 80, count: 2 },
    ]
    const errors = validateArmy(units, strikeForce2000)
    expect(errors).toHaveLength(0)
  })

  it('detects over-points', () => {
    const units: ListUnit[] = [
      { unitContentId: 'u1', unitName: 'Captain', unitPoints: 1100, count: 1, isWarlord: true },
      { unitContentId: 'u2', unitName: 'Squad', unitPoints: 1000, count: 1 },
    ]
    const errors = validateArmy(units, strikeForce2000)
    expect(errors.some((e) => e.type === 'OVER_POINTS')).toBe(true)
  })

  it('detects duplicate limit exceeded', () => {
    const units: ListUnit[] = [
      { unitContentId: 'u1', unitName: 'Captain', unitPoints: 100, count: 1, isWarlord: true },
      { unitContentId: 'u2', unitName: 'Intercessors', unitPoints: 80, count: 4 },
    ]
    const errors = validateArmy(units, strikeForce2000)
    expect(errors.some((e) => e.type === 'DUPLICATE_LIMIT')).toBe(true)
  })

  it('detects missing warlord', () => {
    const units: ListUnit[] = [
      { unitContentId: 'u1', unitName: 'Intercessors', unitPoints: 80, count: 1 },
    ]
    const errors = validateArmy(units, strikeForce2000)
    expect(errors.some((e) => e.type === 'NO_WARLORD')).toBe(true)
  })

  it('no warlord error for empty army', () => {
    const errors = validateArmy([], strikeForce2000)
    expect(errors.some((e) => e.type === 'NO_WARLORD')).toBe(false)
  })

  it('respects 500pt incursion max 1 duplicate', () => {
    const incursion = BATTLE_SIZES[0]
    const units: ListUnit[] = [
      { unitContentId: 'u1', unitName: 'Captain', unitPoints: 100, count: 1, isWarlord: true },
      { unitContentId: 'u2', unitName: 'Intercessors', unitPoints: 80, count: 2 },
    ]
    const errors = validateArmy(units, incursion)
    expect(errors.some((e) => e.type === 'DUPLICATE_LIMIT')).toBe(true)
  })
})

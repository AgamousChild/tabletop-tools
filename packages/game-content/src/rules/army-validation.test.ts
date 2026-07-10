import { describe, expect, it } from 'vitest'

import type { BattleSize, ListUnit } from './army-validation.js'
import { validateArmy } from './army-validation.js'

// Sample battle sizes for testing — mirrors the 4 standard matched-play
// battle sizes. The engine takes BattleSize as a parameter and owns no
// canonical table itself (see the module header comment).
const INCURSION: BattleSize = {
  name: 'Incursion',
  points: 500,
  maxDuplicates: 1,
  description: 'Small-scale skirmish',
}
const STRIKE_FORCE_2000: BattleSize = {
  name: 'Strike Force',
  points: 2000,
  maxDuplicates: 3,
  description: 'Tournament standard',
}

describe('validateArmy', () => {
  it('returns no errors for valid army', () => {
    const units: ListUnit[] = [
      { unitContentId: 'u1', unitName: 'Captain', unitPoints: 100, count: 1, isWarlord: true },
      { unitContentId: 'u2', unitName: 'Intercessors', unitPoints: 80, count: 2 },
    ]
    const errors = validateArmy(units, STRIKE_FORCE_2000)
    expect(errors).toHaveLength(0)
  })

  it('detects over-points', () => {
    const units: ListUnit[] = [
      { unitContentId: 'u1', unitName: 'Captain', unitPoints: 1100, count: 1, isWarlord: true },
      { unitContentId: 'u2', unitName: 'Squad', unitPoints: 1000, count: 1 },
    ]
    const errors = validateArmy(units, STRIKE_FORCE_2000)
    expect(errors.some((e) => e.type === 'OVER_POINTS')).toBe(true)
  })

  it('detects duplicate limit exceeded', () => {
    const units: ListUnit[] = [
      { unitContentId: 'u1', unitName: 'Captain', unitPoints: 100, count: 1, isWarlord: true },
      { unitContentId: 'u2', unitName: 'Intercessors', unitPoints: 80, count: 4 },
    ]
    const errors = validateArmy(units, STRIKE_FORCE_2000)
    expect(errors.some((e) => e.type === 'DUPLICATE_LIMIT')).toBe(true)
  })

  it('detects missing warlord', () => {
    const units: ListUnit[] = [
      { unitContentId: 'u1', unitName: 'Intercessors', unitPoints: 80, count: 1 },
    ]
    const errors = validateArmy(units, STRIKE_FORCE_2000)
    expect(errors.some((e) => e.type === 'NO_WARLORD')).toBe(true)
  })

  it('no warlord error for empty army', () => {
    const errors = validateArmy([], STRIKE_FORCE_2000)
    expect(errors.some((e) => e.type === 'NO_WARLORD')).toBe(false)
  })

  it('respects 500pt incursion max 1 duplicate', () => {
    const units: ListUnit[] = [
      { unitContentId: 'u1', unitName: 'Captain', unitPoints: 100, count: 1, isWarlord: true },
      { unitContentId: 'u2', unitName: 'Intercessors', unitPoints: 80, count: 2 },
    ]
    const errors = validateArmy(units, INCURSION)
    expect(errors.some((e) => e.type === 'DUPLICATE_LIMIT')).toBe(true)
  })

  it('exempts Battleline units from duplicate limits', () => {
    const units: ListUnit[] = [
      { unitContentId: 'u1', unitName: 'Captain', unitPoints: 100, count: 1, isWarlord: true },
      {
        unitContentId: 'u2',
        unitName: 'Intercessors',
        unitPoints: 80,
        count: 3,
        role: 'Battleline',
      },
    ]
    const errors = validateArmy(units, INCURSION)
    expect(errors.some((e) => e.type === 'DUPLICATE_LIMIT')).toBe(false)
  })

  it('still limits non-Battleline units when Battleline is exempt', () => {
    const units: ListUnit[] = [
      { unitContentId: 'u1', unitName: 'Captain', unitPoints: 100, count: 1, isWarlord: true },
      {
        unitContentId: 'u2',
        unitName: 'Intercessors',
        unitPoints: 80,
        count: 3,
        role: 'Battleline',
      },
      { unitContentId: 'u3', unitName: 'Aggressors', unitPoints: 120, count: 2, role: 'Infantry' },
    ]
    const errors = validateArmy(units, INCURSION)
    expect(errors.some((e) => e.type === 'DUPLICATE_LIMIT')).toBe(true)
    expect(errors.find((e) => e.type === 'DUPLICATE_LIMIT')?.message).toContain('Aggressors')
  })
})

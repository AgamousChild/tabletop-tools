import { describe, expect, it } from 'vitest'

import {
  classifyGrants,
  detectScope,
  detectWeaponTypes,
  isBoardingAction,
  isLegends,
} from './filters'

describe('isBoardingAction', () => {
  it('detects Boarding Actions type', () => {
    expect(isBoardingAction({ type: 'Boarding Actions' })).toBe(true)
  })

  it('case insensitive', () => {
    expect(isBoardingAction({ type: 'boarding actions' })).toBe(true)
  })

  it('returns false for empty type', () => {
    expect(isBoardingAction({ type: '' })).toBe(false)
  })

  it('returns false for normal detachments', () => {
    expect(isBoardingAction({ type: 'some other type' })).toBe(false)
  })
})

describe('isLegends', () => {
  it('detects legends datasheets', () => {
    expect(isLegends({ isLegends: true })).toBe(true)
  })

  it('returns false for non-legends', () => {
    expect(isLegends({ isLegends: false })).toBe(false)
  })

  it('returns false for missing field', () => {
    expect(isLegends({})).toBe(false)
  })
})

describe('detectScope', () => {
  it('detects stratagem scope', () => {
    expect(detectScope('stratagem', 'any content')).toBe('stratagem')
  })

  it('detects bearer scope from enhancement text', () => {
    expect(detectScope('enhancement', 'The bearer gains +1 Attack')).toBe('bearer')
  })

  it('detects unit scope from leader text', () => {
    expect(
      detectScope('unit-ability', 'While this model is leading a unit, models in that unit gain'),
    ).toBe('unit')
  })

  it('detects army scope for faction abilities', () => {
    expect(detectScope('faction-ability', 'All ADEPTUS ASTARTES units from your army')).toBe('army')
  })
})

describe('detectWeaponTypes', () => {
  it('detects torrent', () => {
    expect(detectWeaponTypes('Torrent weapons equipped by models')).toContain('torrent')
  })

  it('detects melee', () => {
    expect(detectWeaponTypes('melee weapons equipped by models')).toContain('melee')
  })

  it('detects multiple types', () => {
    const types = detectWeaponTypes('Torrent or Melta weapons')
    expect(types).toContain('torrent')
    expect(types).toContain('melta')
  })

  it('returns all for generic', () => {
    expect(detectWeaponTypes('weapons equipped by models')).toEqual(['all'])
  })
})

describe('classifyGrants', () => {
  it('detects sustained hits', () => {
    const g = classifyGrants('weapons have the [SUSTAINED HITS 1] ability')
    expect(g.grantsAbility).toContain('sustained hits')
  })

  it('detects wound re-rolls', () => {
    const g = classifyGrants('you can re-roll the Wound roll')
    expect(g.grantsRerolls).toBe('wound')
  })

  it('detects hit re-rolls', () => {
    const g = classifyGrants('you can re-roll the Hit roll')
    expect(g.grantsRerolls).toBe('hit')
  })

  it('detects twin-linked as wound re-rolls', () => {
    const g = classifyGrants('weapons have the [TWIN-LINKED] ability')
    expect(g.grantsRerolls).toBe('wound')
  })

  it('detects devastating wounds', () => {
    const g = classifyGrants('weapons have the [DEVASTATING WOUNDS] ability')
    expect(g.grantsAbility).toContain('devastating wounds')
  })

  it('returns null for no grants', () => {
    const g = classifyGrants('This unit can advance and charge')
    expect(g.grantsRerolls).toBeNull()
    expect(g.grantsAbility).toEqual([])
  })
})

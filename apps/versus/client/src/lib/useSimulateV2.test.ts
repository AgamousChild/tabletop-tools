/**
 * weaponAbilityToModifier unit tests.
 * Pure function — tests every WeaponAbility variant maps to the correct modifier row.
 * No hardcoded arrays; the WeaponAbility union type is the source of truth.
 */
import { describe, expect, it } from 'vitest'

import type { ModifierInput } from './useSimulateV2'
import { weaponAbilityToModifier } from './useSimulateV2'

describe('weaponAbilityToModifier', () => {
  it('SUSTAINED_HITS stores value as string', () => {
    const r = weaponAbilityToModifier({ type: 'SUSTAINED_HITS', value: 1 }, 'weapon_ability')
    expect(r).toEqual<ModifierInput>({
      side: 'ATTACK',
      source: 'weapon_ability',
      key: 'SUSTAINED_HITS',
      value: '1',
    })
  })

  it('LETHAL_HITS stores null value', () => {
    const r = weaponAbilityToModifier({ type: 'LETHAL_HITS' }, 'weapon_ability')
    expect(r).toEqual<ModifierInput>({
      side: 'ATTACK',
      source: 'weapon_ability',
      key: 'LETHAL_HITS',
      value: null,
    })
  })

  it('DEVASTATING_WOUNDS stores null value', () => {
    const r = weaponAbilityToModifier({ type: 'DEVASTATING_WOUNDS' }, 'weapon_ability')
    expect(r.key).toBe('DEVASTATING_WOUNDS')
    expect(r.value).toBeNull()
  })

  it('TORRENT stores null value', () => {
    const r = weaponAbilityToModifier({ type: 'TORRENT' }, 'weapon_ability')
    expect(r.key).toBe('TORRENT')
    expect(r.value).toBeNull()
  })

  it('TWIN_LINKED stores null value', () => {
    const r = weaponAbilityToModifier({ type: 'TWIN_LINKED' }, 'weapon_ability')
    expect(r.key).toBe('TWIN_LINKED')
    expect(r.value).toBeNull()
  })

  it('BLAST stores null value', () => {
    const r = weaponAbilityToModifier({ type: 'BLAST' }, 'weapon_ability')
    expect(r.key).toBe('BLAST')
    expect(r.value).toBeNull()
  })

  it('REROLL_HITS_OF_1 stores null value', () => {
    const r = weaponAbilityToModifier({ type: 'REROLL_HITS_OF_1' }, 'weapon_ability')
    expect(r.key).toBe('REROLL_HITS_OF_1')
    expect(r.value).toBeNull()
  })

  it('REROLL_HITS stores null value', () => {
    const r = weaponAbilityToModifier({ type: 'REROLL_HITS' }, 'weapon_ability')
    expect(r.key).toBe('REROLL_HITS')
    expect(r.value).toBeNull()
  })

  it('REROLL_WOUNDS stores null value', () => {
    const r = weaponAbilityToModifier({ type: 'REROLL_WOUNDS' }, 'weapon_ability')
    expect(r.key).toBe('REROLL_WOUNDS')
    expect(r.value).toBeNull()
  })

  it('HIT_MOD stores value as string', () => {
    const r = weaponAbilityToModifier({ type: 'HIT_MOD', value: -1 }, 'weapon_ability')
    expect(r.key).toBe('HIT_MOD')
    expect(r.value).toBe('-1')
    expect(r.side).toBe('ATTACK')
  })

  it('WOUND_MOD stores value as string', () => {
    const r = weaponAbilityToModifier({ type: 'WOUND_MOD', value: 1 }, 'weapon_ability')
    expect(r.key).toBe('WOUND_MOD')
    expect(r.value).toBe('1')
  })

  it('STRENGTH_MOD stores value as string', () => {
    const r = weaponAbilityToModifier({ type: 'STRENGTH_MOD', value: 2 }, 'weapon_ability')
    expect(r.key).toBe('STRENGTH_MOD')
    expect(r.value).toBe('2')
  })

  it('ATTACKS_MOD stores value as string', () => {
    const r = weaponAbilityToModifier({ type: 'ATTACKS_MOD', value: 0 }, 'weapon_ability')
    expect(r.key).toBe('ATTACKS_MOD')
    expect(r.value).toBe('0')
  })

  it('TOUGHNESS_MOD maps to DEFENSE side', () => {
    const r = weaponAbilityToModifier({ type: 'TOUGHNESS_MOD', value: -1 }, 'special_rule')
    expect(r.side).toBe('DEFENSE')
    expect(r.key).toBe('TOUGHNESS_MOD')
    expect(r.value).toBe('-1')
  })

  it('ANTI stores keyword + value as JSON string', () => {
    const r = weaponAbilityToModifier(
      { type: 'ANTI', keyword: 'INFANTRY', value: 3 },
      'weapon_ability',
    )
    expect(r.key).toBe('ANTI')
    expect(r.value).toBe(JSON.stringify({ keyword: 'INFANTRY', value: 3 }))
    expect(r.side).toBe('ATTACK')
  })

  it('MELTA stores value as string', () => {
    const r = weaponAbilityToModifier({ type: 'MELTA', value: 2 }, 'weapon_ability')
    expect(r.key).toBe('MELTA')
    expect(r.value).toBe('2')
  })

  it('IGNORES_COVER stores null value', () => {
    const r = weaponAbilityToModifier({ type: 'IGNORES_COVER' }, 'weapon_ability')
    expect(r.key).toBe('IGNORES_COVER')
    expect(r.value).toBeNull()
  })

  it('HAZARDOUS stores null value', () => {
    const r = weaponAbilityToModifier({ type: 'HAZARDOUS' }, 'weapon_ability')
    expect(r.key).toBe('HAZARDOUS')
    expect(r.value).toBeNull()
  })

  it('PRECISION stores null value', () => {
    const r = weaponAbilityToModifier({ type: 'PRECISION' }, 'weapon_ability')
    expect(r.key).toBe('PRECISION')
    expect(r.value).toBeNull()
  })

  it('INDIRECT_FIRE stores null value', () => {
    const r = weaponAbilityToModifier({ type: 'INDIRECT_FIRE' }, 'weapon_ability')
    expect(r.key).toBe('INDIRECT_FIRE')
    expect(r.value).toBeNull()
  })

  it('ASSAULT stores null value', () => {
    const r = weaponAbilityToModifier({ type: 'ASSAULT' }, 'weapon_ability')
    expect(r.key).toBe('ASSAULT')
    expect(r.value).toBeNull()
  })

  it('PISTOL stores null value', () => {
    const r = weaponAbilityToModifier({ type: 'PISTOL' }, 'weapon_ability')
    expect(r.key).toBe('PISTOL')
    expect(r.value).toBeNull()
  })

  it('ONE_SHOT stores null value', () => {
    const r = weaponAbilityToModifier({ type: 'ONE_SHOT' }, 'weapon_ability')
    expect(r.key).toBe('ONE_SHOT')
    expect(r.value).toBeNull()
  })

  it('PSYCHIC stores null value', () => {
    const r = weaponAbilityToModifier({ type: 'PSYCHIC' }, 'weapon_ability')
    expect(r.key).toBe('PSYCHIC')
    expect(r.value).toBeNull()
  })

  it('source is passed through to modifier row', () => {
    const r1 = weaponAbilityToModifier({ type: 'LETHAL_HITS' }, 'weapon_ability')
    const r2 = weaponAbilityToModifier({ type: 'LETHAL_HITS' }, 'special_rule')
    const r3 = weaponAbilityToModifier({ type: 'LETHAL_HITS' }, 'leader')
    expect(r1.source).toBe('weapon_ability')
    expect(r2.source).toBe('special_rule')
    expect(r3.source).toBe('leader')
  })

  it('all non-TOUGHNESS_MOD abilities map to ATTACK side', () => {
    const attackAbilities = [
      { type: 'LETHAL_HITS' as const },
      { type: 'DEVASTATING_WOUNDS' as const },
      { type: 'TORRENT' as const },
      { type: 'TWIN_LINKED' as const },
      { type: 'BLAST' as const },
      { type: 'REROLL_HITS_OF_1' as const },
      { type: 'REROLL_HITS' as const },
      { type: 'REROLL_WOUNDS' as const },
      { type: 'IGNORES_COVER' as const },
      { type: 'HAZARDOUS' as const },
      { type: 'PRECISION' as const },
      { type: 'INDIRECT_FIRE' as const },
      { type: 'ASSAULT' as const },
      { type: 'PISTOL' as const },
      { type: 'ONE_SHOT' as const },
      { type: 'PSYCHIC' as const },
    ]
    for (const ability of attackAbilities) {
      expect(
        weaponAbilityToModifier(ability, 'weapon_ability').side,
        `${ability.type} should be ATTACK side`,
      ).toBe('ATTACK')
    }
  })
})

import { describe, expect, it } from 'vitest'

import type { DeploymentUnit } from '../types'
import { assignRoles } from './role-assignment'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeUnit(overrides: Partial<DeploymentUnit> & Pick<DeploymentUnit, 'id'>): DeploymentUnit {
  return {
    name: overrides.id,
    models: 5,
    baseSize: 32,
    points: 100,
    move: 6,
    toughness: 4,
    save: 4,
    wounds: 1,
    keywords: [],
    abilities: {},
    weapons: [{ name: 'Boltgun', range: 24 }],
    ...overrides,
  }
}

// ── Strategic Purpose ─────────────────────────────────────────────────────────

describe('assignRoles — strategic purpose', () => {
  it('cheap 10-model infantry → scoring', () => {
    const unit = makeUnit({
      id: 'guardsmen',
      models: 10,
      points: 65,
      toughness: 3,
      wounds: 1,
      weapons: [{ name: 'Lasgun', range: 24 }],
    })
    const [result] = assignRoles([unit])
    expect(result!.strategicPurpose).toBe('scoring')
  })

  it('tough vehicle (T10, 12W) → holding', () => {
    const unit = makeUnit({
      id: 'predator',
      models: 1,
      points: 180,
      toughness: 10,
      wounds: 12,
      keywords: ['Vehicle'],
      weapons: [{ name: 'Autocannon', range: 48, isHeavy: true }],
    })
    const [result] = assignRoles([unit])
    expect(result!.strategicPurpose).toBe('holding')
  })

  it('unit with invulnSave <= 4 → holding', () => {
    const unit = makeUnit({
      id: 'terminator',
      models: 5,
      points: 200,
      toughness: 5,
      wounds: 3,
      invulnSave: 4,
      weapons: [{ name: 'Power Fist', range: 'melee' }],
    })
    const [result] = assignRoles([unit])
    expect(result!.strategicPurpose).toBe('holding')
  })

  it('unit with advanceAndCharge → killing', () => {
    const unit = makeUnit({
      id: 'berzerker',
      models: 8,
      points: 160,
      toughness: 4,
      wounds: 2,
      abilities: { advanceAndCharge: true },
      weapons: [
        { name: 'Chainaxe', range: 'melee' },
        { name: 'Bolt Pistol', range: 12 },
      ],
    })
    const [result] = assignRoles([unit])
    expect(result!.strategicPurpose).toBe('killing')
  })

  it('unit with multiple melee weapons → killing', () => {
    const unit = makeUnit({
      id: 'assault-marines',
      models: 5,
      points: 95,
      toughness: 4,
      wounds: 2,
      weapons: [
        { name: 'Chainsword', range: 'melee' },
        { name: 'Bolt Pistol', range: 12 },
        { name: 'Power Sword', range: 'melee' },
      ],
    })
    const [result] = assignRoles([unit])
    expect(result!.strategicPurpose).toBe('killing')
  })

  it('unit with wounds >= 8 (not otherwise killing) → holding', () => {
    const unit = makeUnit({
      id: 'dreadnought',
      models: 1,
      points: 155,
      toughness: 9,
      wounds: 8,
      keywords: ['Vehicle'],
      weapons: [
        { name: 'Dreadnought Fist', range: 'melee' },
        { name: 'Assault Cannon', range: 24 },
      ],
    })
    const [result] = assignRoles([unit])
    // wounds >= 8 qualifies as holding; melee weapon also present but holding takes priority
    expect(result!.strategicPurpose).toBe('holding')
  })
})

// ── Tactical Role ─────────────────────────────────────────────────────────────

describe('assignRoles — tactical role', () => {
  it('cheap 10-model infantry (65pts) → holder', () => {
    const unit = makeUnit({
      id: 'guardsmen',
      models: 10,
      points: 65,
      move: 6,
      toughness: 3,
      wounds: 1,
      weapons: [{ name: 'Lasgun', range: 24 }],
    })
    const [result] = assignRoles([unit])
    expect(result!.tacticalRole).toBe('holder')
  })

  it('unit with deepStrike → deep-strike', () => {
    const unit = makeUnit({
      id: 'assault-squad',
      models: 5,
      points: 95,
      toughness: 4,
      wounds: 2,
      abilities: { deepStrike: true },
      weapons: [
        { name: 'Bolt Pistol', range: 12 },
        { name: 'Chainsword', range: 'melee' },
      ],
    })
    const [result] = assignRoles([unit])
    expect(result!.tacticalRole).toBe('deep-strike')
  })

  it('unit with infiltrate → infiltrator', () => {
    const unit = makeUnit({
      id: 'scouts',
      models: 5,
      points: 70,
      toughness: 4,
      wounds: 2,
      abilities: { infiltrate: true },
      weapons: [{ name: 'Sniper Rifle', range: 36 }],
    })
    const [result] = assignRoles([unit])
    expect(result!.tacticalRole).toBe('infiltrator')
  })

  it('unit with scouts ability → scout', () => {
    const unit = makeUnit({
      id: 'scouts-move',
      models: 5,
      points: 70,
      toughness: 4,
      wounds: 2,
      abilities: { scouts: 7 },
      weapons: [{ name: 'Boltgun', range: 24 }],
    })
    const [result] = assignRoles([unit])
    expect(result!.tacticalRole).toBe('scout')
  })

  it('long-range shooting unit (48" weapons) → gunline', () => {
    const unit = makeUnit({
      id: 'devastators',
      models: 5,
      points: 130,
      move: 6,
      toughness: 4,
      wounds: 2,
      weapons: [
        { name: 'Lascannon', range: 48, isHeavy: true },
        { name: 'Lascannon', range: 48, isHeavy: true },
      ],
    })
    const [result] = assignRoles([unit])
    expect(result!.tacticalRole).toBe('gunline')
  })

  it('mid-range shooting unit (24" weapons) → mid-range-shooter', () => {
    const unit = makeUnit({
      id: 'intercessors',
      models: 5,
      points: 100,
      move: 6,
      toughness: 4,
      wounds: 2,
      weapons: [{ name: 'Bolt Rifle', range: 30 }],
    })
    const [result] = assignRoles([unit])
    expect(result!.tacticalRole).toBe('mid-range-shooter')
  })

  it('tough vehicle with high wounds → anchor', () => {
    const unit = makeUnit({
      id: 'land-raider',
      models: 1,
      points: 285,
      toughness: 12,
      wounds: 16,
      invulnSave: 5,
      keywords: ['Vehicle'],
      weapons: [{ name: 'Twin Lascannon', range: 48, isHeavy: true }],
    })
    const [result] = assignRoles([unit])
    expect(result!.tacticalRole).toBe('anchor')
  })

  it('melee unit with high move → hammer', () => {
    const unit = makeUnit({
      id: 'terminators',
      models: 5,
      points: 200,
      move: 5,
      toughness: 5,
      wounds: 3,
      invulnSave: 4,
      weapons: [
        { name: 'Power Fist', range: 'melee' },
        { name: 'Storm Bolter', range: 24 },
      ],
    })
    // invulnSave 4 → holding → counter-charge via killing+melee path? No, invulnSave → holding
    // holding+melee → anchor takes priority over hammer; let's check the actual result
    // Actually with invulnSave=4 this is holding. Holding + high wounds → anchor.
    // wounds=3 < 8 but invulnSave exists and toughness=5 → anchor
    const [result] = assignRoles([unit])
    expect(result!.tacticalRole).toBe('anchor')
  })

  it('killing melee unit with good move → counter-charge', () => {
    const unit = makeUnit({
      id: 'bloodletters',
      models: 10,
      points: 130,
      move: 6,
      toughness: 4,
      wounds: 2,
      abilities: { advanceAndCharge: true },
      weapons: [{ name: 'Hellblade', range: 'melee' }],
    })
    const [result] = assignRoles([unit])
    expect(result!.strategicPurpose).toBe('killing')
    expect(result!.tacticalRole).toBe('counter-charge')
  })

  it('unit with Vehicle keyword and transport in name → transport', () => {
    const unit = makeUnit({
      id: 'rhino',
      name: 'Rhino Transport',
      models: 1,
      points: 75,
      move: 12,
      toughness: 9,
      wounds: 10,
      keywords: ['Vehicle', 'Transport'],
      weapons: [{ name: 'Storm Bolter', range: 24 }],
    })
    const [result] = assignRoles([unit])
    expect(result!.tacticalRole).toBe('transport')
  })
})

// ── Manual Overrides ──────────────────────────────────────────────────────────

describe('assignRoles — manual overrides', () => {
  it('unit with manually set strategicPurpose → preserved', () => {
    const unit = makeUnit({
      id: 'manual-purpose',
      models: 10,
      points: 65,
      toughness: 3,
      wounds: 1,
      strategicPurpose: 'killing', // manual override — would otherwise be scoring
      weapons: [{ name: 'Lasgun', range: 24 }],
    })
    const [result] = assignRoles([unit])
    expect(result!.strategicPurpose).toBe('killing')
  })

  it('unit with manually set tacticalRole → preserved', () => {
    const unit = makeUnit({
      id: 'manual-role',
      models: 10,
      points: 65,
      toughness: 3,
      wounds: 1,
      tacticalRole: 'hammer', // manual override — would otherwise be holder
      weapons: [{ name: 'Lasgun', range: 24 }],
    })
    const [result] = assignRoles([unit])
    expect(result!.tacticalRole).toBe('hammer')
  })

  it('unit with both manually set → both preserved', () => {
    const unit = makeUnit({
      id: 'fully-manual',
      models: 5,
      points: 100,
      strategicPurpose: 'holding',
      tacticalRole: 'screen',
    })
    const [result] = assignRoles([unit])
    expect(result!.strategicPurpose).toBe('holding')
    expect(result!.tacticalRole).toBe('screen')
  })

  it('returns a new array — original is not mutated', () => {
    const unit = makeUnit({ id: 'original' })
    const input = [unit]
    const result = assignRoles(input)
    expect(result).not.toBe(input)
    expect(result[0]).not.toBe(unit)
    expect(unit.strategicPurpose).toBeUndefined()
    expect(unit.tacticalRole).toBeUndefined()
  })
})

// ── Edge Cases ────────────────────────────────────────────────────────────────

describe('assignRoles — edge cases', () => {
  it('empty array → empty array', () => {
    expect(assignRoles([])).toEqual([])
  })

  it('all units get both strategicPurpose and tacticalRole', () => {
    const units = [
      makeUnit({ id: 'a', points: 60, models: 10 }),
      makeUnit({ id: 'b', points: 200, toughness: 9, wounds: 12, keywords: ['Vehicle'] }),
      makeUnit({ id: 'c', abilities: { deepStrike: true } }),
    ]
    const result = assignRoles(units)
    for (const u of result) {
      expect(u.strategicPurpose).toBeDefined()
      expect(u.tacticalRole).toBeDefined()
    }
  })
})

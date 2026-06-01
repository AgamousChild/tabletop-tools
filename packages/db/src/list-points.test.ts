import { describe, expect, it } from 'vitest'

import { deriveListTotalPoints, deriveListUnitPoints } from './list-points'

// Shared cost fixtures
const unitCosts = [
  { datasheetId: 'ds-marines', dataslateId: 'slate-1', modelCount: 5, points: 90 },
  { datasheetId: 'ds-marines', dataslateId: 'slate-1', modelCount: 10, points: 160 },
  { datasheetId: 'ds-sgt', dataslateId: 'slate-1', modelCount: 1, points: 45 },
]
const wargearOptions = [
  { datasheetId: 'ds-marines', dataslateId: 'slate-1', weaponId: 'w-bolt-rifle', points: 0 },
  { datasheetId: 'ds-marines', dataslateId: 'slate-1', weaponId: 'w-power-sword', points: 5 },
]
const enhancements = [{ id: 'enh-1', points: 15 }]

describe('deriveListUnitPoints', () => {
  it('single loadout, no wargear, no enhancement', () => {
    const result = deriveListUnitPoints({
      datasheetId: 'ds-marines',
      dataslateId: 'slate-1',
      loadouts: [{ modelCount: 5, weapons: [] }],
      unitCosts,
      wargearOptions,
      enhancements,
    })
    expect(result).toBe(90)
  })

  it('single loadout with free weapon', () => {
    const result = deriveListUnitPoints({
      datasheetId: 'ds-marines',
      dataslateId: 'slate-1',
      loadouts: [{ modelCount: 5, weapons: [{ weaponId: 'w-bolt-rifle', count: 1 }] }],
      unitCosts,
      wargearOptions,
      enhancements,
    })
    expect(result).toBe(90) // 0 wargear cost
  })

  it('single loadout with paid weapon per model', () => {
    const result = deriveListUnitPoints({
      datasheetId: 'ds-marines',
      dataslateId: 'slate-1',
      loadouts: [{ modelCount: 5, weapons: [{ weaponId: 'w-power-sword', count: 1 }] }],
      unitCosts,
      wargearOptions,
      enhancements,
    })
    expect(result).toBe(90 + 5 * 5) // 90 base + 5pts × 5 models × 1 weapon/model
  })

  it('enhancement adds its points', () => {
    const result = deriveListUnitPoints({
      datasheetId: 'ds-marines',
      dataslateId: 'slate-1',
      loadouts: [{ modelCount: 5, weapons: [] }],
      enhancementId: 'enh-1',
      unitCosts,
      wargearOptions,
      enhancements,
    })
    expect(result).toBe(90 + 15)
  })

  it('sergeant split — two loadouts, total models picks cost band', () => {
    // 4 marines + 1 sergeant = 5 models total → 90 pts base
    const result = deriveListUnitPoints({
      datasheetId: 'ds-marines',
      dataslateId: 'slate-1',
      loadouts: [
        { modelCount: 4, weapons: [{ weaponId: 'w-bolt-rifle', count: 1 }] },
        { modelCount: 1, weapons: [{ weaponId: 'w-power-sword', count: 1 }] },
      ],
      unitCosts,
      wargearOptions,
      enhancements,
    })
    // 90 (base for 5) + 0 * 4 (bolt rifle free) + 5 * 1 (sword for sgt) = 95
    expect(result).toBe(95)
  })

  it('10-model loadout picks correct cost band', () => {
    const result = deriveListUnitPoints({
      datasheetId: 'ds-marines',
      dataslateId: 'slate-1',
      loadouts: [{ modelCount: 10, weapons: [] }],
      unitCosts,
      wargearOptions,
      enhancements,
    })
    expect(result).toBe(160)
  })

  it('missing cost data returns 0 gracefully', () => {
    const result = deriveListUnitPoints({
      datasheetId: 'ds-unknown',
      dataslateId: 'slate-1',
      loadouts: [{ modelCount: 5, weapons: [] }],
      unitCosts: [],
      wargearOptions: [],
      enhancements: [],
    })
    expect(result).toBe(0)
  })

  it('multi-loadout with enhancement', () => {
    const result = deriveListUnitPoints({
      datasheetId: 'ds-marines',
      dataslateId: 'slate-1',
      loadouts: [
        { modelCount: 4, weapons: [] },
        { modelCount: 1, weapons: [{ weaponId: 'w-power-sword', count: 1 }] },
      ],
      enhancementId: 'enh-1',
      unitCosts,
      wargearOptions,
      enhancements,
    })
    // 90 (base) + 0 (4 models no weapon) + 5 (1 sword) + 15 (enhancement) = 110
    expect(result).toBe(110)
  })
})

describe('deriveListTotalPoints', () => {
  it('sums all unit points', () => {
    const u1: Parameters<typeof deriveListUnitPoints>[0] = {
      datasheetId: 'ds-marines',
      dataslateId: 'slate-1',
      loadouts: [{ modelCount: 5, weapons: [] }],
      unitCosts,
      wargearOptions,
      enhancements,
    }
    const u2: Parameters<typeof deriveListUnitPoints>[0] = {
      datasheetId: 'ds-sgt',
      dataslateId: 'slate-1',
      loadouts: [{ modelCount: 1, weapons: [] }],
      unitCosts,
      wargearOptions,
      enhancements,
    }
    expect(deriveListTotalPoints([u1, u2])).toBe(90 + 45)
  })

  it('empty list is 0', () => {
    expect(deriveListTotalPoints([])).toBe(0)
  })
})

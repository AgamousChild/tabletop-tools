import { describe, expect, it } from 'vitest'

import { parseMfmCosting } from './mfm-costing'

describe('parseMfmCosting', () => {
  it('maps mapped rows by datasheetId and skips unmapped ones', () => {
    const sample = JSON.stringify([
      {
        datasheetId: 'abc-123',
        factionSlug: 'space-marines',
        name: 'Intercessor Squad',
        costing: [
          {
            range: '[1,)',
            label: 'Your Unit Costs',
            costs: [
              { models: 5, points: 80 },
              { models: 10, points: 160 },
            ],
          },
        ],
      },
      {
        datasheetId: null, // unmapped row — must be excluded from the map
        factionSlug: 'aeldari',
        name: 'Unknown Squad',
        costing: [{ range: '[1,)', label: 'cost', costs: [{ models: 5, points: 90 }] }],
      },
    ])
    const result = parseMfmCosting(sample)
    expect(result.totalRows).toBe(2)
    expect(result.mappedRows).toBe(1)
    expect(result.byDatasheetId.size).toBe(1)
    const inter = result.byDatasheetId.get('abc-123')!
    expect(inter.minCost).toBe(80)
    expect(inter.pointsArray).toEqual([
      { models: '5 models', cost: 80 },
      { models: '10 models', cost: 160 },
    ])
  })

  it('formats a single-model unit label as "1 model" (singular)', () => {
    const sample = JSON.stringify([
      {
        datasheetId: 'cap-001',
        factionSlug: 'space-marines',
        name: 'Captain',
        costing: [
          {
            range: '[1,)',
            label: 'Your Unit Costs',
            costs: [{ models: 1, points: 90 }],
          },
        ],
      },
    ])
    const result = parseMfmCosting(sample)
    expect(result.byDatasheetId.get('cap-001')!.pointsArray).toEqual([
      { models: '1 model', cost: 90 },
    ])
  })

  it('uses the baseline tier (range starts at 1) for pointsArray when multiple tiers exist', () => {
    // A repeat-cost unit: copies 1-2 cost 75, copies 3+ cost 90 each.
    // Baseline (always-on) is [1,2], so pointsArray = 75. Tiers retain both.
    const sample = JSON.stringify([
      {
        datasheetId: 'champ-001',
        factionSlug: 'space-marines',
        name: 'Honored Champion',
        costing: [
          {
            range: '[1,2]',
            label: 'Your 1st to 2nd Units Cost',
            costs: [{ models: 1, points: 75 }],
          },
          {
            range: '[3,)',
            label: 'Your 3rd+ Unit Costs',
            costs: [{ models: 1, points: 90 }],
          },
        ],
      },
    ])
    const result = parseMfmCosting(sample)
    const derived = result.byDatasheetId.get('champ-001')!
    expect(derived.minCost).toBe(75)
    expect(derived.pointsArray).toEqual([{ models: '1 model', cost: 75 }])
    // Full tier structure is preserved for downstream consumers.
    expect(derived.tiers).toHaveLength(2)
    expect(derived.tiers[0]!.range).toBe('[1,2]')
    expect(derived.tiers[1]!.range).toBe('[3,)')
  })

  it('skips addon rows (wargear surcharges) when building pointsArray', () => {
    const sample = JSON.stringify([
      {
        datasheetId: 'sm-tac-001',
        factionSlug: 'space-marines',
        name: 'Tactical Squad',
        costing: [
          {
            range: '[1,)',
            label: 'Your Unit Costs',
            costs: [
              { models: 5, points: 80 },
              { models: 10, points: 160 },
              // Addon: extra plasma pistol +5pts — not a full unit price
              { models: 0, points: 5, desc: 'plasma pistol', addon: true },
            ],
          },
        ],
      },
    ])
    const result = parseMfmCosting(sample)
    const derived = result.byDatasheetId.get('sm-tac-001')!
    expect(derived.pointsArray).toEqual([
      { models: '5 models', cost: 80 },
      { models: '10 models', cost: 160 },
    ])
    expect(derived.minCost).toBe(80)
  })

  it('throws on non-array root', () => {
    expect(() => parseMfmCosting('{}')).toThrow(/expected a JSON array/i)
  })

  it('returns an empty result for an empty array', () => {
    const result = parseMfmCosting('[]')
    expect(result.totalRows).toBe(0)
    expect(result.mappedRows).toBe(0)
    expect(result.byDatasheetId.size).toBe(0)
  })
})

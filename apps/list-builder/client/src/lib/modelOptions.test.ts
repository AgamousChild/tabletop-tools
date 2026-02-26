import { describe, expect, it } from 'vitest'
import { parseModelOptions } from './modelOptions'
import type { UnitComposition, UnitCost } from '@tabletop-tools/game-data-store'

describe('parseModelOptions', () => {
  it('returns empty array when no compositions or costs', () => {
    expect(parseModelOptions([], [])).toEqual([])
  })

  it('parses a single fixed-size unit', () => {
    const compositions: UnitComposition[] = [
      { id: 'c1', datasheetId: 'ds1', line: '1', description: '5 models' },
    ]
    const costs: UnitCost[] = [
      { id: 'k1', datasheetId: 'ds1', line: '1', description: '5 models', cost: '90' },
    ]
    const result = parseModelOptions(compositions, costs)
    expect(result).toEqual([
      { modelCount: 5, points: 90, description: '5 models' },
    ])
  })

  it('parses multiple size options for a unit', () => {
    const compositions: UnitComposition[] = [
      { id: 'c1', datasheetId: 'ds1', line: '1', description: '5 models' },
      { id: 'c2', datasheetId: 'ds1', line: '2', description: '10 models' },
    ]
    const costs: UnitCost[] = [
      { id: 'k1', datasheetId: 'ds1', line: '1', description: '5 models', cost: '90' },
      { id: 'k2', datasheetId: 'ds1', line: '2', description: '10 models', cost: '180' },
    ]
    const result = parseModelOptions(compositions, costs)
    expect(result).toEqual([
      { modelCount: 5, points: 90, description: '5 models' },
      { modelCount: 10, points: 180, description: '10 models' },
    ])
  })

  it('matches compositions and costs by line number', () => {
    const compositions: UnitComposition[] = [
      { id: 'c1', datasheetId: 'ds1', line: '1', description: '3 models' },
      { id: 'c2', datasheetId: 'ds1', line: '2', description: '6 models' },
    ]
    const costs: UnitCost[] = [
      { id: 'k2', datasheetId: 'ds1', line: '2', description: '6 models', cost: '120' },
      { id: 'k1', datasheetId: 'ds1', line: '1', description: '3 models', cost: '65' },
    ]
    const result = parseModelOptions(compositions, costs)
    expect(result).toEqual([
      { modelCount: 3, points: 65, description: '3 models' },
      { modelCount: 6, points: 120, description: '6 models' },
    ])
  })

  it('handles descriptions with extra text around the number', () => {
    const compositions: UnitComposition[] = [
      { id: 'c1', datasheetId: 'ds1', line: '1', description: '1 Intercessor Sergeant, 4 Intercessors' },
    ]
    const costs: UnitCost[] = [
      { id: 'k1', datasheetId: 'ds1', line: '1', description: '5 models', cost: '90' },
    ]
    const result = parseModelOptions(compositions, costs)
    // Falls back to cost description for model count
    expect(result).toEqual([
      { modelCount: 5, points: 90, description: '5 models' },
    ])
  })

  it('skips costs with no matching composition line gracefully', () => {
    const compositions: UnitComposition[] = []
    const costs: UnitCost[] = [
      { id: 'k1', datasheetId: 'ds1', line: '1', description: '5 models', cost: '90' },
    ]
    // Falls back to using costs alone
    const result = parseModelOptions(compositions, costs)
    expect(result).toEqual([
      { modelCount: 5, points: 90, description: '5 models' },
    ])
  })

  it('handles non-numeric cost gracefully', () => {
    const compositions: UnitComposition[] = [
      { id: 'c1', datasheetId: 'ds1', line: '1', description: '5 models' },
    ]
    const costs: UnitCost[] = [
      { id: 'k1', datasheetId: 'ds1', line: '1', description: '5 models', cost: 'free' },
    ]
    const result = parseModelOptions(compositions, costs)
    expect(result).toEqual([
      { modelCount: 5, points: 0, description: '5 models' },
    ])
  })

  it('sorts options by model count ascending', () => {
    const compositions: UnitComposition[] = [
      { id: 'c2', datasheetId: 'ds1', line: '2', description: '10 models' },
      { id: 'c1', datasheetId: 'ds1', line: '1', description: '5 models' },
    ]
    const costs: UnitCost[] = [
      { id: 'k2', datasheetId: 'ds1', line: '2', description: '10 models', cost: '180' },
      { id: 'k1', datasheetId: 'ds1', line: '1', description: '5 models', cost: '90' },
    ]
    const result = parseModelOptions(compositions, costs)
    expect(result[0]!.modelCount).toBe(5)
    expect(result[1]!.modelCount).toBe(10)
  })
})

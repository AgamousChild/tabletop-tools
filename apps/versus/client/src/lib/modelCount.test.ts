import { describe, expect, it } from 'vitest'

import { parseModelCount, parseModelOptions } from './modelCount'

describe('parseModelCount', () => {
  it('extracts model count from "5 models" pattern', () => {
    expect(
      parseModelCount([{ id: 'c1', datasheetId: 'ds1', line: '1', description: '5 models' }]),
    ).toBe(5)
  })

  it('extracts model count from "10 models" pattern', () => {
    expect(
      parseModelCount([{ id: 'c1', datasheetId: 'ds1', line: '1', description: '10 models' }]),
    ).toBe(10)
  })

  it('returns smallest model count from multiple compositions', () => {
    expect(
      parseModelCount([
        { id: 'c1', datasheetId: 'ds1', line: '1', description: '5 models' },
        { id: 'c2', datasheetId: 'ds1', line: '2', description: '10 models' },
      ]),
    ).toBe(5)
  })

  it('returns null for empty compositions', () => {
    expect(parseModelCount([])).toBe(null)
  })

  it('returns null for unparseable descriptions', () => {
    expect(
      parseModelCount([{ id: 'c1', datasheetId: 'ds1', line: '1', description: 'some text' }]),
    ).toBe(null)
  })

  it('extracts from leading number pattern', () => {
    expect(
      parseModelCount([{ id: 'c1', datasheetId: 'ds1', line: '1', description: '3 Intercessors' }]),
    ).toBe(3)
  })
})

describe('parseModelOptions', () => {
  it('returns options from unit costs with model counts', () => {
    const comps = [{ id: 'c1', datasheetId: 'ds1', line: '1', description: '5-10 Intercessors' }]
    const costs = [
      { id: 'k1', datasheetId: 'ds1', line: '1', description: '5 models', cost: '90' },
      { id: 'k2', datasheetId: 'ds1', line: '2', description: '10 models', cost: '180' },
    ]
    const opts = parseModelOptions(comps, costs)
    expect(opts).toHaveLength(2)
    expect(opts[0]).toEqual({ modelCount: 5, points: 90, description: '5 models' })
    expect(opts[1]).toEqual({ modelCount: 10, points: 180, description: '10 models' })
  })

  it('falls back to composition description when cost has no count', () => {
    const comps = [{ id: 'c1', datasheetId: 'ds1', line: '1', description: '3 Meganobz' }]
    const costs = [{ id: 'k1', datasheetId: 'ds1', line: '1', description: 'base', cost: '65' }]
    const opts = parseModelOptions(comps, costs)
    expect(opts).toHaveLength(1)
    expect(opts[0]!.modelCount).toBe(3)
    expect(opts[0]!.points).toBe(65)
  })

  it('returns empty for no costs', () => {
    const comps = [{ id: 'c1', datasheetId: 'ds1', line: '1', description: '5 models' }]
    expect(parseModelOptions(comps, [])).toEqual([])
  })

  it('sorts by model count ascending', () => {
    const comps: never[] = []
    const costs = [
      { id: 'k1', datasheetId: 'ds1', line: '2', description: '6 models', cost: '130' },
      { id: 'k2', datasheetId: 'ds1', line: '1', description: '3 models', cost: '65' },
    ]
    const opts = parseModelOptions(comps, costs)
    expect(opts[0]!.modelCount).toBe(3)
    expect(opts[1]!.modelCount).toBe(6)
  })
})

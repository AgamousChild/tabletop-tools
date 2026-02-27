import { describe, expect, it } from 'vitest'
import { parseModelCount } from './modelCount'

describe('parseModelCount', () => {
  it('extracts model count from "5 models" pattern', () => {
    expect(parseModelCount([
      { id: 'c1', datasheetId: 'ds1', line: '1', description: '5 models' },
    ])).toBe(5)
  })

  it('extracts model count from "10 models" pattern', () => {
    expect(parseModelCount([
      { id: 'c1', datasheetId: 'ds1', line: '1', description: '10 models' },
    ])).toBe(10)
  })

  it('returns smallest model count from multiple compositions', () => {
    expect(parseModelCount([
      { id: 'c1', datasheetId: 'ds1', line: '1', description: '5 models' },
      { id: 'c2', datasheetId: 'ds1', line: '2', description: '10 models' },
    ])).toBe(5)
  })

  it('returns null for empty compositions', () => {
    expect(parseModelCount([])).toBe(null)
  })

  it('returns null for unparseable descriptions', () => {
    expect(parseModelCount([
      { id: 'c1', datasheetId: 'ds1', line: '1', description: 'some text' },
    ])).toBe(null)
  })

  it('extracts from leading number pattern', () => {
    expect(parseModelCount([
      { id: 'c1', datasheetId: 'ds1', line: '1', description: '3 Intercessors' },
    ])).toBe(3)
  })
})

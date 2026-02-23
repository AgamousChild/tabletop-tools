import { describe, expect, it } from 'vitest'

import { deriveResult } from './result'

describe('deriveResult', () => {
  it('returns WIN when your score is higher', () => {
    expect(deriveResult(85, 72)).toBe('WIN')
    expect(deriveResult(1, 0)).toBe('WIN')
  })

  it('returns LOSS when their score is higher', () => {
    expect(deriveResult(45, 90)).toBe('LOSS')
    expect(deriveResult(0, 1)).toBe('LOSS')
  })

  it('returns DRAW when scores are equal', () => {
    expect(deriveResult(60, 60)).toBe('DRAW')
    expect(deriveResult(0, 0)).toBe('DRAW')
  })
})

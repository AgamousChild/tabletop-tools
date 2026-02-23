import { describe, expect, it } from 'vitest'

import { deriveResult } from './derive'

describe('deriveResult', () => {
  it('returns P1_WIN when player 1 VP is higher', () => {
    expect(deriveResult(72, 45)).toBe('P1_WIN')
    expect(deriveResult(1, 0)).toBe('P1_WIN')
  })

  it('returns P2_WIN when player 2 VP is higher', () => {
    expect(deriveResult(45, 72)).toBe('P2_WIN')
    expect(deriveResult(0, 1)).toBe('P2_WIN')
  })

  it('returns DRAW when VP is equal', () => {
    expect(deriveResult(60, 60)).toBe('DRAW')
    expect(deriveResult(0, 0)).toBe('DRAW')
  })
})

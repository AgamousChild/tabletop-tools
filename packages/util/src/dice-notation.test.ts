/**
 * Union-behavior test suite for dice-notation (D2-07 item 3).
 *
 * Reconciles two prior implementations:
 *   - apps/versus/client/src/lib/rules/pipeline.ts `resolveAttacks`/`resolveMin`/`resolveMax`
 *     — regex `/^(\d*)D(\d+)([+-]\d+)?$/i`, supports `+`/`-`, returns 0 on no match.
 *   - apps/versus/server/src/lib/attackCount.ts `resolveAttacksExpected`
 *     — regex `/^(\d+)?[Dd](\d+)(?:\+(\d+))?$/`, `+` only, throws on no match,
 *     also accepts plain numeric strings ("3", "2.5").
 *
 * This suite covers the union of both: plain dice, counted dice, `+`/`-`
 * modifiers, plain numeric strings, and per-mode invalid-input behavior
 * (silent 0 vs throw) for resolveAvg/resolveMin/resolveMax.
 */
import { describe, expect, it } from 'vitest'

import { resolveAvg, resolveMax, resolveMin } from './dice-notation'

// ── resolveAvg (expected value) ────────────────────────────────────────────

describe('resolveAvg', () => {
  it('returns flat numbers unchanged', () => {
    expect(resolveAvg(4)).toBe(4)
  })

  it('parses a numeric string as a flat number', () => {
    expect(resolveAvg('3')).toBe(3)
  })

  it('parses a decimal numeric string', () => {
    expect(resolveAvg('2.5')).toBe(2.5)
  })

  it('parses plain D6 as 3.5', () => {
    expect(resolveAvg('D6')).toBeCloseTo(3.5)
  })

  it('parses lowercase d6 as 3.5', () => {
    expect(resolveAvg('d6')).toBeCloseTo(3.5)
  })

  it('parses D3 as 2', () => {
    expect(resolveAvg('D3')).toBeCloseTo(2)
  })

  it('parses counted dice 2D6 as 7', () => {
    expect(resolveAvg('2D6')).toBeCloseTo(7)
  })

  it('parses counted dice 2D3 as 4', () => {
    expect(resolveAvg('2D3')).toBeCloseTo(4)
  })

  it('parses a positive modifier D6+1 as 4.5', () => {
    expect(resolveAvg('D6+1')).toBeCloseTo(4.5)
  })

  it('parses a positive modifier D6+2 as 5.5', () => {
    expect(resolveAvg('D6+2')).toBeCloseTo(5.5)
  })

  it('parses a positive modifier D3+1 as 3', () => {
    expect(resolveAvg('D3+1')).toBeCloseTo(3)
  })

  it('parses a positive modifier with count 2D6+3 as 10', () => {
    expect(resolveAvg('2D6+3')).toBeCloseTo(10)
  })

  it('parses a negative modifier D6-1 as 2.5', () => {
    expect(resolveAvg('D6-1')).toBeCloseTo(2.5)
  })

  it('parses a negative modifier D3-2 as expected value', () => {
    expect(resolveAvg('D3-2')).toBeCloseTo(0)
  })

  it('returns 0 on invalid input by default (client-compatible silent mode)', () => {
    expect(resolveAvg('garbage')).toBe(0)
  })

  it('throws on invalid input when onInvalid is "throw" (server-compatible mode)', () => {
    expect(() => resolveAvg('garbage', { onInvalid: 'throw' })).toThrow()
  })

  it('does not throw on valid input when onInvalid is "throw"', () => {
    expect(() => resolveAvg('D6', { onInvalid: 'throw' })).not.toThrow()
  })
})

// ── resolveMin ──────────────────────────────────────────────────────────────

describe('resolveMin', () => {
  it('returns flat numbers unchanged', () => {
    expect(resolveMin(3)).toBe(3)
  })

  it('D6 minimum is 1', () => {
    expect(resolveMin('D6')).toBe(1)
  })

  it('2D6 minimum is 2', () => {
    expect(resolveMin('2D6')).toBe(2)
  })

  it('D6+1 minimum is 2', () => {
    expect(resolveMin('D6+1')).toBe(2)
  })

  it('D3 minimum is 1', () => {
    expect(resolveMin('D3')).toBe(1)
  })

  it('D6-1 minimum is floored at 1', () => {
    expect(resolveMin('D6-1')).toBe(1)
  })

  it('returns 0 on invalid input by default', () => {
    expect(resolveMin('garbage')).toBe(0)
  })

  it('throws on invalid input when onInvalid is "throw"', () => {
    expect(() => resolveMin('garbage', { onInvalid: 'throw' })).toThrow()
  })
})

// ── resolveMax ──────────────────────────────────────────────────────────────

describe('resolveMax', () => {
  it('returns flat numbers unchanged', () => {
    expect(resolveMax(3)).toBe(3)
  })

  it('D6 maximum is 6', () => {
    expect(resolveMax('D6')).toBe(6)
  })

  it('2D6 maximum is 12', () => {
    expect(resolveMax('2D6')).toBe(12)
  })

  it('D3+1 maximum is 4', () => {
    expect(resolveMax('D3+1')).toBe(4)
  })

  it('D6+2 maximum is 8', () => {
    expect(resolveMax('D6+2')).toBe(8)
  })

  it('D6-1 maximum is 5', () => {
    expect(resolveMax('D6-1')).toBe(5)
  })

  it('returns 0 on invalid input by default', () => {
    expect(resolveMax('garbage')).toBe(0)
  })

  it('throws on invalid input when onInvalid is "throw"', () => {
    expect(() => resolveMax('garbage', { onInvalid: 'throw' })).toThrow()
  })
})

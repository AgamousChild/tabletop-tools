/**
 * shapes/onboarding.test.ts
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { _clearRegistry, register } from '../registry'
import type { ShapeContext } from '../types'
import { onboardingShape } from './onboarding'

beforeEach(() => {
  _clearRegistry()
  register(onboardingShape)
})

afterEach(() => {
  _clearRegistry()
})

function ctx(question: string, factions: string[] = []): ShapeContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { question, detectedFactions: factions, edition: '11th', bucket: {} as any }
}

// ── matches() ─────────────────────────────────────────────────────────────────

describe('onboarding matches()', () => {
  it('matches "where do I start"', () => {
    expect(onboardingShape.matches(ctx('where do I start with Necrons?'))).toBe(true)
  })

  it('matches "new player"', () => {
    expect(onboardingShape.matches(ctx("I'm a new player thinking about Space Marines"))).toBe(true)
  })

  it('matches "getting into 40k"', () => {
    expect(onboardingShape.matches(ctx('getting into 40k, thinking about Orks'))).toBe(true)
  })

  it('matches "first army"', () => {
    expect(onboardingShape.matches(ctx('what should my first army be?'))).toBe(true)
  })

  it('matches "beginner"', () => {
    expect(onboardingShape.matches(ctx('beginner here, want to start Tyranids'))).toBe(true)
  })

  it('matches "combat patrol recommendation"', () => {
    expect(onboardingShape.matches(ctx('combat patrol recommendation for Death Guard?'))).toBe(true)
  })

  it('matches "just started"', () => {
    expect(onboardingShape.matches(ctx('just started 40k with Aeldari'))).toBe(true)
  })

  it('matches "what is a good starter"', () => {
    expect(onboardingShape.matches(ctx("what's a good starter for T'au?"))).toBe(true)
  })

  it('matches "how do I get started"', () => {
    expect(onboardingShape.matches(ctx('how do I get started with Chaos Space Marines?'))).toBe(
      true,
    )
  })

  it('matches "brand new"', () => {
    expect(onboardingShape.matches(ctx('brand new to the hobby, interested in Necrons'))).toBe(true)
  })

  it('does NOT match a rules question', () => {
    expect(onboardingShape.matches(ctx('how does Oath of Moment work?'))).toBe(false)
  })

  it('does NOT match a list review question', () => {
    expect(onboardingShape.matches(ctx('is my 1500pts list good?'))).toBe(false)
  })

  it('does NOT match a unit viability question', () => {
    expect(onboardingShape.matches(ctx('are Terminators worth taking in 11th?'))).toBe(false)
  })
})

// ── canonicalize() ────────────────────────────────────────────────────────────

describe('onboarding canonicalize()', () => {
  it('extracts faction from detectedFactions', () => {
    const parsed = onboardingShape.canonicalize(ctx('new player', ['necrons']))
    expect(parsed.faction).toBe('necrons')
  })

  it('returns null faction when none detected', () => {
    const parsed = onboardingShape.canonicalize(ctx('new player, not sure what to play'))
    expect(parsed.faction).toBeNull()
  })

  it('detects hasExistingArmy when text says "already have"', () => {
    const parsed = onboardingShape.canonicalize(
      ctx('new player, already have some Space Marines', ['space-marines']),
    )
    expect(parsed.hasExistingArmy).toBe(true)
  })

  it('hasExistingArmy is false by default', () => {
    const parsed = onboardingShape.canonicalize(ctx('new player', ['orks']))
    expect(parsed.hasExistingArmy).toBe(false)
  })
})

// ── handle() ─────────────────────────────────────────────────────────────────

describe('onboarding handle() — with faction', () => {
  it('returns delegated:true', async () => {
    const parsed = { faction: 'necrons', hasExistingArmy: false }
    const result = await onboardingShape.handle(parsed, ctx('new player', ['necrons']))
    expect(result.delegated).toBe(true)
  })

  it('includes faction name in answer', async () => {
    const parsed = { faction: 'necrons', hasExistingArmy: false }
    const result = await onboardingShape.handle(parsed, ctx('new player', ['necrons']))
    expect(result.answer).toContain('Necrons')
  })

  it('includes Combat Patrol reference', async () => {
    const parsed = { faction: 'necrons', hasExistingArmy: false }
    const result = await onboardingShape.handle(parsed, ctx('new player', ['necrons']))
    expect(result.answer).toMatch(/combat patrol/i)
  })

  it('mentions "already have" context when hasExistingArmy:true', async () => {
    const parsed = { faction: 'space-marines', hasExistingArmy: true }
    const result = await onboardingShape.handle(parsed, ctx('new player', ['space-marines']))
    expect(result.answer).toMatch(/already have|expand/i)
  })

  it('provides Space Marines specific advice', async () => {
    const parsed = { faction: 'space-marines', hasExistingArmy: false }
    const result = await onboardingShape.handle(parsed, ctx('q', ['space-marines']))
    expect(result.answer).toContain('Space Marines')
  })

  it('provides Orks specific advice', async () => {
    const parsed = { faction: 'orks', hasExistingArmy: false }
    const result = await onboardingShape.handle(parsed, ctx('q', ['orks']))
    expect(result.answer).toContain('Orks')
  })

  it('provides Tyranids specific advice', async () => {
    const parsed = { faction: 'tyranids', hasExistingArmy: false }
    const result = await onboardingShape.handle(parsed, ctx('q', ['tyranids']))
    expect(result.answer).toContain('Tyranids')
  })

  it('falls back gracefully for lesser-known factions', async () => {
    const parsed = { faction: 'leagues-of-votann', hasExistingArmy: false }
    const result = await onboardingShape.handle(parsed, ctx('q', ['leagues-of-votann']))
    expect(result.delegated).toBe(true)
    expect(result.answer).toBeTruthy()
  })

  it('shapeId is "onboarding"', async () => {
    const parsed = { faction: 'necrons', hasExistingArmy: false }
    const result = await onboardingShape.handle(parsed, ctx('q', ['necrons']))
    expect(result.shapeId).toBe('onboarding')
  })
})

describe('onboarding handle() — no faction', () => {
  it('returns delegated:false', async () => {
    const parsed = { faction: null, hasExistingArmy: false }
    const result = await onboardingShape.handle(parsed, ctx('new player'))
    expect(result.delegated).toBe(false)
  })

  it('provides generic augmentContext', async () => {
    const parsed = { faction: null, hasExistingArmy: false }
    const result = await onboardingShape.handle(parsed, ctx('new player'))
    expect(result.augmentContext).toContain('generic starter advice')
  })

  it('generic advice mentions Combat Patrol', async () => {
    const parsed = { faction: null, hasExistingArmy: false }
    const result = await onboardingShape.handle(parsed, ctx('new player'))
    expect(result.augmentContext).toMatch(/combat patrol/i)
  })
})

/**
 * registry.test.ts — Tests for the question-shape plugin registry.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { _clearRegistry, classify, register, registeredIds, route } from './registry'
import type { HandlerResult, QuestionShape, ShapeContext } from './types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCtx(question: string, factions: string[] = []): ShapeContext {
  return {
    question,
    detectedFactions: factions,
    edition: '11th',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bucket: {} as any,
  }
}

function makeShape(
  id: string,
  priority: number,
  matchFn: (ctx: ShapeContext) => boolean,
  handleResult: Partial<HandlerResult> = {},
): QuestionShape<unknown> {
  return {
    id,
    description: `test shape ${id}`,
    priority,
    matches: matchFn,
    canonicalize: (_ctx) => ({ id }),
    handle: async (_parsed, _ctx) => ({
      delegated: false,
      shapeId: id,
      ...handleResult,
    }),
  }
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  _clearRegistry()
})

afterEach(() => {
  _clearRegistry()
})

// ── register ──────────────────────────────────────────────────────────────────

describe('register', () => {
  it('adds a shape to the registry', () => {
    register(makeShape('alpha', 50, () => true))
    expect(registeredIds()).toContain('alpha')
  })

  it('throws on duplicate id', () => {
    register(makeShape('dup', 50, () => true))
    expect(() => register(makeShape('dup', 50, () => false))).toThrow(
      'question-shape already registered: dup',
    )
  })

  it('supports registering multiple shapes', () => {
    register(makeShape('a', 10, () => true))
    register(makeShape('b', 20, () => true))
    register(makeShape('c', 30, () => false))
    expect(registeredIds()).toEqual(['a', 'b', 'c'])
  })
})

// ── classify ─────────────────────────────────────────────────────────────────

describe('classify', () => {
  it('returns empty array when nothing matches', () => {
    register(makeShape('no-match', 50, () => false))
    expect(classify(makeCtx('hello'))).toHaveLength(0)
  })

  it('returns matching shapes', () => {
    register(makeShape('yes', 50, () => true))
    register(makeShape('no', 50, () => false))
    const matches = classify(makeCtx('hello'))
    expect(matches).toHaveLength(1)
    expect(matches[0]!.id).toBe('yes')
  })

  it('orders matches by priority descending', () => {
    register(makeShape('low', 10, () => true))
    register(makeShape('high', 90, () => true))
    register(makeShape('mid', 50, () => true))
    const matches = classify(makeCtx('hello'))
    expect(matches.map((s) => s.id)).toEqual(['high', 'mid', 'low'])
  })

  it('ties broken by insertion order (stable sort)', () => {
    register(makeShape('first', 50, () => true))
    register(makeShape('second', 50, () => true))
    const matches = classify(makeCtx('hello'))
    expect(matches.map((s) => s.id)).toEqual(['first', 'second'])
  })

  it('passes context to matches()', () => {
    const spy = vi.fn().mockReturnValue(true)
    const shape = makeShape('spy-shape', 50, spy)
    register(shape)
    const ctx = makeCtx('test question', ['space-marines'])
    classify(ctx)
    expect(spy).toHaveBeenCalledWith(ctx)
  })
})

// ── route ─────────────────────────────────────────────────────────────────────

describe('route', () => {
  it('calls handle() and returns the result', async () => {
    const shape = makeShape('delegated', 50, () => true, {
      delegated: true,
      answer: 'test answer',
    })
    register(shape)
    const ctx = makeCtx('anything')
    const result = await route(shape, ctx)
    expect(result.delegated).toBe(true)
    expect(result.answer).toBe('test answer')
    expect(result.shapeId).toBe('delegated')
  })

  it('calls canonicalize() before handle()', async () => {
    const canonicalizeSpy = vi.fn().mockReturnValue({ parsed: true })
    const handleSpy = vi.fn().mockResolvedValue({ delegated: false, shapeId: 'spy' })
    const shape: QuestionShape<unknown> = {
      id: 'spy',
      description: 'spy shape',
      priority: 50,
      matches: () => true,
      canonicalize: canonicalizeSpy,
      handle: handleSpy,
    }
    register(shape)
    await route(shape, makeCtx('q'))
    expect(canonicalizeSpy).toHaveBeenCalledTimes(1)
    expect(handleSpy).toHaveBeenCalledWith({ parsed: true }, expect.any(Object))
  })

  it('returns delegated:false with augmentContext', async () => {
    const shape = makeShape('augment', 50, () => true, {
      delegated: false,
      augmentContext: 'some extra context',
    })
    register(shape)
    const result = await route(shape, makeCtx('q'))
    expect(result.delegated).toBe(false)
    expect(result.augmentContext).toBe('some extra context')
  })
})

// ── Full classify → route pipeline ───────────────────────────────────────────

describe('classify + route pipeline', () => {
  it('first delegated shape short-circuits (simulated)', async () => {
    register(makeShape('low', 10, () => true, { delegated: false, augmentContext: 'low ctx' }))
    register(makeShape('high', 90, () => true, { delegated: true, answer: 'high answer' }))

    const ctx = makeCtx('anything')
    const matches = classify(ctx)

    // Simulate caller short-circuiting on first delegated result
    let finalResult: HandlerResult | null = null
    const matchedIds: string[] = []
    for (const shape of matches) {
      const result = await route(shape, ctx)
      matchedIds.push(shape.id)
      if (result.delegated) {
        finalResult = result
        break
      }
    }

    expect(matchedIds).toEqual(['high']) // low never ran
    expect(finalResult?.answer).toBe('high answer')
  })

  it('collects augmentContext when no shape delegates', async () => {
    register(makeShape('a', 10, () => true, { delegated: false, augmentContext: 'ctx-a' }))
    register(makeShape('b', 20, () => true, { delegated: false, augmentContext: 'ctx-b' }))

    const ctx = makeCtx('anything')
    const matches = classify(ctx)

    const augments: string[] = []
    for (const shape of matches) {
      const result = await route(shape, ctx)
      if (!result.delegated && result.augmentContext) {
        augments.push(result.augmentContext)
      }
    }

    expect(augments).toContain('ctx-b')
    expect(augments).toContain('ctx-a')
  })
})

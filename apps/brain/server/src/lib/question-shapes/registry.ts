/**
 * question-shapes/registry.ts
 *
 * Extensible plugin registry for question shapes.
 *
 * Usage:
 *   import './shapes/index'            // side-effect: registers all shapes
 *   const matches = classify(ctx)      // ordered by priority desc
 *   const result = await route(matches[0], ctx)
 */

import type { HandlerResult, QuestionShape, ShapeContext } from './types'

// ── Internal registry ─────────────────────────────────────────────────────────

const registry: Map<string, QuestionShape<unknown>> = new Map()

/**
 * Register a shape. Called by each shape module (typically at import time
 * via shapes/index.ts). Throws if a shape with the same id is already
 * registered so accidental double-registration is caught early.
 */
export function register<TParsed>(shape: QuestionShape<TParsed>): void {
  if (registry.has(shape.id)) {
    throw new Error(`question-shape already registered: ${shape.id}`)
  }
  registry.set(shape.id, shape as unknown as QuestionShape<unknown>)
}

// ── classify ──────────────────────────────────────────────────────────────────

/**
 * Run every registered shape's `matches()` against the context and return
 * the matching shapes sorted by priority descending (highest first).
 *
 * Tie-break on priority: when two shapes share the same priority, insertion
 * order (registration order) acts as the secondary sort key.
 */
export function classify(ctx: ShapeContext): QuestionShape<unknown>[] {
  const matches: QuestionShape<unknown>[] = []
  for (const shape of registry.values()) {
    if (shape.matches(ctx)) {
      matches.push(shape)
    }
  }
  // Stable sort: sort() in modern JS engines is stable, so equal-priority
  // shapes retain their insertion order.
  matches.sort((a, b) => b.priority - a.priority)
  return matches
}

// ── route ─────────────────────────────────────────────────────────────────────

/**
 * Invoke handle() for a single matched shape.
 * Callers are responsible for calling classify() first, then deciding which
 * shape(s) to route to.
 */
export async function route(
  shape: QuestionShape<unknown>,
  ctx: ShapeContext,
): Promise<HandlerResult> {
  const parsed = shape.canonicalize(ctx)
  return shape.handle(parsed, ctx)
}

// ── Exposed for tests ─────────────────────────────────────────────────────────

/** Return a copy of all registered shape ids (useful for assertions). */
export function registeredIds(): string[] {
  return [...registry.keys()]
}

/** Remove all registered shapes. Intended for test isolation only. */
export function _clearRegistry(): void {
  registry.clear()
}

/**
 * question-shapes/types.ts
 *
 * Core interfaces for the question-shape plugin registry.
 * A QuestionShape classifies a user question, extracts structured slots, and
 * either produces a final answer (delegated: true) or adds context that
 * downstream LLM/retrieval can use (augmentContext).
 */

// ── Context passed to every shape ────────────────────────────────────────────

export interface ShapeContext {
  /** The raw user question, untouched. */
  question: string
  /** Subreddit hint from request metadata (optional). */
  subreddit?: string
  /** Faction slugs already detected by faction-detect.ts. */
  detectedFactions: string[]
  /** Resolved edition (e.g., '11th', '10th', 'any'). */
  edition: string
  /**
   * R2 bucket — available for shapes that want to probe brain data.
   * Typed as `any` to avoid R2Bucket version mismatches between the
   * cloudflare/workers-types version and the global Workers runtime type.
   * Shapes that use this should cast to their required interface.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bucket: any
}

// ── Result from a shape's handle() ──────────────────────────────────────────

export interface HandlerResult {
  /**
   * When true, /ask should return this answer directly — skip Vectorize
   * retrieval and LLM completion.
   */
  delegated: boolean
  /** Final answer text (only meaningful when delegated: true). */
  answer?: string
  /**
   * Brain-node references the shape produced (surfaced in the API response
   * as `reference`).
   */
  refs?: Array<{ id: string; title: string; category: string; factionId?: string }>
  /**
   * Cube-derived references (e.g. from a count query).
   */
  cubeRefs?: Array<{ id: string; title: string; category: string; factionId?: string }>
  /**
   * When delegated is false, append this string to the LLM user message
   * before the question so the model has extra structured context.
   */
  augmentContext?: string
  /** ID of the shape that produced this result (for debug / eval logging). */
  shapeId: string
  /** Human-readable notes about what was parsed (for eval / debug). */
  parsedNotes?: string
}

// ── Shape interface ──────────────────────────────────────────────────────────

export interface QuestionShape<TParsed = unknown> {
  /** Unique identifier (used in debug.matchedShapes). */
  id: string
  /** One-line description of what this shape handles. */
  description: string
  /**
   * Tie-breaking priority: when multiple shapes match, higher value wins and
   * is invoked first. First shape returning delegated:true short-circuits.
   */
  priority: number
  /** Cheap regex/heuristic check — must be synchronous and fast. */
  matches(ctx: ShapeContext): boolean
  /** Extract structured slots from the question. Always returns something — use a "parseOk" flag if parse fails. */
  canonicalize(ctx: ShapeContext): TParsed
  /** Produce an answer or add context. May be async (e.g., R2 lookups). */
  handle(parsed: TParsed, ctx: ShapeContext): Promise<HandlerResult>
}

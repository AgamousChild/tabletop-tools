/**
 * Shared types for the /ask eval pipeline.
 *
 * Pipeline stages:
 *   harvest.ts → questions.jsonl (HarvestedQuestion[])
 *   run.ts     → answers.jsonl   (AskRun[])
 *   grade.ts   → grades.jsonl    (Grade[])
 *   aggregate.ts prints the report.
 *
 * Each row is one JSON object. All stages are idempotent and skip work
 * that's already been done based on the question id.
 */

export interface HarvestedQuestion {
  /** Reddit post id, e.g. "1kx8z9". Stable primary key. */
  id: string
  subreddit: string
  title: string
  /** Post body (selftext). May be empty for link posts. */
  body: string
  /** Reddit flair when present — a strong signal of intent. */
  flair?: string
  createdAtIso: string
  permalink: string
  numComments: number
  /** The full text we feed to /ask — usually title + body concatenated. */
  question: string
}

/**
 * The full /ask response object plus timing. All eval judgment happens
 * from these fields alone — the grader doesn't re-query brain state.
 */
export interface AskRun {
  questionId: string
  /** Copy of the question so grade.ts is self-contained. */
  question: string
  subreddit: string
  durationMs: number
  ok: boolean
  error?: string
  /** Full /ask response object as JSON. */
  response?: AskResponse
}

export interface AskResponse {
  answer?: string
  answerPath?: string
  contextLength?: number
  detected?: {
    factions: string[]
    strippedQuery: string
    keywords: string[]
  }
  reference?: Array<{
    id: string
    title: string
    category: string
    factionId?: string
    edition?: string
  }>
  sources?: Array<{ id: string; title: string; category: string }>
  connectedCount?: number
  connectedIds?: string[]
  webSources?: Array<{ title: string; url?: string; uri?: string }>
  webSource?: string | null
  geminiCached?: boolean
  cached?: boolean
  cacheKey?: string
  edition?: string
  fallback?: boolean
  fallbackFrom?: string
  errors?: Record<string, string>
  debug?: {
    retrieveResultCount?: number
    connectedCount2?: number
    geminiAnswerLen?: number
    brainContextLen?: number
    curator?: { pooled: number; kept: number; dropped: number; webKept: boolean; topScore: number }
    grounding?: {
      totalLinks?: number
      inRetrievedSet?: number
      viaKeywordFallback?: number
      ungrounded?: number
      ungroundedIds?: string[]
    }
    confidenceGate?: { triggered: boolean; topScore: number; keptCount: number }
  }
}

/**
 * A structured diagnostic per question. Most dimensions are deterministic
 * — they're extracted from the AskResponse without an LLM. `judged`
 * fields are the (optional) LLM-assisted semantic checks that catch what
 * inspection can't (hallucination, entity attribution, adherence).
 */
export interface Grade {
  questionId: string
  question: string
  subreddit: string

  // Deterministic dimensions ────────────────────────────────────────────
  ok: boolean
  answerBytes: number
  refsCount: number
  sourcesCount: number
  connectedCount: number
  webSourcesCount: number
  factionsDetected: number
  factionsList: string[]

  /** `answer` came from brain OR from web-only? */
  provenance: 'brain-primary' | 'web-only' | 'mixed' | 'no-answer'
  /** Answer prefaced with the web-only disclaimer (from our prompt). */
  answerDeclaredWebOnly: boolean

  /** Cube dispatch fired for this question. Reads context length + shape. */
  cubeDispatched: boolean

  /** Should the cube have dispatched (question is count/enumeration-shape)? */
  shouldCubeDispatch: boolean

  /** LaTeX bleed in answer — the client can't render it. */
  hasLatexBleed: boolean

  /** Answer explicitly said "I don't have this" or similar (confidence-gate bypass). */
  answerAdmittedNoData: boolean

  /** Timing */
  durationMs: number

  // LLM-judged dimensions (optional) ────────────────────────────────────
  judged?: JudgedFields

  // Failure summary for aggregation ─────────────────────────────────────
  failureModes: string[]
}

export interface JudgedFields {
  /** Named 40K entities the answer mentioned. Extracted by the judge. */
  namedEntities: string[]
  /** Entities that don't appear in the provided reference set or the
   *  web sources. If populated, the answer likely hallucinated. */
  hallucinatedEntities: string[]
  /** Does the answer address the actual question, or drift? 1-5. */
  relevanceScore: number
  /** Judge's freeform diagnosis of what went wrong (or "ok" if clean). */
  diagnosis: string
}

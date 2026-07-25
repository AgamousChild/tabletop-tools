/**
 * Curator — the "organizing/formulating" step in /ask.
 *
 * Before: brain-retrieval output was concatenated with an extra "WEB SEARCH
 * RESULTS" block from Gemini and both were pasted into the LLM prompt. The
 * LLM often preferred Gemini's phrasing (a hallucination surface disguised
 * as authority — cf. "45 vs 40 terrain layouts" incident 2026-07-24).
 *
 * After: both brain and Gemini feed a unified snippet pool. A rule-based
 * curator ranks, dedupes, and decides what makes the cut. Brain is
 * authoritative for 40K rules — it gets a score boost. Gemini snippets are
 * only kept when they add signal the brain doesn't already cover.
 *
 * The curator is deterministic (no LLM in the loop) so it's cheap, fast,
 * and predictable. If nuance-heavy questions later show curator misses, we
 * can upgrade to an LLM-based curator (a small cheap model doing "pick top
 * N snippets for this question") without changing the interface.
 */
import { buildSourceAttribution } from './format'
import type { Node } from './model'

/** A single unit of retrieved evidence — brain node OR web-search snippet. */
export interface Snippet {
  /** Provenance — determines default scoring + priority. */
  origin: 'brain' | 'web'
  /** Stable id (brain node id for brain, url or hash for web). */
  id: string
  /** Display title. */
  title: string
  /** The body text the LLM will read. Kept whole; the curator picks IN/OUT, not TRIM. */
  text: string
  /** Relevance score in [0, 1]. Brain: retrieval score. Web: heuristic. */
  score: number
  /** Source attribution the LLM should cite (goes in prompt after body). */
  citation: string
  /** Category / bucket for provenance grouping in the prompt. Optional. */
  bucket?: string
}

/**
 * Convert brain Node arrays into Snippet form.
 *
 * Primary nodes get their retrieval score directly. Connected nodes get a
 * dampened score (they came in via graph expansion, not direct match). Both
 * share the same brain-origin priority — the curator boosts brain over web
 * in a separate step.
 */
export function brainNodesToSnippets(
  primaryNodes: Node[],
  connectedNodes: Node[],
  primaryScores?: Map<string, number>,
): Snippet[] {
  const out: Snippet[] = []
  for (const node of primaryNodes) {
    const score = primaryScores?.get(node.id) ?? 0.75
    out.push({
      origin: 'brain',
      id: node.id,
      title: node.title,
      text: node.content ?? '',
      score,
      citation: buildSourceAttribution(node),
      bucket: `${node.layer}/${node.category}`,
    })
  }
  for (const node of connectedNodes) {
    out.push({
      origin: 'brain',
      id: node.id,
      title: node.title,
      text: node.content ?? '',
      score: 0.45, // connected nodes are supporting context, not primary hits
      citation: buildSourceAttribution(node),
      bucket: `${node.layer}/${node.category}`,
    })
  }
  return out
}

export interface WebSource {
  url: string
  title?: string
}

/**
 * Convert a Gemini web-search result into snippet form.
 *
 * Gemini returns one prose block plus a list of source URLs. We treat the
 * whole block as ONE snippet — that lets the curator make an atomic
 * IN/OUT decision on the web contribution. Score is a base 0.35 so brain
 * nodes with any real retrieval hit will out-rank it; brain gets to lead.
 */
export function geminiToSnippet(
  answer: string,
  sources: WebSource[] | undefined,
  hasStrongBrainHits: boolean,
): Snippet | null {
  const text = (answer ?? '').trim()
  if (text.length === 0) return null
  // If brain has zero strong hits (retrieval score < 0.5 across the board),
  // bump the web snippet up so the LLM has SOMETHING to work with.
  // Otherwise cap it below the brain-connected default (0.45) so brain wins.
  const score = hasStrongBrainHits ? 0.35 : 0.55
  const citationParts: string[] = ['Web search (Gemini with Google Search)']
  const urls = (sources ?? [])
    .slice(0, 3)
    .map((s) => s.url)
    .filter(Boolean)
  if (urls.length > 0) citationParts.push(`URLs: ${urls.join(', ')}`)
  return {
    origin: 'web',
    id: 'web:gemini',
    title: 'Web search context',
    text,
    score,
    citation: citationParts.join(' — '),
    bucket: 'web',
  }
}

/**
 * Curator options — knobs the caller can tune. Keep defaults sane for /ask.
 */
export interface CurateOptions {
  /** Max snippets to keep after ranking + dedupe. Default 20. */
  maxSnippets?: number
  /** Max total chars across kept snippets. Default 120_000. */
  maxChars?: number
  /** Below this score, drop the snippet regardless of ranking. Default 0.15. */
  minScore?: number
}

export interface CurateResult {
  kept: Snippet[]
  /** IDs dropped for capacity / low score. Reported for debug. */
  droppedIds: string[]
  /** True if the web snippet made the cut (helps /ask log/telemetry). */
  webKept: boolean
}

/**
 * Curate the pooled snippets. Rank by score, dedupe near-identical text,
 * enforce the score floor + snippet-count + char-count caps.
 *
 * Brain origin does NOT get an artificial boost here — the boost is
 * expressed at the snippet-construction side (brain snippets start higher
 * on average). Keeps the ranking transparent.
 */
export function curateSnippets(pool: Snippet[], opts: CurateOptions = {}): CurateResult {
  const maxSnippets = opts.maxSnippets ?? 20
  const maxChars = opts.maxChars ?? 120_000
  const minScore = opts.minScore ?? 0.15

  const droppedIds: string[] = []
  const sorted = [...pool].sort((a, b) => b.score - a.score)

  // Dedupe pass: if two snippets share >70% of significant tokens, keep the
  // higher-scored one. Cheap word-set overlap — good enough for the
  // "brain and Gemini said the same thing" case without regex-heavy NLP.
  const kept: Snippet[] = []
  for (const cand of sorted) {
    if (cand.score < minScore) {
      droppedIds.push(cand.id)
      continue
    }
    const candTokens = significantTokens(cand.text)
    if (candTokens.size === 0) {
      // Zero-content snippet — skip unless it's the only thing we have.
      droppedIds.push(cand.id)
      continue
    }
    let dupOfIndex = -1
    for (let i = 0; i < kept.length; i++) {
      const overlap = jaccard(candTokens, significantTokens(kept[i]!.text))
      if (overlap > 0.7) {
        dupOfIndex = i
        break
      }
    }
    if (dupOfIndex >= 0) {
      droppedIds.push(cand.id) // sorted DESC so kept[i] already >= cand
      continue
    }
    kept.push(cand)
    if (kept.length >= maxSnippets) break
  }

  // Char budget enforcement — keep top-scored until budget runs out.
  const budgeted: Snippet[] = []
  let usedChars = 0
  for (const s of kept) {
    const cost = s.text.length + s.title.length + s.citation.length + 20
    if (usedChars + cost > maxChars) {
      droppedIds.push(s.id)
      continue
    }
    budgeted.push(s)
    usedChars += cost
  }

  const webKept = budgeted.some((s) => s.origin === 'web')
  return { kept: budgeted, droppedIds, webKept }
}

/**
 * Format a curated snippet list into the LLM prompt block. Snippets are
 * self-labeled with origin + citation so the LLM can weigh brain vs web
 * without an ambient "WEB SEARCH RESULTS" section-header inviting the
 * "trust web as authority" failure.
 */
export function snippetsToPromptText(snippets: Snippet[]): string {
  const parts: string[] = []
  for (const s of snippets) {
    parts.push(`### ${s.title} [${s.origin}${s.bucket ? '/' + s.bucket : ''}]`)
    parts.push(s.text)
    if (s.citation) parts.push(`(${s.citation})`)
    parts.push('')
  }
  return parts.join('\n')
}

// ── helpers ─────────────────────────────────────────────────────────────────

const STOP_TOKENS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'of',
  'to',
  'in',
  'for',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'on',
  'at',
  'by',
  'with',
  'that',
  'this',
  'it',
  'its',
  'as',
  'from',
  'has',
  'have',
  'had',
  'do',
  'does',
  'did',
  'not',
  'if',
  'then',
  'so',
  'than',
  'but',
  'can',
  'may',
  'will',
  'would',
  'should',
  'could',
  'you',
  'your',
  'their',
  'they',
  'them',
  'his',
  'her',
  'he',
  'she',
  'we',
  'us',
  'our',
  'i',
  'me',
  'my',
])

function significantTokens(text: string): Set<string> {
  const t = (text ?? '').toLowerCase()
  const words = t.split(/[^a-z0-9]+/g).filter((w) => w.length > 2 && !STOP_TOKENS.has(w))
  return new Set(words)
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let intersect = 0
  for (const w of a) if (b.has(w)) intersect++
  const union = a.size + b.size - intersect
  return union === 0 ? 0 : intersect / union
}

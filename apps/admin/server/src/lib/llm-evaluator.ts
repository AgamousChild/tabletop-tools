/**
 * Crosswalk LLM evaluator (Phase 1.4 step 10f).
 *
 * Given a candidate + the brain node + current and proposed entities, asks an
 * LLM to APPROVE / REJECT / UNSURE the proposed re-key. Used by the admin
 * `crosswalk.runLlmEvaluator` endpoint to scale validation beyond per-row
 * human clicks.
 *
 * Prompt leans on match_method + confidence as primary signal (DEF-008 fix
 * from the v1 review): if those say it's confident, the LLM is told to
 * APPROVE unless there's an obvious mismatch (type differs, name + faction
 * don't match).
 *
 * @see docs/superpowers/plans/2026-05-30-step-10-validation-process.md
 */

import type { AiBinding } from '../trpc.js'

const DEFAULT_MODEL = '@cf/meta/llama-3-8b-instruct'

export interface LlmEvalInput {
  brainNode: { id: string; title?: string; category?: string; excerpt?: string }
  candidate: {
    proposedCanonicalId: string
    matchMethod: 'datasheet_id' | 'name_faction' | 'manual' | 'llm'
    confidence: number
    source: string
  }
  currentEntity: { id: string; type: string; name: string; factionId?: string | null } | null
  proposedEntity: { id: string; type: string; name: string; factionId?: string | null }
}

export type LlmDecision = 'APPROVE' | 'REJECT' | 'UNSURE'

export interface LlmEvalResult {
  decision: LlmDecision
  reason: string
  rawResponse: string
}

export function buildPrompt(input: LlmEvalInput): string {
  const { brainNode, candidate, currentEntity, proposedEntity } = input
  const currentBlock = currentEntity
    ? `CURRENT link (active):
  canonical id: ${currentEntity.id}
  type:         ${currentEntity.type}
  name:         ${currentEntity.name}
  faction:      ${currentEntity.factionId ?? '(none)'}`
    : 'CURRENT link: (none — this is a first-time link)'

  return `You are validating a proposed change to a content crosswalk that maps a brain knowledge note to a canonical game-content entity.

Brain note:
  id:       ${brainNode.id}
  title:    ${brainNode.title ?? '(no title)'}
  category: ${brainNode.category ?? '(no category)'}
  excerpt:  ${(brainNode.excerpt ?? '').slice(0, 800)}

${currentBlock}

PROPOSED new link:
  canonical id: ${proposedEntity.id}
  type:         ${proposedEntity.type}
  name:         ${proposedEntity.name}
  faction:      ${proposedEntity.factionId ?? '(none)'}

Match signal:
  method:     ${candidate.matchMethod}
  confidence: ${candidate.confidence}
  proposer:   ${candidate.source}

Decision rules (apply in order):
- If the proposed type differs from the current type (when there is a current link), REJECT — content entities of different types should not be re-keyed across each other.
- If match_method is 'datasheet_id' AND types match AND confidence >= 0.95, APPROVE unless an obvious mismatch is visible in name/faction.
- If proposed name + faction are identical to the current's (when there is a current link) AND types match, APPROVE.
- If the brain note title or category clearly aligns with the proposed entity's name and type, APPROVE.
- If signals conflict or you genuinely cannot tell, say UNSURE — that's better than guessing.

Answer with EXACTLY ONE line in this format:
APPROVE - <one-line reason>
or
REJECT - <one-line reason>
or
UNSURE - <one-line reason>`
}

export function parseResponse(rawResponse: string): LlmEvalResult {
  const trimmed = rawResponse.trim()
  const match = /^(APPROVE|REJECT|UNSURE)\s*[-–:]\s*(.+)$/im.exec(trimmed)
  if (match) {
    return {
      decision: match[1].toUpperCase() as LlmDecision,
      reason: match[2].trim().slice(0, 500),
      rawResponse: trimmed,
    }
  }
  // Fall back: look for the keyword anywhere in the response
  const fallback = /\b(APPROVE|REJECT|UNSURE)\b/i.exec(trimmed)
  if (fallback) {
    return {
      decision: fallback[1].toUpperCase() as LlmDecision,
      reason: `(unparseable response; keyword detected) ${trimmed.slice(0, 200)}`,
      rawResponse: trimmed,
    }
  }
  return {
    decision: 'UNSURE',
    reason: `(malformed response: ${trimmed.slice(0, 200)})`,
    rawResponse: trimmed,
  }
}

export async function evaluateCandidate(
  ai: AiBinding,
  input: LlmEvalInput,
  model = DEFAULT_MODEL,
): Promise<LlmEvalResult> {
  const prompt = buildPrompt(input)
  const result = await ai.run(model, {
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 200,
  })
  return parseResponse(result.response)
}

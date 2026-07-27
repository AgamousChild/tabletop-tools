/**
 * grade.ts — Extract structural diagnostic dimensions from each /ask
 * response so we can spot systemic failure modes across the batch.
 *
 * Usage:
 *   npx tsx scripts/eval-ask/grade.ts [--in=path.jsonl] [--out=path.jsonl]
 *
 * Currently 100% deterministic (no LLM). Every field is derived from the
 * /ask response object. Failure modes are named strings that aggregate.ts
 * can histogram. Reserved: an optional LLM-judged pass (via `claude -p`)
 * lands as a follow-on layer once we know which questions need it.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'

import type { AskRun, Grade } from './types'

// Question shapes that SHOULD trigger the cube-dispatch path. Mirrors the
// patterns in apps/brain/server/src/lib/count-parser.ts. Kept as a copy so
// this eval doesn't depend on Worker code (and can spot dispatch misses
// when the two lists drift).
const COUNT_SHAPE_PATTERNS = [
  /^\s*how\s+many\b/i,
  /^\s*count\s+(?:of|the)\b/i,
  /^\s*number\s+of\b/i,
  /^\s*list\s+(?:all\s+of\s+the|all|every|each)\b/i,
  /^\s*table\s+of\b/i,
  /\bgive\s+me\s+a\s+(?:list|table|count|breakdown)\b/i,
  /\bhow\s+(?:can|do|to)\s+(?:i|you|we|they|it|units?|models?)?\s*(?:get|give|gain|grant|generate|apply|inflict|cause)\b/i,
  /\bhow\s+(?:can|does?)\s+(?:you|one|a\s+player|a\s+unit|any\s+unit)\b.*\b(?:get|gain|have|receive)\b/i,
  /\b(?:what|which)\s+(?:units?|models?|weapons?|datasheets?|characters?|stratagems?|enhancements?)\s+(?:have|has|get|gain|come\s+with|carry|grant|give)\b/i,
  /\bwho\s+(?:has|have|gets|carries|grants|gives)\b/i,
  /\bways?\s+to\s+(?:get|give|grant|gain|apply|inflict)\b/i,
  /\bsources?\s+of\b/i,
]

const LATEX_BLEED_PATTERN = /\\\[|\\\(|\\begin\{|\\binom\{|\\times\b|\\frac\{|\$\$/

const NO_DATA_PATTERN =
  /\b(don'?t have|no matching content|isn'?t covered|not covered|no information|no data|no results|couldn'?t find)\b/i

const WEB_ONLY_DISCLAIMER = /\bbrain has no matching content\b/i

function loadJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return []
  const text = readFileSync(path, 'utf-8').trim()
  if (!text) return []
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T)
}

function gradeRun(run: AskRun): Grade {
  const failureModes: string[] = []

  // Handle transport failures separately so aggregate sees them.
  if (!run.ok || !run.response) {
    failureModes.push('ask-request-failed')
    return {
      questionId: run.questionId,
      question: run.question,
      subreddit: run.subreddit,
      ok: false,
      answerBytes: 0,
      refsCount: 0,
      sourcesCount: 0,
      connectedCount: 0,
      webSourcesCount: 0,
      factionsDetected: 0,
      factionsList: [],
      provenance: 'no-answer',
      answerDeclaredWebOnly: false,
      cubeDispatched: false,
      shouldCubeDispatch: COUNT_SHAPE_PATTERNS.some((p) => p.test(run.question)),
      hasLatexBleed: false,
      answerAdmittedNoData: false,
      durationMs: run.durationMs,
      failureModes,
    }
  }

  const r = run.response
  const answer = r.answer ?? ''
  const refs = r.reference ?? []
  const sources = r.sources ?? []
  const webSources = r.webSources ?? []
  const factions = r.detected?.factions ?? []
  const brainCtxLen = r.debug?.brainContextLen ?? 0
  const geminiLen = r.debug?.geminiAnswerLen ?? 0

  // Cube dispatched? Prefer the explicit debug flag when the response
  // provides it; fall back to shape inference for older responses that
  // predate the flag.
  const contextLen = r.contextLength ?? 0
  const cubeDispatched =
    r.debug?.cubeDispatched ??
    (contextLen > geminiLen + brainCtxLen + 500 &&
      (COUNT_SHAPE_PATTERNS.some((p) => p.test(run.question)) || factions.length > 0))
  // Reserved for future dimensional split (cubeRefs count vs vectorize refs).
  const _cubeRefsCount = r.cubeRefs?.length ?? r.debug?.cubeRefsCount ?? 0
  void _cubeRefsCount

  // Provenance: brain contribution counts as EITHER (a) reference nodes from
  // Vectorize retrieval / unit-name inference, OR (b) cube dispatch feeding
  // deterministic data into the LLM context. Cube data doesn't populate
  // reference[] but is still authoritative brain output — earlier grader
  // mis-classified 93 cube-dispatched answers as web-only.
  const hasBrainContribution = refs.length > 0 || cubeDispatched
  let provenance: Grade['provenance']
  if (!answer.trim()) provenance = 'no-answer'
  else if (hasBrainContribution && webSources.length > 0) provenance = 'mixed'
  else if (hasBrainContribution) provenance = 'brain-primary'
  else if (webSources.length > 0) provenance = 'web-only'
  else provenance = 'no-answer'

  const shouldCubeDispatch = COUNT_SHAPE_PATTERNS.some((p) => p.test(run.question))

  const hasLatexBleed = LATEX_BLEED_PATTERN.test(answer)
  const answerAdmittedNoData = NO_DATA_PATTERN.test(answer)
  const answerDeclaredWebOnly = WEB_ONLY_DISCLAIMER.test(answer)

  // Failure modes — each contributes to the aggregate heatmap.
  if (provenance === 'web-only' && !answerDeclaredWebOnly && !answerAdmittedNoData) {
    // The bug Micah flagged: brain-source lie when the answer is
    // actually pure web-search chatter.
    failureModes.push('web-only-without-disclaimer')
  }
  if (factions.length === 0 && refs.length === 0) {
    failureModes.push('no-faction-no-refs')
  }
  if (shouldCubeDispatch && !cubeDispatched) {
    failureModes.push('cube-dispatch-missed')
  }
  if (hasLatexBleed) {
    failureModes.push('latex-bleed')
  }
  if (r.debug?.confidenceGate?.triggered) {
    failureModes.push('confidence-gate-triggered')
  }
  if (answer.length > 3000) {
    failureModes.push('answer-too-long')
  }
  if (answer.length > 0 && answer.length < 150) {
    failureModes.push('answer-too-short')
  }
  // Faction-inference reach: did the query mention unit-like tokens but
  // detection still came back empty? Weak proxy — a capitalised multi-word
  // proper-noun-shaped token in the query without a faction hint.
  const looksLikeUnitMention = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/.test(run.question)
  if (factions.length === 0 && looksLikeUnitMention) {
    failureModes.push('faction-inference-miss')
  }
  if (run.durationMs > 20000) {
    failureModes.push('slow-response')
  }
  if (refs.length === 0 && webSources.length === 0 && !answerAdmittedNoData) {
    failureModes.push('answer-from-nothing')
  }

  return {
    questionId: run.questionId,
    question: run.question,
    subreddit: run.subreddit,
    ok: true,
    answerBytes: answer.length,
    refsCount: refs.length,
    sourcesCount: sources.length,
    connectedCount: r.connectedCount ?? 0,
    webSourcesCount: webSources.length,
    factionsDetected: factions.length,
    factionsList: factions,
    provenance,
    answerDeclaredWebOnly,
    cubeDispatched,
    shouldCubeDispatch,
    hasLatexBleed,
    answerAdmittedNoData,
    durationMs: run.durationMs,
    failureModes,
  }
}

function main(): void {
  const args = new Map<string, string>()
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/)
    if (m) args.set(m[1]!, m[2]!)
  }
  const inPath = args.get('in') ?? 'scripts/eval-ask/.data/answers.jsonl'
  const outPath = args.get('out') ?? 'scripts/eval-ask/.data/grades.jsonl'
  mkdirSync(dirname(outPath), { recursive: true })

  const runs = loadJsonl<AskRun>(inPath)
  console.log(`Grading ${runs.length} runs from ${inPath}`)

  const grades = runs.map(gradeRun)
  writeFileSync(outPath, grades.map((g) => JSON.stringify(g)).join('\n') + '\n')

  console.log(`Wrote ${grades.length} grades → ${outPath}`)
  console.log('Next: npx tsx scripts/eval-ask/aggregate.ts')
}

main()

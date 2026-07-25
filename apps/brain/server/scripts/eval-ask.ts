/**
 * Eval harness: fire a fixed set of 40K questions through prod `/ask` against
 * each candidate model, capture answers + latency + source counts, and dump a
 * side-by-side comparison. Uses the AI Gateway route (`?model=<provider/name>`)
 * so cost per call also lands in the CF Gateway dashboard for the same window.
 *
 * Runs against prod (https://tabletop-tools.net/brain/api/ask). Read-only from
 * the platform's perspective — no writes.
 *
 * Usage from apps/brain/server:
 *   pnpm exec tsx scripts/eval-ask.ts
 *   pnpm exec tsx scripts/eval-ask.ts --questions 3    # limit to first 3 questions
 *   pnpm exec tsx scripts/eval-ask.ts --models anthropic/claude-sonnet-5,workers-ai/@cf/openai/gpt-oss-120b
 *
 * Outputs:
 *   .local/eval-ask/<ISO_TS>/results.csv         — one row per (model, question)
 *   .local/eval-ask/<ISO_TS>/<slug>__q<N>.md     — full answer per (model, question)
 *   .local/eval-ask/<ISO_TS>/summary.md          — model × question matrix, latency + link
 *
 * Per Rule 4, the work lives in `runEval()` so a caller (script, endpoint,
 * follow-up harness) can drive it programmatically.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ASK_URL = 'https://tabletop-tools.net/brain/api/ask'

const DEFAULT_MODELS = [
  // Frontier paid (BYOK via CF Gateway)
  'anthropic/claude-fable-5',
  'anthropic/claude-opus-5',
  'anthropic/claude-sonnet-5',
  'anthropic/claude-haiku-4.5',
  'google-ai-studio/gemini-3.6-flash',
  'google-ai-studio/gemini-3.1-pro',
  // Free CF-hosted
  'workers-ai/@cf/openai/gpt-oss-120b',
  'workers-ai/@cf/zai-org/glm-5.2',
  'workers-ai/@cf/moonshotai/kimi-k2.7-code',
  'workers-ai/@cf/google/gemma-4-26b-a4b-it',
  // Incumbent baseline
  'workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast',
]

const DEFAULT_QUESTIONS = [
  // Rules interpretation
  'How does Oath of Moment work?',
  // Mission cards (new 11e content — tests July 2026 ingest)
  'What is the Meatgrinder primary mission?',
  // Matchup tactics (tests both-side retrieval)
  'How do World Eaters beat Orks?',
  // Terrain layout question (tests July 2026 Event Companion ingest)
  'What terrain layouts are used when Take and Hold faces Purge the Foe?',
  // Faction ability
  'Explain the Waaagh! rule for Orks.',
  // Unit points (tests MFM v1.1 ingest)
  'How much does a 10-model Necron Warriors unit cost in points?',
  // Attach relationships (tests can_lead graph)
  'Which units can be led by a Space Marine Captain in Terminator Armour?',
  // Detachment rules
  'How does the Butchers of Khorne detachment work for World Eaters?',
  // Enhancement comparison (tests recall + comparison)
  'Compare the Necron Cursed Legion Murdermind enhancement to Pantheon of Woe Reletavistic Tether.',
  // Rules change / balance (tests historical vs current)
  'What changed in stratagem usage rules in the July 2026 Universal Rules Updates?',
]

interface AskResult {
  model: string
  questionIdx: number
  question: string
  httpStatus: number
  latencyMs: number
  answer: string
  answerLen: number
  sourceCount: number
  answerPath?: string
  errorReason?: string
}

async function ask(model: string, question: string, timeoutMs = 120_000): Promise<AskResult> {
  const start = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const url = new URL(ASK_URL)
    url.searchParams.set('model', model)
    const resp = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
      signal: controller.signal,
    })
    const latencyMs = Date.now() - start
    const text = await resp.text()
    let answer = ''
    let sourceCount = 0
    let answerPath: string | undefined
    let errorReason: string | undefined
    if (resp.ok) {
      try {
        const data = JSON.parse(text) as {
          answer?: string
          answerPath?: string
          sources?: Array<unknown>
        }
        answer = data.answer ?? ''
        sourceCount = data.sources?.length ?? 0
        answerPath = data.answerPath
      } catch {
        errorReason = 'json_parse_failed'
        answer = text.slice(0, 400)
      }
    } else {
      errorReason = `http_${resp.status}`
      answer = text.slice(0, 400)
    }
    return {
      model,
      questionIdx: -1, // caller sets
      question,
      httpStatus: resp.status,
      latencyMs,
      answer,
      answerLen: answer.length,
      sourceCount,
      answerPath,
      errorReason,
    }
  } catch (err) {
    return {
      model,
      questionIdx: -1,
      question,
      httpStatus: 0,
      latencyMs: Date.now() - start,
      answer: '',
      answerLen: 0,
      sourceCount: 0,
      errorReason: err instanceof Error ? err.message : String(err),
    }
  } finally {
    clearTimeout(timeout)
  }
}

function slugify(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '')
}

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function csvRow(r: AskResult): string {
  return [
    r.model,
    String(r.questionIdx + 1),
    csvEscape(r.question),
    String(r.httpStatus),
    String(r.latencyMs),
    String(r.answerLen),
    String(r.sourceCount),
    r.answerPath ?? '',
    r.errorReason ?? '',
    csvEscape(r.answer.slice(0, 200).replace(/\n/g, ' ')),
  ].join(',')
}

function formatMd(r: AskResult): string {
  return [
    `# ${r.model}`,
    '',
    `**Question ${r.questionIdx + 1}:** ${r.question}`,
    '',
    `- HTTP: ${r.httpStatus}`,
    `- Latency: ${r.latencyMs} ms`,
    `- Answer length: ${r.answerLen} chars`,
    `- Sources returned: ${r.sourceCount}`,
    `- Answer path: ${r.answerPath ?? '(none)'}`,
    r.errorReason ? `- Error: ${r.errorReason}` : '',
    '',
    '---',
    '',
    r.answer || '_(empty)_',
    '',
  ]
    .filter((l) => l !== null)
    .join('\n')
}

interface RunEvalOptions {
  models?: string[]
  questions?: string[]
  outDir?: string
  timeoutMs?: number
}

export async function runEval(
  opts: RunEvalOptions = {},
): Promise<{ outDir: string; results: AskResult[] }> {
  const models = opts.models ?? DEFAULT_MODELS
  const questions = opts.questions ?? DEFAULT_QUESTIONS
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const outDir = opts.outDir ?? resolve(`.local/eval-ask/${stamp}`)
  mkdirSync(outDir, { recursive: true })

  console.log(
    `[eval-ask] ${models.length} models × ${questions.length} questions = ${models.length * questions.length} calls`,
  )
  console.log(`[eval-ask] outDir: ${outDir}`)

  const results: AskResult[] = []
  const csvRows = [
    'model,question_idx,question,http_status,latency_ms,answer_len,source_count,answer_path,error,answer_preview',
  ]

  for (let qi = 0; qi < questions.length; qi++) {
    const q = questions[qi]!
    for (const model of models) {
      process.stdout.write(`  [q${qi + 1}/${questions.length}] ${model.padEnd(50)} ... `)
      const r = await ask(model, q, opts.timeoutMs)
      r.questionIdx = qi
      results.push(r)
      const status = r.errorReason
        ? `FAIL(${r.errorReason})`
        : `OK ${r.latencyMs}ms ${r.answerLen}c ${r.sourceCount}src`
      console.log(status)
      csvRows.push(csvRow(r))
      writeFileSync(resolve(outDir, `${slugify(model)}__q${qi + 1}.md`), formatMd(r))
    }
  }

  writeFileSync(resolve(outDir, 'results.csv'), csvRows.join('\n'))

  // Summary: latency matrix + link map
  const summary: string[] = [
    '# Eval summary',
    '',
    `${models.length} models × ${questions.length} questions`,
    '',
  ]
  summary.push('## Latency (ms) — rows = model, columns = question')
  summary.push('| model | ' + questions.map((_, i) => `q${i + 1}`).join(' | ') + ' | avg |')
  summary.push(
    '| ' +
      Array(questions.length + 2)
        .fill('---')
        .join(' | ') +
      ' |',
  )
  for (const m of models) {
    const rows = results.filter((r) => r.model === m).sort((a, b) => a.questionIdx - b.questionIdx)
    const cells = rows.map((r) => (r.errorReason ? 'FAIL' : String(r.latencyMs)))
    const okLatencies = rows.filter((r) => !r.errorReason).map((r) => r.latencyMs)
    const avg =
      okLatencies.length > 0
        ? Math.round(okLatencies.reduce((a, b) => a + b, 0) / okLatencies.length)
        : 0
    summary.push(`| ${m} | ${cells.join(' | ')} | ${avg} |`)
  }
  summary.push('')
  summary.push('## Answer length (chars)')
  summary.push('| model | ' + questions.map((_, i) => `q${i + 1}`).join(' | ') + ' |')
  summary.push(
    '| ' +
      Array(questions.length + 1)
        .fill('---')
        .join(' | ') +
      ' |',
  )
  for (const m of models) {
    const rows = results.filter((r) => r.model === m).sort((a, b) => a.questionIdx - b.questionIdx)
    const cells = rows.map((r) => (r.errorReason ? '—' : String(r.answerLen)))
    summary.push(`| ${m} | ${cells.join(' | ')} |`)
  }
  summary.push('')
  summary.push('## Errors')
  const errors = results.filter((r) => r.errorReason)
  if (errors.length === 0) {
    summary.push('_(none)_')
  } else {
    for (const e of errors) {
      summary.push(`- **${e.model}** q${e.questionIdx + 1}: ${e.errorReason}`)
    }
  }
  writeFileSync(resolve(outDir, 'summary.md'), summary.join('\n'))

  console.log(`\n[eval-ask] done. results: ${outDir}/results.csv, summary: ${outDir}/summary.md`)
  return { outDir, results }
}

// ── CLI wrapper ────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): RunEvalOptions {
  const opts: RunEvalOptions = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--questions') {
      const n = parseInt(argv[++i] ?? '', 10)
      if (Number.isFinite(n) && n > 0) opts.questions = DEFAULT_QUESTIONS.slice(0, n)
    } else if (a === '--models') {
      const list = argv[++i]
      if (list)
        opts.models = list
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
    } else if (a === '--timeout') {
      const n = parseInt(argv[++i] ?? '', 10)
      if (Number.isFinite(n) && n > 0) opts.timeoutMs = n * 1000
    }
  }
  return opts
}

// Always run when invoked as CLI (isMain detection was brittle on Windows).
runEval(parseArgs(process.argv.slice(2))).catch((err) => {
  console.error('[eval-ask] failed:', err)
  process.exit(1)
})
